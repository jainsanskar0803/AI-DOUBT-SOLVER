import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, Cpu, User, Calendar, Clock, Quote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

export default function HistoryDetailModal({ isOpen, onClose, historyItem }) {
  if (!historyItem) return null;

  const highlightText = (text, query) => {
    if (!query) return text;
    
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once']);
    const keywords = query.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
      
    if (keywords.length === 0) return text;
    
    const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
    const parts = text.split(pattern);
    
    return parts.map((part, i) => {
      if (keywords.some(kw => part.toLowerCase() === kw)) {
        return <mark key={i} className="bg-yellow-100 text-yellow-900 px-0.5 rounded-sm font-bold">{part}</mark>;
      }
      return part;
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-100"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                  <MessageSquare size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 tracking-tight">Query Detail</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-zinc-400" />
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        {(() => {
                          const date = historyItem.updatedAt?.toDate?.() || historyItem.createdAt?.toDate?.() || (historyItem.updatedAt ? new Date(historyItem.updatedAt) : null) || (historyItem.createdAt ? new Date(historyItem.createdAt) : null);
                          return date && !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Recent';
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={12} className="text-zinc-400" />
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        {(() => {
                          const date = historyItem.updatedAt?.toDate?.() || historyItem.createdAt?.toDate?.() || (historyItem.updatedAt ? new Date(historyItem.updatedAt) : null) || (historyItem.createdAt ? new Date(historyItem.createdAt) : null);
                          return date && !isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="h-10 w-10 rounded-xl hover:bg-zinc-100 flex items-center justify-center text-zinc-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-8">
              {/* User Query */}
              <div className="flex gap-6">
                <div className="flex-shrink-0 h-10 w-10 rounded-2xl bg-zinc-900 flex items-center justify-center shadow-md">
                  <User size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Researcher</span>
                  <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-100 text-zinc-900 font-medium leading-relaxed">
                    {historyItem.query}
                  </div>
                </div>
              </div>

              {/* AI Response */}
              <div className="flex gap-6">
                <div className="flex-shrink-0 h-10 w-10 rounded-2xl bg-white border border-zinc-100 flex items-center justify-center shadow-md">
                  <Cpu size={18} className="text-indigo-600" />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">AI Analyst</span>
                  <div className="prose prose-sm max-w-none prose-zinc font-medium leading-relaxed">
                    <ReactMarkdown 
                      remarkPlugins={[remarkMath]} 
                      rehypePlugins={[rehypeKatex, rehypeRaw]}
                      components={{
                        text: ({ value }) => {
                          return highlightText(value, historyItem.query);
                        }
                      }}
                    >
                      {historyItem.result}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Source: {historyItem.source || 'Knowledge Base'}
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all active:scale-95"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
