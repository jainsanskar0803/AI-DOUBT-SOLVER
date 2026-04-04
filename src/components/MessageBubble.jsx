import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, Cpu, Copy, Check, Sparkles, Quote, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

export const MessageBubble = ({ message, suggestions = [], onSendMessage, isLoading }) => {
  const isUser = message.sender === 'user';
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightText = (text, query) => {
    if (!query || isUser) return text;
    
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
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex max-w-[90%] sm:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center shadow-sm border ${isUser ? 'bg-zinc-900 border-zinc-800 ml-4' : 'bg-white border-zinc-100 mr-4'}`}>
          {isUser ? <User size={16} className="text-white" /> : <Cpu size={16} className="text-indigo-600" />}
        </div>
        
        <div className="relative group">
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              {isUser ? 'Researcher' : 'AI Analyst'}
            </span>
            <span className="text-[9px] font-mono text-zinc-300">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          
          <div
            className={`px-6 py-4 rounded-2xl text-sm shadow-sm border ${
              isUser
                ? 'bg-zinc-900 text-zinc-100 border-zinc-800 rounded-tr-none'
                : 'bg-white text-zinc-900 border-zinc-100 rounded-tl-none'
            }`}
          >
            <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'prose-zinc'} font-medium leading-relaxed`}>
              <ReactMarkdown 
                remarkPlugins={[remarkMath]} 
                rehypePlugins={[rehypeKatex, rehypeRaw]}
                components={{
                  text: ({ value }) => {
                    return highlightText(value, message.query);
                  }
                }}
              >
                {message.text}
              </ReactMarkdown>
            </div>
          </div>

          {!isUser && suggestions.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Sparkles size={10} className="text-indigo-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Next Steps</span>
              </div>
              <div className="flex flex-col gap-2">
                {suggestions.map((q, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    onClick={() => !isLoading && onSendMessage(q)}
                    disabled={isLoading}
                    className={`text-left px-4 py-2.5 bg-indigo-50/50 border border-indigo-100/50 rounded-xl text-[11px] font-medium text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm flex items-center justify-between group/btn ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="line-clamp-1">{q}</span>
                    <div className="h-4 w-4 rounded-full bg-indigo-100 flex items-center justify-center group-hover/btn:bg-indigo-500 transition-colors">
                      <div className="h-1 w-1 rounded-full bg-indigo-600 group-hover/btn:bg-white" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          
          {!isUser && (
            <button
              onClick={copyToClipboard}
              className="absolute -right-10 top-8 p-2 text-zinc-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
