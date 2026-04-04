import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Loader2, MessageSquare, X, Sparkles, SpellCheck, BookOpen, Terminal, ChevronRight } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { toast } from 'sonner';

export default function ChatBox({ messages, onSendMessage, isLoading, isSaving, loadingStep, disabled, onClearChat, suggestions = [], starterQuestions = [], currentlyAnalyzing = null, getAutocompleteSuggestions, getSpellcheck }) {
  const [inputValue, setInputValue] = useState('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const scrollRef = useRef(null);
  const debounceTimer = useRef(null);
  const spellcheckTimer = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !disabled && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      setAutocompleteSuggestions([]);
    }
  };

  useEffect(() => {
    if (inputValue.trim().length > 2 && getAutocompleteSuggestions && !disabled && !isLoading) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      
      debounceTimer.current = setTimeout(async () => {
        const results = await getAutocompleteSuggestions(inputValue);
        setAutocompleteSuggestions(results);
      }, 300); // Reduced from 500ms for more dynamic feel
    } else {
      setAutocompleteSuggestions([]);
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputValue, getAutocompleteSuggestions, disabled, isLoading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setAutocompleteSuggestions([]);
    }
  };

  // Spellcheck effect
  useEffect(() => {
    if (inputValue.trim().length > 10 && getSpellcheck && !disabled && !isLoading) {
      if (spellcheckTimer.current) clearTimeout(spellcheckTimer.current);
      
      spellcheckTimer.current = setTimeout(async () => {
        const corrected = await getSpellcheck(inputValue);
        if (corrected && corrected !== inputValue) {
          toast.info("Spelling suggestion", {
            description: `Did you mean: "${corrected}"?`,
            action: {
              label: "Apply",
              onClick: () => setInputValue(corrected)
            },
            icon: <SpellCheck size={16} className="text-indigo-500" />,
            duration: 5000
          });
        }
      }, 2000); // Wait 2 seconds of inactivity before spellchecking
    }

    return () => {
      if (spellcheckTimer.current) clearTimeout(spellcheckTimer.current);
    };
  }, [inputValue, getSpellcheck, disabled, isLoading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, starterQuestions, isLoading]);

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-xl shadow-zinc-200/50 flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-white relative overflow-hidden">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="h-8 w-8 bg-indigo-50 rounded-lg flex items-center justify-center">
            <MessageSquare size={16} className="text-indigo-600" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Analysis Console</h2>
            {currentlyAnalyzing && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Loader2 size={10} className="text-indigo-500 animate-spin" />
                <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-tighter">Analyzing: {currentlyAnalyzing}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {isSaving && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-lg"
              >
                <div className="h-1 w-1 bg-indigo-500 rounded-full animate-pulse" />
                <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest">Saving...</span>
              </motion.div>
            )}
          </AnimatePresence>
          {messages.length > 0 && (
            <button 
              onClick={onClearChat}
              className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 flex items-center gap-1.5"
            >
              <X size={12} />
              Reset Session
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scroll-smooth bg-zinc-50/30"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 relative z-10">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="h-24 w-24 bg-white rounded-[2.5rem] shadow-xl shadow-zinc-200/50 border border-zinc-100 flex items-center justify-center mb-8 group hover:scale-110 transition-transform duration-500"
              >
                <Sparkles size={40} className="text-indigo-600 group-hover:rotate-12 transition-transform" />
              </motion.div>
              <h3 className="text-2xl font-bold text-zinc-900 mb-3 tracking-tight">
                AI Doubt Solver
              </h3>
              <p className="text-zinc-500 text-sm max-w-[320px] mb-10 leading-relaxed font-medium">
                Upload your research material to begin deep-dive analysis and resolve complex queries instantly.
              </p>
              
              {currentlyAnalyzing && (
                <div className="w-full max-w-md p-5 bg-indigo-50/50 rounded-[2rem] border border-indigo-100/50 flex items-center justify-between animate-pulse mb-10 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="text-indigo-600 animate-spin" />
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
                      Analyzing: {currentlyAnalyzing}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Generating Insights...</span>
                </div>
              )}

              {!isLoading && starterQuestions.length > 0 ? (
                <div className="w-full max-w-2xl space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-px flex-1 bg-zinc-100" />
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Suggested Starting Points</span>
                    <div className="h-px flex-1 bg-zinc-100" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {starterQuestions.flatMap(group => group.questions.map((q, i) => ({ text: q, fileName: group.fileName }))).map((item, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => !isLoading && onSendMessage(item.text)}
                        disabled={isLoading}
                        className={`text-left p-4 bg-white border border-zinc-100 rounded-2xl hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-100/50 transition-all group relative overflow-hidden ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                          <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest truncate max-w-[120px]">{item.fileName}</span>
                        </div>
                        <p className="text-xs font-bold text-zinc-700 group-hover:text-indigo-600 leading-snug line-clamp-2">
                          {item.text}
                        </p>
                        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={14} className="text-indigo-400" />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : !isLoading && !currentlyAnalyzing && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
                  {[
                    { 
                      text: "Summarize document", 
                      desc: "Get a high-level overview of the key points.",
                      icon: <BookOpen size={16} /> 
                    },
                    { 
                      text: "Explain concepts", 
                      desc: "Break down complex ideas into simple terms.",
                      icon: <Sparkles size={16} /> 
                    },
                    { 
                      text: "Find data points", 
                      desc: "Extract specific facts, dates, and figures.",
                      icon: <Terminal size={16} /> 
                    }
                  ].map((item, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => {
                        onSendMessage(item.text);
                      }}
                      className="p-5 bg-white border border-zinc-100 rounded-[2rem] hover:border-indigo-400 hover:shadow-[0_20px_40px_-15px_rgba(79,70,229,0.15)] transition-all flex flex-col items-center text-center gap-3 group active:scale-95"
                    >
                      <div className="h-12 w-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:scale-110 transition-all duration-300">
                        {item.icon}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">{item.text}</span>
                        <p className="text-[9px] text-zinc-400 font-medium leading-tight px-2">{item.desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, idx) => {
                const isLastMessage = idx === messages.length - 1;
                const isAI = msg.sender === 'ai';
                
                return (
                  <MessageBubble 
                    key={msg.id} 
                    message={msg} 
                    suggestions={isLastMessage && isAI && !isLoading ? suggestions : []}
                    onSendMessage={onSendMessage}
                    isLoading={isLoading}
                  />
                );
              })}

              {/* Show starter questions for new files at the bottom of the chat */}
              {!isLoading && starterQuestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 mb-8 pl-14"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px flex-1 bg-zinc-100" />
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">New File Questions</span>
                    <div className="h-px flex-1 bg-zinc-100" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {starterQuestions.flatMap(group => group.questions.map((q, i) => ({ text: q, fileName: group.fileName }))).map((item, i) => (
                      <button
                        key={i}
                        onClick={() => !isLoading && onSendMessage(item.text)}
                        disabled={isLoading}
                        className={`text-left p-2.5 bg-white border border-zinc-100 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all group ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="h-1 w-1 rounded-full bg-indigo-400" />
                          <span className="text-[7px] font-bold text-indigo-400 uppercase tracking-widest truncate max-w-[100px]">{item.fileName}</span>
                        </div>
                        <p className="text-[11px] font-medium text-zinc-600 group-hover:text-indigo-600 leading-tight line-clamp-2">
                          {item.text}
                        </p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white border border-zinc-100 rounded-3xl rounded-tl-none px-6 py-4 flex flex-col gap-3 shadow-sm max-w-[80%] relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <motion.span 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} 
                      transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}
                      className="h-1.5 w-1.5 bg-indigo-600 rounded-full" 
                    />
                    <motion.span 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} 
                      transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}
                      className="h-1.5 w-1.5 bg-indigo-600 rounded-full" 
                    />
                    <motion.span 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} 
                      transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}
                      className="h-1.5 w-1.5 bg-indigo-600 rounded-full" 
                    />
                  </div>
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest animate-pulse">
                    {loadingStep || 'AI is analyzing...'}
                  </span>
                </div>
                
                {/* Skeleton Loading Animation */}
                <div className="space-y-2">
                  <div className="h-2 bg-zinc-100 rounded-full w-48 animate-pulse" />
                  <div className="h-2 bg-zinc-100 rounded-full w-32 animate-pulse delay-75" />
                  <div className="h-2 bg-zinc-100 rounded-full w-40 animate-pulse delay-150" />
                </div>

                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-6 bg-white border-t border-zinc-100 relative">
        <AnimatePresence>
          {!isLoading && autocompleteSuggestions.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute bottom-full left-4 right-4 sm:left-6 sm:right-6 mb-2 bg-white border border-zinc-100 rounded-2xl shadow-xl z-30 overflow-hidden"
            >
              <div className="p-2 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
                <Sparkles size={10} className="text-indigo-500" />
                <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Smart Suggestions</span>
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {autocompleteSuggestions.map((suggestion, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    type="button"
                    onClick={() => {
                      onSendMessage(suggestion);
                      setInputValue('');
                      setAutocompleteSuggestions([]);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-medium text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-3 border-b border-zinc-100 last:border-0"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-200" />
                    {suggestion}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="relative flex items-center group">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-[2rem] opacity-0 group-focus-within:opacity-10 transition-opacity blur-lg" />
          <div className="absolute left-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors z-10">
            <MessageSquare size={16} />
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Upload document to begin..." : "Ask anything from your document..."}
            disabled={isLoading}
            spellCheck="true"
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl py-3 sm:py-4 pl-10 sm:pl-12 pr-12 sm:pr-14 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all disabled:opacity-50 disabled:bg-zinc-50 placeholder:text-zinc-300 text-zinc-900 relative z-0 shadow-inner"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || disabled || isLoading}
            className="absolute right-2 sm:right-2.5 p-2 sm:p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-200 hover:scale-105 active:scale-95 z-10"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <div className="flex items-center justify-between mt-4 px-2">
          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
            Powered by Gemini 3.1
          </p>
          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
            System Status: Optimal
          </p>
        </div>
      </form>
    </div>
  );
}
