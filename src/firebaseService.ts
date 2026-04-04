import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, onAuthStateChanged } from './firebase';

export interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  documentMetadata?: any;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp;
}

// Test connection to Firestore
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}

// User Profile Operations
const profileSyncLocks = new Set<string>();

export async function createUserProfile(user: any, name?: string) {
  if (!user) return;
  const uid = user.uid;
  const path = `users/${uid}`;
  
  if (profileSyncLocks.has(uid)) {
    console.log('createUserProfile: Sync already in progress for UID:', uid);
    return;
  }
  
  profileSyncLocks.add(uid);
  
  try {
    // Aggressive wait for auth state and token propagation to Firestore
    // In iframes, there's often a delay between Auth sign-in and Firestore recognizing the token
    console.log('createUserProfile: Starting sync for UID:', uid);
    
    // Force a token refresh on the passed user object to nudge the SDK
    try {
      if (typeof user.getIdToken === 'function') {
        await user.getIdToken(true);
        console.log('createUserProfile: Forced token refresh on passed user object');
      }
    } catch (e) {
      console.warn('createUserProfile: Forced token refresh failed:', e);
    }

    await new Promise((resolve) => {
      const checkAuth = () => {
        const currentAuthUser = auth.currentUser;
        if (currentAuthUser && currentAuthUser.uid === uid) {
          return true;
        }
        return false;
      };

      if (checkAuth()) {
        resolve(auth.currentUser);
        return;
      }

      console.log('createUserProfile: Auth not ready yet, attaching listeners for UID:', uid);

      const unsubs = [];
      const cleanup = () => {
        unsubs.forEach(unsub => unsub());
        clearTimeout(timeoutId);
      };

      const onEvent = (u) => {
        if (u && u.uid === uid) {
          cleanup();
          resolve(u);
        }
      };

      unsubs.push(auth.onAuthStateChanged(onEvent));
      unsubs.push(auth.onIdTokenChanged(onEvent));

      const timeoutId = setTimeout(() => {
        cleanup();
        console.log('createUserProfile: Auth sync timed out after 5s. Current auth.currentUser:', auth.currentUser?.uid);
        resolve(auth.currentUser);
      }, 5000); // Reduced from 10s to 5s
    });

    // Final grace period for internal SDK state propagation
    await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms to 200ms

    if (!auth.currentUser || auth.currentUser.uid !== uid) {
      const errorMsg = `createUserProfile: CRITICAL - Auth state did not sync. Current: ${auth.currentUser?.uid}, Expected: ${uid}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const userDocRef = doc(db, 'users', uid);
    
    // 1. Check Firestore database for user's uid
    let userDoc;
    let retryCount = 0;
    const maxRetries = 2; // Reduced from 3 to 2

    while (retryCount < maxRetries) {
      try {
        console.log(`createUserProfile: Attempting GET (Attempt ${retryCount + 1}). Auth user:`, auth.currentUser?.uid);
        // Try cached getDoc first for speed, fallback to server if it fails or is empty
        userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          // If not in cache, try server once
          userDoc = await getDocFromServer(userDocRef);
        }
        
        console.log('createUserProfile: GET successful. Exists:', userDoc.exists());
        break; 
      } catch (getErr: any) {
        retryCount++;
        const isPermissionError = getErr?.message?.includes('permission') || getErr?.code === 'permission-denied';
        
        if (isPermissionError && retryCount < maxRetries) {
          console.warn(`createUserProfile: Permission denied on attempt ${retryCount}. Retrying in 1s...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2s to 1s
          try { await auth.currentUser?.getIdToken(true); } catch (e) {}
          continue;
        }
        
        console.error('createUserProfile: Failed to check existing profile (GET). Auth user:', auth.currentUser?.uid, getErr);
        handleFirestoreError(getErr, OperationType.GET, path);
        return;
      }
    }
    
    if (userDoc.exists()) {
      console.log('createUserProfile: Returning user, preserving Firestore name');
      return userDoc.data();
    } else {
      // 3. If user document DOES NOT EXIST:
      let finalName = name || '';
      
      // Fallback to Google displayName if no signup name found
      if (!finalName) {
        finalName = user.displayName || 'User';
        console.log('createUserProfile: No existing profile found, using Google name:', finalName);
      }

      const userData = {
        name: finalName,
        email: user.email,
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
        uid: uid,
        role: 'user'
      };
      
      try {
        await setDoc(userDocRef, userData);
        console.log('createUserProfile: Profile created successfully for UID:', uid);
        return userData;
      } catch (setErr) {
        console.error('createUserProfile: Failed to create profile (WRITE):', setErr);
        handleFirestoreError(setErr, OperationType.WRITE, path);
      }
    }
  } catch (error) {
    console.error('createUserProfile: Unexpected error for UID:', uid, error);
    // Only call handleFirestoreError if it hasn't been called by sub-operations
    if (error instanceof Error && !error.message.includes('{"error"')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  } finally {
    profileSyncLocks.delete(uid);
  }
}

export async function getUserProfile(uid: string) {
  const path = `users/${uid}`;
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? userDoc.data() : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updateUserProfile(uid: string, data: any) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Chat Operations
export function subscribeToUserChats(userId: string, callback: (chats: Chat[]) => void) {
  const path = 'chats';
  const q = query(
    collection(db, 'chats'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));
    callback(chats);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function createChat(userId: string, title: string, documentMetadata?: any) {
  const path = 'chats';
  try {
    const docRef = await addDoc(collection(db, 'chats'), {
      userId,
      title,
      documentMetadata: documentMetadata || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateChat(chatId: string, data: Partial<Chat>) {
  const path = `chats/${chatId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteChat(chatId: string) {
  const path = `chats/${chatId}`;
  try {
    await deleteDoc(doc(db, 'chats', chatId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Message Operations
export function subscribeToChatMessages(chatId: string, callback: (messages: Message[]) => void) {
  const path = `chats/${chatId}/messages`;
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
    callback(messages);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function addMessage(chatId: string, role: 'user' | 'assistant', content: string) {
  const path = `chats/${chatId}/messages`;
  try {
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      role,
      content,
      createdAt: serverTimestamp()
    });
    // Update the chat's updatedAt timestamp
    await updateDoc(doc(db, 'chats', chatId), {
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
