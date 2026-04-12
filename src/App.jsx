import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { BookOpen, Sparkles, Loader2, History, X as CloseIcon, LogOut, Plus, Search } from 'lucide-react';
import UploadPDF from './components/UploadPDF';
import ChatBox from './components/ChatBox';
import AnalysisStats from './components/AnalysisStats';
import QueryHistory from './components/QueryHistory';
import HistoryDetailModal from './components/HistoryDetailModal';
import FilePreviewModal from './components/FilePreviewModal';
import ConfirmModal from './components/ConfirmModal';
import Login from './components/Login';
import {
  extractText,
  chunkText,
  generateEmbeddings,
  generateQueryEmbedding,
  retrieveGranularContext,
  highlightKeywords,
  rephraseQuery,
} from './services/ragService';
import { Type } from '@google/genai';
import { withRetry } from './services/apiUtils';
import { Toaster, toast } from 'sonner';
import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  doc,
  onSnapshot,
  serverTimestamp,
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
} from './firebaseService';

// ─── Constants ──────────────────────────────────────────────────────────────
const GEMINI_MODEL   = 'gemini-1.5-flash'
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? '';

// Singleton AI client — created once, reused everywhere.
let _aiClient = null;
function getAI() {
  if (!_aiClient) {
    _aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return _aiClient;
}

export default function App() {
  const [user, setUser]                               = useState(null);
  const [userProfile, setUserProfile]                 = useState(null);
  const [isAuthLoading, setIsAuthLoading]             = useState(true);
  const [currentChatId, setCurrentChatId]             = useState(null);
  const [stagedFiles, setStagedFiles]                 = useState([]);
  const [analyzedFiles, setAnalyzedFiles]             = useState([]);
  const [fileDataMap, setFileDataMap]                 = useState(new Map());
  const [chunks, setChunks]                           = useState([]);
  const [chunkEmbeddings, setChunkEmbeddings]         = useState([]);
  const [isAnalyzing, setIsAnalyzing]                 = useState(false);
  const [isSummarizing, setIsSummarizing]             = useState(false);
  const [analysisError, setAnalysisError]             = useState(false);
  const [messages, setMessages]                       = useState([]);
  const [isLoading, setIsLoading]                     = useState(false);
  const [loadingStep, setLoadingStep]                 = useState('');
  const [suggestions, setSuggestions]                 = useState([]);
  const [starterQuestions, setStarterQuestions]       = useState([]);
  const [currentlyAnalyzing, setCurrentlyAnalyzing]   = useState(null);
  const [history, setHistory]                         = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen]   = useState(false);
  const [isConfirmOpen, setIsConfirmOpen]             = useState(false);
  const [confirmAction, setConfirmAction]             = useState(null);
  const [confirmConfig, setConfirmConfig]             = useState({});
  const [isSaving, setIsSaving]                       = useState(false);
  const [isPreviewOpen, setIsPreviewOpen]             = useState(false);
  const [previewFile, setPreviewFile]                 = useState(null);
  const [searchQuery, setSearchQuery]                 = useState('');

  const fileDataRef = useRef(new Map());

  // ─── Startup ───────────────────────────────────────────────────────────────
  useEffect(() => { testConnection(); }, []);

  // ─── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const isPasswordUser = firebaseUser.providerData.some(
          (p) => p.providerId === 'password'
        );
        const pendingVerification = localStorage.getItem(
          `pending_verification_${firebaseUser.uid}`
        );

        if (isPasswordUser && !firebaseUser.emailVerified) {
          setUser(null);
          setIsAuthLoading(false);
          return;
        }

        if (firebaseUser.emailVerified && pendingVerification) {
          localStorage.removeItem(`pending_verification_${firebaseUser.uid}`);
          await signOut(auth).catch(console.error);
          setUser(null);
          setIsAuthLoading(false);
          return;
        }

        setUser(firebaseUser);
        setIsAuthLoading(false);

        createUserProfile(firebaseUser).catch((err) =>
          console.error('App: profile sync failed:', err)
        );
      } else {
        setUser(null);
        setUserProfile(null);
        setHistory([]);
        setMessages([]);
        setCurrentChatId(null);
        setIsAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ─── Firestore: user profile ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => { if (snapshot.exists()) setUserProfile(snapshot.data()); },
      (error) => console.error('App: profile listener error:', error)
    );
    return () => unsubscribe();
  }, [user]);

  // ─── Firestore: chat history ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToUserChats(user.uid, setHistory);
    return () => unsubscribe();
  }, [user]);

  // ─── Firestore: active chat messages ──────────────────────────────────────
  useEffect(() => {
    if (!currentChatId || !user) return;
    const unsubscribe = subscribeToChatMessages(currentChatId, (msgs) => {
      setMessages(
        msgs.map((m) => ({
          id: m.id,
          text: m.content,
          sender: m.role === 'user' ? 'user' : 'ai',
          timestamp: m.createdAt?.toDate() ?? new Date(),
        }))
      );
    });
    return () => unsubscribe();
  }, [currentChatId, user]);

  // ─── Auto-save ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !currentChatId || messages.length === 0) return;
    const interval = setInterval(saveChatState, 30_000);
    return () => clearInterval(interval);
  }, [user, currentChatId, messages]);

  const saveChatState = async () => {
    if (!user || !currentChatId || isSaving) return;
    try {
      setIsSaving(true);
      await updateChat(currentChatId, { updatedAt: serverTimestamp() });
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── New chat ──────────────────────────────────────────────────────────────
  const handleNewChat = () => {
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
    fileDataRef.current = new Map();
    setFileDataMap(new Map());
    setChunks([]);
    setChunkEmbeddings([]);

    const staleKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('analysis_') || key.startsWith('chat_'))) {
        staleKeys.push(key);
      }
    }
    staleKeys.forEach((k) => localStorage.removeItem(k));

    toast.success('New research session started');
  };

  // ─── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
    } catch {
      toast.error('Failed to logout. Please try again.');
    }
  };

  // ─── RAG: sync helper ──────────────────────────────────────────────────────
  const syncFileDataStates = (map) => {
    fileDataRef.current = map;
    setFileDataMap(new Map(map));
    const allChunks     = [];
    const allEmbeddings = [];
    map.forEach((data) => {
      allChunks.push(...data.chunks);
      allEmbeddings.push(...data.embeddings);
    });
    setChunks(allChunks);
    setChunkEmbeddings(allEmbeddings);
  };

  // ─── RAG: file analysis ────────────────────────────────────────────────────
  useEffect(() => {
    const analyzeFiles = async () => {
      if (!analyzedFiles.length) {
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
        const newMap = new Map(fileDataRef.current);

        const analyzedNames = new Set(analyzedFiles.map((f) => f.name));
        let mapChanged = false;
        for (const name of newMap.keys()) {
          if (!analyzedNames.has(name)) { newMap.delete(name); mapChanged = true; }
        }
        if (mapChanged) syncFileDataStates(newMap);

        const filesToProcess = analyzedFiles.filter((f) => !newMap.has(f.name));

        if (filesToProcess.length > 0) {
          const ai      = getAI();
          const results = [];

          for (const file of filesToProcess) {
            try {
              setCurrentlyAnalyzing(file.name);
              const text       = await extractText(file);
              const fileChunks = chunkText(text).map((c) => `[Source: ${file.name}]\n${c}`);
              const embeddings = await generateEmbeddings(fileChunks, GEMINI_API_KEY);

              const sampleContext = fileChunks.slice(0, 3).join('\n\n');
              const response = await withRetry(() =>
                ai.models.generateContent({
                  model: GEMINI_MODEL,
                  contents: [{ role: 'user', parts: [{ text: `Based on "${file.name}", generate 2 diverse starter questions a student might ask.\nSNIPPETS:\n${sampleContext}\nReturn ONLY a JSON array of 2 strings.` }] }],
                  config: { responseMimeType: 'application/json', responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } },
                })
              );

              let questions;
              try {
                questions = JSON.parse(response.text);
              } catch {
                questions = [`What are the key points in ${file.name}?`, `Analyse the main arguments in ${file.name}.`];
              }

              results.push({
                fileName: file.name,
                fileData: { chunks: fileChunks, embeddings, questions },
                starterQuestions: { fileName: file.name, questions },
              });
            } catch (err) {
              // ✅ FIX: catch block now correctly closes the per-file try/catch.
              // The results array update below is INSIDE the for loop, not after it.
              console.error(`Error processing ${file.name}:`, err);
              const reason = err?.message ?? 'Unknown error';
              toast.error(`Failed to analyse "${file.name}"`, { description: reason });
              results.push(null);
            }
          } // ← for loop ends here

          // ✅ FIX: these lines are now correctly INSIDE the if block but OUTSIDE
          // the for loop, so they run once after all files are processed.
          const valid = results.filter(Boolean);
          valid.forEach((r) => newMap.set(r.fileName, r.fileData));
          syncFileDataStates(newMap);
          setStarterQuestions(valid.map((r) => r.starterQuestions));
        }
      } catch (error) {
        console.error('Error analysing files:', error);
        setAnalysisError(true);
        toast.error('Failed to analyse documents. Please try again.');
        setMessages([{
          id: 'system-error',
          text: `Failed to analyse documents: ${error?.message ?? 'Unknown error'}.`,
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

  const handleConfirmAnalysis = () => setAnalyzedFiles([...stagedFiles]);

  // ─── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (text) => {
    const userMessage = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setSuggestions([]);
    setStarterQuestions([]);
    setIsLoading(true);
    setLoadingStep('Understanding query...');

    try {
      if (!analyzedFiles.length || chunks.length === 0) throw new Error('No documents analysed');

      setLoadingStep('Searching documents...');
      const standaloneQuery = await rephraseQuery(text, messages, GEMINI_API_KEY);
      const queryEmbedding  = await generateQueryEmbedding(standaloneQuery, GEMINI_API_KEY);
      const relevantContext = await retrieveGranularContext(
        standaloneQuery, queryEmbedding, chunkEmbeddings, chunks, GEMINI_API_KEY, 12
      );

      setLoadingStep('Analysing context...');
      const contextText = relevantContext
        .map((txt, i) => `[Source ${i + 1}]\n${highlightKeywords(txt, standaloneQuery)}`)
        .join('\n\n---\n\n');

      const conversationHistory = messages
        .slice(-6)
        .map((m) => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .join('\n');

      setLoadingStep('Generating answer...');
      const ai       = getAI();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{
            role: 'user',
            parts: [{
              text: `You are an elite research scientist and technical analyst. Provide high-fidelity, accurate answers based solely on the provided document context.

CONTEXT:
${contextText || 'No relevant sections found.'}

CONVERSATION HISTORY:
${conversationHistory}

QUESTION:
${text}

CRITICAL INSTRUCTIONS:
1. **Scientific Rigor**: Direct, factual, high-level technical answer. Cite sources using [Source X] notation.
2. **Mathematical Precision**: Use LaTeX for ALL formulas. $inline$ for inline, $$display$$ for block equations. Show step-by-step derivations.
3. **Complex Reasoning**: For multi-step questions, break down into logical components.
4. **Contextual Fidelity**: Answer ONLY from the context. If missing, state what is and isn't available.
5. **Follow-up Questions**: Generate 3 follow-up questions (clarifying, deepening, related).
6. Return ONLY JSON.`,
            }],
          }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                answer:             { type: Type.STRING },
                suggestedQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['answer', 'suggestedQuestions'],
            },
          },
        })
      );

      const result        = JSON.parse(response.text);
      const aiText        = result.answer || 'I could not find an answer in the documents.';
      const nextQuestions = result.suggestedQuestions || [];

      if (user) {
        try {
          let chatId = currentChatId;
          if (!chatId) {
            const title            = text.slice(0, 50) + (text.length > 50 ? '…' : '');
            const documentMetadata = analyzedFiles.map((f) => ({ name: f.name, size: f.size, type: f.type }));
            chatId = await createChat(user.uid, title, documentMetadata);
            setCurrentChatId(chatId);
          }
          if (chatId) {
            await addMessage(chatId, 'user', text);
            await addMessage(chatId, 'assistant', aiText);
          }
          setSuggestions(nextQuestions);
        } catch (error) {
          console.error('Firestore persist error:', error);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 1).toString(), text: aiText, sender: 'ai', timestamp: new Date() },
        ]);
        setSuggestions(nextQuestions);
      }
    } catch (error) {
      console.error('handleSendMessage error:', error);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: 'Sorry, I encountered an error processing your request. Please try again.', sender: 'ai', timestamp: new Date() },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [analyzedFiles, chunks, chunkEmbeddings, isLoading, messages, user, currentChatId]);

  // ─── Autocomplete ──────────────────────────────────────────────────────────
  const getAutocompleteSuggestions = useCallback(async (partialQuery) => {
    if (!chunks.length || !partialQuery || partialQuery.length < 3) return [];
    try {
      const ai            = getAI();
      const sampleContext = chunks.slice(0, 10).join('\n\n');
      const response      = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: `Based on the document snippets below, provide 3-5 autocomplete suggestions for a user typing: "${partialQuery}".\n\nSNIPPETS:\n${sampleContext}\n\nReturn ONLY a JSON array of strings.` }] }],
          config: { responseMimeType: 'application/json', responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } },
        })
      );
      return JSON.parse(response.text);
    } catch (error) {
      console.error('Autocomplete error:', error);
      return [];
    }
  }, [chunks]);

  // ─── Spellcheck ────────────────────────────────────────────────────────────
  const getSpellcheck = useCallback(async (text) => {
    if (!text || text.length < 5) return null;
    try {
      const ai       = getAI();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: `Check the following text for spelling errors. Return the corrected version if there are errors, otherwise return null.\nTEXT: "${text}"\nReturn ONLY a JSON object: { "hasErrors": boolean, "correctedText": string | null }` }] }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hasErrors:     { type: Type.BOOLEAN },
                correctedText: { type: Type.STRING, nullable: true },
              },
              required: ['hasErrors', 'correctedText'],
            },
          },
        })
      );
      const result = JSON.parse(response.text);
      return result.hasErrors ? result.correctedText : null;
    } catch (error) {
      console.error('Spellcheck error:', error);
      return null;
    }
  }, []);

  // ─── Summarise ─────────────────────────────────────────────────────────────
  const handleSummarize = useCallback(async (length = 'medium', fileNames = null) => {
    if (!chunks.length || isSummarizing) return;
    setIsSummarizing(true);

    const targetChunks = fileNames?.length
      ? chunks.filter((c) => fileNames.some((name) => c.startsWith(`[Source: ${name}]`)))
      : chunks;

    if (targetChunks.length === 0) { setIsSummarizing(false); return; }

    let actionText = `Generate a ${length} summary of the analysed documents.`;
    if (fileNames?.length === 1) {
      actionText = `Generate a ${length} summary of "${fileNames[0]}".`;
    } else if (fileNames && fileNames.length > 1 && fileNames.length < analyzedFiles.length) {
      actionText = `Generate a ${length} summary of ${fileNames.length} selected documents.`;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), text: actionText, sender: 'user', timestamp: new Date() }]);
    setIsLoading(true);
    setLoadingStep(`Synthesising ${length} summary…`);

    try {
      let summaryContext;
      if (targetChunks.length <= 25) {
        summaryContext = targetChunks.join('\n\n');
      } else {
        const first    = targetChunks.slice(0, 12);
        const midStart = Math.floor(targetChunks.length / 2) - 3;
        const mid      = targetChunks.slice(midStart, midStart + 6);
        const last     = targetChunks.slice(-7);
        summaryContext = [...first, ...mid, ...last].join('\n\n');
      }

      const lengthInstructions = {
        short:    'Provide a concise 1-2 paragraph summary focusing only on the most critical takeaway.',
        medium:   'Provide a comprehensive, high-level summary with an executive overview, key themes, and significant findings.',
        detailed: 'Provide a thorough analysis covering all major sections, technical nuances, data points, and conclusions in depth.',
      };

      const focusText = fileNames?.length === 1
        ? `Focus exclusively on "${fileNames[0]}".`
        : fileNames && fileNames.length > 1 && fileNames.length < analyzedFiles.length
          ? `Synthesise information from the ${fileNames.length} selected documents.`
          : 'Synthesise information from all provided document snippets.';

      const ai       = getAI();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a world-class research analyst. Provide a sophisticated synthesis of the document content.

${focusText}
${lengthInstructions[length]}

CORE REQUIREMENTS:
1. **High-Level Synthesis**: Synthesise themes; identify cross-document patterns if multiple documents.
2. **Technical Accuracy**: Include key technical specs, mathematical formulas (LaTeX), and data points exactly as they appear.
3. **Structural Clarity**: Professional formatting with clear headings.
4. **Mathematical Rigor**: Highlight and explain all formulas in their theoretical context.

STRUCTURE:
1. **Executive Overview**
2. **Key Themes & Theoretical Framework**
3. **Critical Data & Mathematical Foundations**
4. **Strategic Implications / Conclusions**

DOCUMENT CONTENT:
${summaryContext}

Use LaTeX for math: $inline$ and $$block$$.`,
            }]
          }],
          config: { temperature: 0.1 },
        })
      );

      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: response.text, sender: 'ai', timestamp: new Date() },
      ]);
    } catch (error) {
      console.error('Summarisation error:', error);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: 'I encountered an error while summarising. Please try again.', sender: 'ai', timestamp: new Date() },
      ]);
    } finally {
      setIsSummarizing(false);
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [chunks, isSummarizing, analyzedFiles]);

  // ─── Chat helpers ──────────────────────────────────────────────────────────
  const handleClearChat = useCallback(() => { setMessages([]); setStarterQuestions([]); }, []);

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
      variant: 'danger',
    });
    setConfirmAction(() => async () => {
      try {
        await Promise.all(history.map((chat) => deleteChat(chat.id)));
        setHistory([]);
        setMessages([]);
        setCurrentChatId(null);
        toast.success('All chat history deleted');
      } catch {
        toast.error('Failed to clear history');
      }
    });
    setIsConfirmOpen(true);
  };

  const handleRemoveHistoryItem = (id) => {
    setConfirmConfig({
      title: 'Delete Chat?',
      message: 'Are you sure you want to delete this chat session? This cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    setConfirmAction(() => async () => {
      try {
        await deleteChat(id);
        if (currentChatId === id) { setCurrentChatId(null); setMessages([]); }
        toast.success('Chat deleted');
      } catch {
        toast.error('Failed to delete chat');
      }
    });
    setIsConfirmOpen(true);
  };

  // ─── File helpers ──────────────────────────────────────────────────────────
  const handlePreviewFile      = (file) => { setPreviewFile(file); setIsPreviewOpen(true); };
  const handleRemoveStagedFile = (fileToRemove) => setStagedFiles((prev) => prev.filter((f) => f !== fileToRemove));

  // ─── Derived state ─────────────────────────────────────────────────────────
  const filteredHistory = useMemo(() =>
    history.filter((item) =>
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tag?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [history, searchQuery]
  );

  // ─── Render ────────────────────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen bg-zinc-100 tech-grid flex flex-col">

      {/* Nav */}
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
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNewChat}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-zinc-200"
                >
                  <Plus size={14} /> New Research Session
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
                  {filteredHistory.length} session{filteredHistory.length !== 1 ? 's' : ''}
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        <aside className="lg:col-span-4 space-y-6">
          <div className="lg:sticky lg:top-24">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mb-2">Knowledge Base</h2>
              <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                Upload your documents to enable AI-powered doubt solving and deep analysis.
              </p>
            </div>

            <UploadPDF
              onFilesSelect={setStagedFiles}
              selectedFiles={stagedFiles}
              onPreview={handlePreviewFile}
            />

            {stagedFiles.length > 0 &&
              JSON.stringify(stagedFiles.map((f) => f.name)) !== JSON.stringify(analyzedFiles.map((f) => f.name)) && (
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
                      <span className="relative z-10">
                        {currentlyAnalyzing ? `Analysing "${currentlyAnalyzing}"…` : 'Analysing documents…'}
                      </span>
                      <motion.div
                        className="absolute inset-0 bg-indigo-500/20"
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                      />
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
                      <span>Confirm & Analyse Documents</span>
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

        <section className="lg:col-span-8 flex flex-col min-h-[500px] sm:min-h-[600px] lg:h-[calc(100vh-160px)]">
          <ChatBox
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading || isAnalyzing}
            isSaving={isSaving}
            loadingStep={loadingStep}
            disabled={!analyzedFiles.length || analysisError}
            onClearChat={handleClearChat}
            suggestions={suggestions}
            starterQuestions={starterQuestions}
            currentlyAnalyzing={currentlyAnalyzing}
            getAutocompleteSuggestions={getAutocompleteSuggestions}
            getSpellcheck={getSpellcheck}
          />
        </section>
      </main>

      <footer className="h-12 bg-white border-t border-zinc-100 px-8 flex items-center justify-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
        © 2026 AI DOUBT SOLVER — Built by Sanskar
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
