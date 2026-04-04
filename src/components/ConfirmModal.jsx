import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Are you sure?", 
  message = "This action cannot be undone.",
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger"
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
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
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-100 p-8"
          >
            <div className="flex flex-col items-center text-center">
              <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-6 ${
                variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
              }`}>
                <AlertTriangle size={32} />
              </div>
              
              <h3 className="text-xl font-bold text-zinc-900 tracking-tight mb-2">{title}</h3>
              <p className="text-sm text-zinc-500 font-medium leading-relaxed mb-8">
                {message}
              </p>
              
              <div className="flex gap-3 w-full">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 px-6 py-3 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${
                    variant === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                  }`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
            
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
