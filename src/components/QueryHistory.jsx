import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, MessageSquare, Trash2, ChevronRight, Clock, Tag } from 'lucide-react';

export default function QueryHistory({ history, onSelect, onClear, onRemove, currentChatId }) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <div className="h-20 w-20 bg-zinc-50 rounded-[2rem] flex items-center justify-center text-zinc-300 mb-6 shadow-inner">
          <History size={32} />
        </div>
        <p className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2">No sessions yet</p>
        <p className="text-[10px] font-medium text-zinc-400 leading-relaxed">
          Start your first research 🚀<br/>
          Click 'New Research Session' to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <History size={14} className="text-zinc-400" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Recent Sessions</h3>
        </div>
        <button 
          onClick={onClear}
          className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 hover:text-red-500 transition-colors"
        >
          Clear All
        </button>
      </div>

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {history.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`group relative border rounded-[1.5rem] p-4 transition-all cursor-pointer overflow-hidden ${
                currentChatId === item.id 
                  ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-100' 
                  : 'bg-white border-zinc-100 hover:border-indigo-200 hover:shadow-xl hover:shadow-zinc-200/50'
              }`}
              onClick={() => onSelect(item)}
            >
              {/* Active State Background Glow */}
              {currentChatId === item.id && (
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <MessageSquare size={60} className="text-white" />
                </div>
              )}

              <div className="flex items-start gap-3 relative z-10">
                <div className={`mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  currentChatId === item.id 
                    ? 'bg-white/20 text-white' 
                    : 'bg-zinc-50 text-zinc-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:scale-110'
                }`}>
                  <MessageSquare size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold truncate leading-tight mb-1.5 transition-colors ${
                    currentChatId === item.id ? 'text-white' : 'text-zinc-900'
                  }`}>
                    {item.title || 'Untitled Session'}
                  </p>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className={currentChatId === item.id ? 'text-indigo-200' : 'text-zinc-300'} />
                      <span className={`text-[9px] font-bold uppercase tracking-tighter ${
                        currentChatId === item.id ? 'text-indigo-100' : 'text-zinc-400'
                      }`}>
                        {(() => {
                          let date;
                          if (item.updatedAt?.toDate) date = item.updatedAt.toDate();
                          else if (item.createdAt?.toDate) date = item.createdAt.toDate();
                          else if (item.updatedAt) date = new Date(item.updatedAt);
                          else if (item.createdAt) date = new Date(item.createdAt);
                          
                          return date && !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Recent';
                        })()}
                      </span>
                    </div>
                    {item.tag && (
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                        currentChatId === item.id 
                          ? 'bg-white/10 border-white/20 text-white' 
                          : 'bg-indigo-50 border-indigo-100 text-indigo-600'
                      }`}>
                        <Tag size={8} />
                        <span className="text-[8px] font-bold uppercase tracking-tighter">
                          {item.tag}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  className={`opacity-0 group-hover:opacity-100 p-2 rounded-xl transition-all ${
                    currentChatId === item.id 
                      ? 'hover:bg-white/10 text-white/60 hover:text-white' 
                      : 'hover:bg-red-50 text-zinc-300 hover:text-red-500'
                  }`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
