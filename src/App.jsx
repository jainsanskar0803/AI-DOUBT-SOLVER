import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { BookOpen, Sparkles, Loader2, Quote, History, X as CloseIcon, LogOut, Plus, Search, Tag } from 'lucide-react';
import UploadPDF from './components/UploadPDF';
import ChatBox from './components/ChatBox';
import AnalysisStats from './components/AnalysisStats';
import QueryHistory from './components/QueryHistory';
import HistoryDetailModal from './components/HistoryDetailModal';
import FilePreviewModal from './components/FilePreviewModal';
import ConfirmModal from './components/ConfirmModal';
import Login from './components/Login';
import { extractText, chunkText, generateEmbeddings, generateQueryEmbedding, retrieveRelevantChunks, retrieveGranularContext, autocorrectQuery, highlightKeywords, rephraseQuery } from './services/ragService';
import { Type } from "@google/genai";
import { withRetry } from './services/apiUtils';
import { Toaster, toast } from 'sonner';
import { 
  auth, 
  db,
  onAuthStateChanged, 
  signOut,
  doc,
  onSnapshot,
  serverTimestamp
} from './firebase';
import { 
  subscribeToUserChats, 
  subscribeToChatMessages, 
  createChat, 
  addMessage, 
  updateChat,
  deleteChat,
  testConnection,
  createUserProfile,
  getUserProfile,
  updateUserProfile
} from './firebaseService';

export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [analyzedFiles, setAnalyzedFiles] = useState([]);
  const [fileDataMap, setFileDataMap] = useState(new Map()); // Map<fileName, {chunks, embeddings, questions}>
  const [chunks, setChunks] = useState([]);
  const [chunkEmbeddings, setChunkEmbeddings] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [starterQuestions, setStarterQuestions] = useState([]); // Array of {fileName, questions}
  const [currentlyAnalyzing, setCurrentlyAnalyzing] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileDataRef = useRef(new Map());

  // Test Connection on Mount
  useEffect(() => {
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    console.log('App: Initializing auth listener...');
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log('App: Auth state changed - User logged in:', user.uid, 'Verified:', user.emailVerified);
        console.log('App: auth.currentUser is:', auth.currentUser?.uid);
        
        if (!user.emailVerified && user.providerData.some(p => p.providerId === 'password')) {
          console.log('App: User not verified, not setting user state.');
          setUser(null);
        } else if (user.emailVerified && localStorage.getItem(`pending_verification_${user.uid}`)) {
          console.log('App: User verified but needs manual login. Signing out...');
          localStorage.removeItem(`pending_verification_${user.uid}`);
          signOut(auth).catch(err => console.error('Sign out error:', err));
          setUser(null);
        } else {
          setUser(user);
          setIsAuthLoading(false); // Set to false here to show dashboard immediately
          
          // Centralized profile creation/update (background sync)
          try {
            await createUserProfile(user);
          } catch (error) {
            console.error('App: Failed to sync user profile:', error);
          }
        }
      } else {
        console.log('App: Auth state changed - No user');
        setUser(null);
        setUserProfile(null);
        setHistory([]);
        setMessages([]);
        setCurrentChatId(null);
        setIsAuthLoading(false); // Ensure loading is false for guest/logged out state
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore User Profile Listener
  useEffect(() => {
    if (!user) return;
    const path = `users/${user.uid}`;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setUserProfile(snapshot.data());
      }
    }, (error) => {
      console.error('App: User profile listener error:', error);
    });
    return () => unsubscribe();
  }, [user]);

  // Firestore History Listener
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToUserChats(user.uid, (chats) => {
      setHistory(chats);
    });
    return () => unsubscribe();
  }, [user]);

  // Load specific chat messages
  useEffect(() => {
    if (!currentChatId || !user) return;
    const unsubscribe = subscribeToChatMessages(currentChatId, (msgs) => {
      setMessages(msgs.map(m => ({
        id: m.id,
        text: m.content,
        sender: m.role === 'user' ? 'user' : 'ai',
        timestamp: m.createdAt?.toDate() || new Date()
      })));
    });
    return () => unsubscribe();
  }, [currentChatId, user]);

  // Auto-save chat state periodically
  useEffect(() => {
    if (!user || !currentChatId || messages.length === 0) return;

    const interval = setInterval(() => {
      saveChatState();
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, [user, currentChatId, messages]);

  const saveChatState = async () => {
    if (!user || !currentChatId || isSaving) return;

    try {
      setIsSaving(true);
      // We update the updatedAt timestamp to indicate activity
      // Messages are already saved individually in handleSendMessage, 
      // but this ensures the chat session itself is marked as active.
      await updateChat(currentChatId, {
        updatedAt: serverTimestamp()
      });
      console.log('Chat auto-saved:', currentChatId);
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewChat = async () => {
    if (!user) return;
    setCurrentChatId(null);
    setMessages([]);
    setSuggestions([]);
    setStarterQuestions([]);
    setStagedFiles([]);
    setAnalyzedFiles([]);
    setIsAnalyzing(false);
    setIsSummarizing(false);
    setIsLoading(false);
    setIsSaving(false);
    setLoadingStep('');
    setAnalysisError(false);
    setCurrentlyAnalyzing(null);
    setSelectedHistoryItem(null);
    setSearchQuery('');
    setIsHistoryDrawerOpen(false);
    setIsHistoryModalOpen(false);
    setIsConfirmOpen(false);
    setConfirmAction(null);
    setConfirmConfig({});
    setIsPreviewOpen(false);
    setPreviewFile(null);
    
    // Explicitly clear the refs and state maps
    fileDataRef.current = new Map();
    setFileDataMap(new Map());
    setChunks([]);
    setChunkEmbeddings([]);
    
    // Clear any temporary analysis states
    if (window.localStorage) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('analysis_') || key.startsWith('chat_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
    
    toast.success('New research session started');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  // Handle file analysis (RAG preparation)
  useEffect(() => {
    const analyzeFiles = async () => {
      if (!analyzedFiles || analyzedFiles.length === 0) {
        fileDataRef.current = new Map();
        setFileDataMap(new Map());
        setChunks([]);
        setChunkEmbeddings([]);
        setStarterQuestions([]);
        return;
      }

      setIsAnalyzing(true);
      setAnalysisError(false);
      
      try {
        const currentMap = fileDataRef.current;
        const newFileDataMap = new Map(currentMap);
        let mapChanged = false;

        // 1. Remove data for files that are no longer in analyzedFiles
        const analyzedFileNames = new Set(analyzedFiles.map(f => f.name));
        for (const fileName of newFileDataMap.keys()) {
          if (!analyzedFileNames.has(fileName)) {
            newFileDataMap.delete(fileName);
            mapChanged = true;
          }
        }

        // 2. Identify and process new files
        const filesToProcess = analyzedFiles.filter(f => !newFileDataMap.has(f.name));
        
        const syncStates = (map) => {
          fileDataRef.current = map;
          setFileDataMap(new Map(map));
          
          const allChunks = [];
          const allEmbeddings = [];
          
          map.forEach((data, name) => {
            allChunks.push(...data.chunks);
            allEmbeddings.push(...data.embeddings);
          });
          
          setChunks(allChunks);
          setChunkEmbeddings(allEmbeddings);
        };

        // If files were removed, sync the flattened states immediately
        if (mapChanged) {
          syncStates(newFileDataMap);
        }

        if (filesToProcess.length > 0) {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
          
          // Process files sequentially to respect rate limits
          const results = [];
          for (const file of filesToProcess) {
            try {
              setCurrentlyAnalyzing(file.name);
              const text = await extractText(file);
              const fileChunks = chunkText(text).map(c => `[Source: ${file.name}]\n${c}`);
              const embeddings = await generateEmbeddings(fileChunks, process.env.GEMINI_API_KEY);
              
              // Generate starter questions for THIS file - reduced to 2 for speed
              const sampleContext = fileChunks.slice(0, 3).join('\n\n');
              const response = await withRetry(() => 
                ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: [{
                    role: 'user',
                    parts: [{
                      text: `Based on "${file.name}", generate 2 diverse starter questions.
                      SNIPPETS:
                      ${sampleContext}
                      Return ONLY a JSON array of 2 strings.`
                    }]
                  }],
                  config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  }
                })
              );
              
              let questions = [];
              try {
                questions = JSON.parse(response.text);
              } catch (parseErr) {
                questions = [
                  `What are the key points in ${file.name}?`,
                  `Analyze the main arguments in ${file.name}.`
                ];
              }
              
              results.push({
                fileName: file.name,
                fileData: {
                  chunks: fileChunks,
                  embeddings: embeddings,
                  questions: questions
                },
                starterQuestions: {
                  fileName: file.name,
                  questions: questions
                }
              });
            } catch (err) {
              console.error(`Error processing file ${file.name}:`, err);
              results.push(null);
            }
          }

          const validResults = results.filter(r => r !== null);
          const newBatchStarterQuestions = validResults.map(r => r.starterQuestions);

          validResults.forEach(r => {
            newFileDataMap.set(r.fileName, r.fileData);
          });

          syncStates(newFileDataMap);
          setStarterQuestions(newBatchStarterQuestions);
        }
      } catch (error) {
        console.error('Error analyzing files:', error);
        setAnalysisError(true);
        setMessages([{
          id: 'system-error',
          text: `❌ Failed to analyze the documents: ${error.message || 'Unknown error'}.`,
          sender: 'ai',
          timestamp: new Date(),
        }]);
      } finally {
        setIsAnalyzing(false);
        setCurrentlyAnalyzing(null);
      }
    };

    analyzeFiles();
  }, [analyzedFiles]);

  const handleConfirmAnalysis = () => {
    setAnalyzedFiles([...stagedFiles]);
  };

  const handleSendMessage = useCallback(async (text) => {
    // Add user message immediately for responsiveness
    const userMessage = {
      id: Date.now().toString(),
      text: text,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setSuggestions([]);
    setStarterQuestions([]);
    setIsLoading(true);
    setLoadingStep('Understanding query...');

    try {
      if (!analyzedFiles || chunks.length === 0) {
        throw new Error('No documents analyzed');
      }

      // RAG: Retrieve relevant chunks using hybrid search
      setLoadingStep('Searching documents...');
      
      // Multi-turn context: Rephrase query based on history
      const standaloneQuery = await rephraseQuery(text, messages, process.env.GEMINI_API_KEY);
      console.log('Standalone query:', standaloneQuery);
      
      const queryEmbedding = await generateQueryEmbedding(standaloneQuery, process.env.GEMINI_API_KEY);
      
      // Use granular retrieval for more precise context
      const relevantContext = await retrieveGranularContext(standaloneQuery, queryEmbedding, chunkEmbeddings, chunks, process.env.GEMINI_API_KEY, 12);
      
      setLoadingStep('Analyzing context...');
      // Map context to indexed sources
      const indexedSources = relevantContext.map((text, index) => ({
        id: (index + 1).toString(),
        text: text
      }));

      // Highlight keywords in context using the rephrased query for better relevance
      const highlightedContext = indexedSources.map(source => {
        const highlightedText = highlightKeywords(source.text, standaloneQuery);
        return `[Source ${source.id}]\n${highlightedText}`;
      });
      const contextText = highlightedContext.join('\n\n---\n\n');

      // Initialize Gemini
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      setLoadingStep('Generating answer...');
      // Call Gemini with RAG context
      const response = await withRetry(() => 
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are an elite research scientist and technical analyst. Your goal is to provide high-fidelity, accurate, and deeply insightful answers based on the provided document context.
                  
                  CONTEXT:
                  ${contextText || 'No relevant sections found.'}
                  
                  CONVERSATION HISTORY:
                  ${messages.slice(-6).map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n')}
                  
                  QUESTION: 
                  ${text}
                  
                  CRITICAL INSTRUCTIONS:
                  1. **Scientific Rigor**: Provide a direct, factual, and high-level technical answer. Synthesize information across multiple sources if available. If the context contains data, cite it specifically using [Source X] notation.
                  2. **Mathematical & Numerical Precision**: If the question involves math, physics, or engineering, use LaTeX for ALL formulas. Use $inline$ for inline and $$display$$ for block equations. Solve numerical problems with extreme precision, showing step-by-step derivations and intermediate calculations.
                  3. **Complex Reasoning**: For multi-step questions, break down the problem into logical components and address each sequentially.
                  4. **Contextual Fidelity**: Answer ONLY based on the context. If the answer isn't there, state what is available and what is missing.
                  5. **Follow-up Strategy**: Generate 3 sophisticated follow-up questions that:
                     - **Clarify**: Address potential ambiguities.
                     - **Deepen**: Explore underlying technical mechanisms or theoretical implications.
                     - **Related**: Connect the topic to other relevant concepts found in the context.
                  6. Return ONLY JSON.`,
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                answer: {
                  type: Type.STRING,
                  description: "The detailed answer to the user's question.",
                },
                suggestedQuestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                  },
                  description: "2-3 follow-up questions related to the topic.",
                },
              },
              required: ["answer", "suggestedQuestions"],
            },
          },
        })
      );

      const result = JSON.parse(response.text);
      const aiText = result.answer || 'I could not find an answer in the documents.';
      const nextQuestions = result.suggestedQuestions || [];

      // Persist to Firestore
      if (user) {
        try {
          let chatId = currentChatId;
          if (!chatId) {
            // Create new chat with document metadata
            const title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
            const documentMetadata = analyzedFiles.map(f => ({
              name: f.name,
              size: f.size,
              type: f.type
            }));
            chatId = await createChat(user.uid, title, documentMetadata);
            setCurrentChatId(chatId);
          }
          
          // Add user message
          await addMessage(chatId, 'user', text);
          // Add AI message
          await addMessage(chatId, 'assistant', aiText);
          
          setSuggestions(nextQuestions);
        } catch (error) {
          console.error('Error persisting to Firestore:', error);
        }
      } else {
        // Fallback for non-logged in state (shouldn't happen with current UI)
        const aiMessage = {
          id: (Date.now() + 1).toString(),
          text: aiText,
          sender: 'ai',
          timestamp: new Date(),
          query: text
        };
        setMessages((prev) => [...prev, aiMessage]);
        setSuggestions(nextQuestions);
      }
    } catch (error) {
      console.error('Error calling Gemini:', error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error while processing your request. Please try again.',
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [analyzedFiles, chunks, chunkEmbeddings, isLoading, messages]);

  const getAutocompleteSuggestions = useCallback(async (partialQuery) => {
    if (!chunks || chunks.length === 0) return [];
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const sampleContext = chunks.slice(0, 10).join('\n\n');
      
      const response = await withRetry(() => 
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{
            role: 'user',
            parts: [{
              text: `Based on the following document snippets, provide 3-5 autocomplete suggestions for a user typing: "${partialQuery}".
              
              SNIPPETS:
              ${sampleContext}
              
              Return ONLY a JSON array of strings.`
            }]
          }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        })
      );
      
      return JSON.parse(response.text);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      return [];
    }
  }, [chunks]);

  const getSpellcheck = useCallback(async (text) => {
    if (!text || text.length < 5) return null;
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await withRetry(() => 
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{
            role: 'user',
            parts: [{
              text: `Check the following text for spelling errors. If there are errors, provide the corrected version. If no errors, return null.
              TEXT: "${text}"
              Return ONLY a JSON object with "hasErrors" (boolean) and "correctedText" (string or null).`
            }]
          }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hasErrors: { type: Type.BOOLEAN },
                correctedText: { type: Type.STRING, nullable: true }
              },
              required: ["hasErrors", "correctedText"]
            }
          }
        })
      );
      
      const result = JSON.parse(response.text);
      return result.hasErrors ? result.correctedText : null;
    } catch (error) {
      console.error('Error in spellcheck:', error);
      return null;
    }
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setStarterQuestions([]);
  }, []);

  const handleSelectHistoryItem = (item) => {
    setCurrentChatId(item.id);
    setIsHistoryDrawerOpen(false);
  };

  const handleClearHistory = async () => {
    if (!user) return;
    
    setConfirmConfig({
      title: 'Clear All History?',
      message: 'Are you sure you want to delete all chat history? This cannot be undone.',
      confirmText: 'Clear All',
      variant: 'danger'
    });
    
    setConfirmAction(() => async () => {
      try {
        const deletePromises = history.map(chat => deleteChat(chat.id));
        await Promise.all(deletePromises);
        
        setHistory([]);
        setMessages([]);
        setCurrentChatId(null);
        toast.success('All chat history deleted');
      } catch (error) {
        console.error('Error clearing history:', error);
        toast.error('Failed to clear history');
      }
    });
    
    setIsConfirmOpen(true);
  };

  const handleRemoveHistoryItem = async (id) => {
    setConfirmConfig({
      title: 'Delete Chat?',
      message: 'Are you sure you want to delete this chat session? This cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger'
    });
    
    setConfirmAction(() => async () => {
      try {
        await deleteChat(id);
        if (currentChatId === id) {
          setCurrentChatId(null);
          setMessages([]);
        }
        toast.success('Chat deleted successfully');
      } catch (error) {
        toast.error('Failed to delete chat');
      }
    });
    
    setIsConfirmOpen(true);
  };

  const handlePreviewFile = (file) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  };

  const handleRemoveStagedFile = (fileToRemove) => {
    setStagedFiles(prev => prev.filter(f => f !== fileToRemove));
  };

  const handleSummarize = useCallback(async (length = 'medium', fileNames = null) => {
    if (!chunks || chunks.length === 0 || isSummarizing) return;
    
    setIsSummarizing(true);
    
    // Filter chunks if specific files are requested
    let targetChunks = chunks;
    if (fileNames && Array.isArray(fileNames)) {
      targetChunks = chunks.filter(c => fileNames.some(name => c.startsWith(`[Source: ${name}]`)));
    }

    if (targetChunks.length === 0) {
      setIsSummarizing(false);
      return;
    }

    // Add a user-like message to show the action in history
    let actionText = `Generate a ${length} summary of the analyzed documents.`;
    if (fileNames && Array.isArray(fileNames)) {
      if (fileNames.length === 1) {
        actionText = `Generate a ${length} summary of "${fileNames[0]}".`;
      } else if (fileNames.length < analyzedFiles.length) {
        actionText = `Generate a ${length} summary of ${fileNames.length} selected documents.`;
      }
    }

    const userActionMsg = {
      id: Date.now().toString(),
      text: actionText,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userActionMsg]);
    setIsLoading(true);
    setLoadingStep(`Synthesizing ${length} summary...`);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      // Take a representative sample of chunks for summarization
      let summaryContext = "";
      if (targetChunks.length <= 25) {
        summaryContext = targetChunks.join('\n\n');
      } else {
        // Sample from beginning, middle, and end
        const first = targetChunks.slice(0, 12);
        const mid = targetChunks.slice(Math.floor(targetChunks.length / 2) - 3, Math.floor(targetChunks.length / 2) + 3);
        const last = targetChunks.slice(-7);
        summaryContext = [...first, ...mid, ...last].join('\n\n');
      }

      const lengthInstructions = {
        short: "Provide a very concise, 1-2 paragraph summary focusing only on the most critical takeaway.",
        medium: "Provide a comprehensive, high-level summary with an executive overview, key themes, and significant findings.",
        detailed: "Provide a thorough and detailed analysis of the document, covering all major sections, technical nuances, data points, and conclusions in depth."
      };

      const focusText = (fileNames && Array.isArray(fileNames) && fileNames.length === 1)
        ? `Focus exclusively on the content of the document titled "${fileNames[0]}".`
        : (fileNames && Array.isArray(fileNames) && fileNames.length < analyzedFiles.length)
          ? `Synthesize information from the ${fileNames.length} selected documents.`
          : 'Synthesize information from all provided document snippets.';

      const response = await withRetry(() => 
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a world-class research analyst. Your task is to provide a high-level, sophisticated synthesis of the provided document content.
              
              ${focusText}
              ${lengthInstructions[length]}
              
              CORE REQUIREMENTS:
              1. **High-Level Synthesis**: Do not just list points; synthesize themes and identify cross-document patterns if multiple documents are provided.
              2. **Technical Accuracy**: Include key technical specifications, mathematical formulas (using LaTeX), and critical data points exactly as they appear.
              3. **Structural Clarity**: Use professional formatting with clear headings and bullet points.
              4. **Mathematical Rigor**: Ensure all formulas and numerical findings are highlighted and explained in their theoretical context.
              
              STRUCTURE:
              1. **Executive Overview**: A high-impact summary of the core value proposition or main thesis.
              2. **Key Themes & Theoretical Framework**: Deep dive into the primary concepts.
              3. **Critical Data & Mathematical Foundations**: Highlight specific numerical findings and formulas.
              4. **Strategic Implications/Conclusions**: What are the broader takeaways?
              
              DOCUMENT CONTENT SNIPPETS:
              ${summaryContext}
              
              Use professional, academic language. Use LaTeX for math: $inline formula$ for inline and $$display formula$$ for block equations.`
            }]
          }],
          config: {
            temperature: 0.1,
          }
        })
      );

      const summaryText = response.text;
      const finalMsg = {
        id: (Date.now() + 1).toString(),
        text: summaryText,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, finalMsg]);
    } catch (error) {
      console.error('Summarization error:', error);
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        text: "I encountered an error while trying to summarize the documents. Please try again.",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSummarizing(false);
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [chunks, isSummarizing]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center">
        <Loader2 size={40} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        <Toaster position="top-right" richColors />
      </>
    );
  }

  const filteredHistory = history.filter(item => 
    item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.tag?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-100 tech-grid flex flex-col">
      {/* Top Navigation Rail */}
      <nav className="h-16 bg-white border-b border-zinc-100 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors"
            title="View History"
          >
            <History size={20} />
          </button>
          <div className="h-6 w-px bg-zinc-100 mx-2" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <BookOpen size={20} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold tracking-tight text-zinc-900 uppercase">AI DOUBT SOLVER</h1>
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">Professional Research Assistant</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 bg-zinc-50 rounded-2xl border border-zinc-100 group relative cursor-pointer hover:bg-white hover:shadow-md hover:border-indigo-200 transition-all">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-indigo-200 group-hover:scale-105 transition-transform">
              {(userProfile?.name || user.displayName || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest">
                {userProfile?.name || user.displayName || 'User'}
              </span>
              <div className="flex items-center gap-1">
                <div className="h-1 w-1 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-tighter">Online</span>
              </div>
            </div>
            
            {/* Dropdown Menu */}
            <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-zinc-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-200 z-50 p-2">
              <div className="px-3 py-2 border-b border-zinc-50 mb-1">
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Account</p>
                <p className="text-[10px] font-bold text-zinc-900 truncate">{user.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 rounded-xl text-red-600 transition-colors group/logout"
              >
                <LogOut size={14} className="group-hover/logout:-translate-x-0.5 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-wider">Logout</span>
              </button>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="md:hidden p-2 hover:bg-red-50 rounded-xl text-zinc-400 hover:text-red-500 transition-colors"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* History Drawer */}
      <AnimatePresence>
        {isHistoryDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryDrawerOpen(false)}
              className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-80 bg-white shadow-2xl z-[70] flex flex-col border-r border-zinc-100"
            >
              <div className="p-6 border-b border-zinc-100 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                      <History size={20} />
                    </div>
                    <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Research History</h2>
                  </div>
                  <button 
                    onClick={() => setIsHistoryDrawerOpen(false)}
                    className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400 transition-colors"
                  >
                    <CloseIcon size={18} />
                  </button>
                </div>

                <div className="relative group">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text"
                    placeholder="Search your research..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-xs font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.2)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNewChat}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-zinc-200"
                >
                  <Plus size={14} />
                  New Research Session
                </motion.button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <QueryHistory 
                  history={filteredHistory} 
                  onSelect={handleSelectHistoryItem} 
                  onClear={handleClearHistory}
                  onRemove={handleRemoveHistoryItem}
                  currentChatId={currentChatId}
                />
              </div>
              
              <div className="p-6 bg-zinc-50 border-t border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">
                  Showing {filteredHistory.length} sessions
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* Left Sidebar: Knowledge Base */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="lg:sticky lg:top-24">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mb-2">Knowledge Base</h2>
              <p className="text-sm text-zinc-500 font-medium leading-relaxed">Upload your documents to enable AI-powered doubt solving and deep analysis.</p>
            </div>

            <UploadPDF 
              onFilesSelect={setStagedFiles} 
              selectedFiles={stagedFiles} 
              onPreview={handlePreviewFile}
            />

            {stagedFiles.length > 0 && (JSON.stringify(stagedFiles.map(f => f.name)) !== JSON.stringify(analyzedFiles.map(f => f.name))) && (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleConfirmAnalysis}
                disabled={isAnalyzing}
                className={`w-full mt-4 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg transition-all flex items-center justify-center gap-2 relative overflow-hidden group ${
                  isAnalyzing 
                    ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-200 hover:shadow-indigo-300'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin relative z-10" />
                    <span className="relative z-10">Analyzing document...</span>
                    <motion.div 
                      className="absolute inset-0 bg-indigo-500/20"
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    />
                  </>
                ) : (
                  <>
                    <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
                    <span>Confirm & Analyze Documents</span>
                  </>
                )}
              </motion.button>
            )}

            <AnalysisStats 
              chunks={chunks} 
              selectedFiles={analyzedFiles} 
              isAnalyzing={isAnalyzing} 
              onSummarize={handleSummarize}
              isSummarizing={isSummarizing}
            />

            <div className="mt-8 p-6 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2rem] text-white relative overflow-hidden group shadow-xl shadow-indigo-200">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <Sparkles size={80} />
              </div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 bg-white/20 backdrop-blur-md rounded-lg flex items-center justify-center">
                    <Sparkles size={12} className="text-white" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest">Pro Tip</h3>
                </div>
                <p className="text-xs text-indigo-50 leading-relaxed font-medium">
                  Ask specific questions about data tables or technical definitions for the best retrieval accuracy.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Middle Content: Chat Interface */}
        <section className="lg:col-span-8 flex flex-col min-h-[500px] sm:min-h-[600px] lg:h-[calc(100vh-160px)]">
          <ChatBox 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isLoading={isLoading || isAnalyzing}
            isSaving={isSaving}
            loadingStep={loadingStep}
            disabled={(!analyzedFiles || analyzedFiles.length === 0) || analysisError}
            onClearChat={handleClearChat}
            suggestions={suggestions}
            starterQuestions={starterQuestions}
            currentlyAnalyzing={currentlyAnalyzing}
            getAutocompleteSuggestions={getAutocompleteSuggestions}
            getSpellcheck={getSpellcheck}
          />
        </section>
      </main>

      {/* Footer Rail */}
      <footer className="h-12 bg-white border-t border-zinc-100 px-8 flex items-center justify-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span>© 2026 AI DOUBT SOLVER built by Sanskar</span>
        </div>
      </footer>

      <HistoryDetailModal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setIsHistoryModalOpen(false)} 
        historyItem={selectedHistoryItem} 
      />

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmAction}
        {...confirmConfig}
      />

      <FilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
        onRemove={() => handleRemoveStagedFile(previewFile)}
      />
      <Toaster position="top-right" richColors />
    </div>
  );
}
