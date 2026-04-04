import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Loader2, Check, Trash2, AlertCircle, ExternalLink } from 'lucide-react';
import { extractHtmlFromDocx } from '../services/ragService';
import { PdfRenderer } from './PdfRenderer';
import { DocxRenderer } from './DocxRenderer';

export default function FilePreviewModal({ isOpen, onClose, file, onRemove }) {
  const [htmlContent, setHtmlContent] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let url = '';
    const loadPreview = async () => {
      if (isOpen && file) {
        setPreviewUrl('');
        setError(null);
        const extension = file.name.split('.').pop().toLowerCase();
        
        if (extension === 'pdf') {
          setIsLoading(true);
          try {
            url = URL.createObjectURL(file);
            setPreviewUrl(url);
            setIsLoading(false);
          } catch (err) {
            setError('Failed to create preview for this PDF.');
            setIsLoading(false);
          }
        }
      } else {
        setPreviewUrl('');
        setError(null);
      }
    };

    loadPreview();

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [isOpen, file]);

  if (!file) return null;

  const extension = file.name.split('.').pop().toLowerCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
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
            className="relative w-full sm:max-w-5xl h-full sm:h-[90vh] bg-[var(--card-bg)] sm:rounded-3xl shadow-2xl overflow-hidden border border-[var(--line)] flex flex-col transition-colors duration-300"
          >
            {/* Header */}
            <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-[var(--line)] flex items-center justify-between bg-[var(--card-bg)]/80 backdrop-blur-md sticky top-0 z-30 transition-colors duration-300">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-zinc-900 dark:bg-zinc-800 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-xl shadow-zinc-200 dark:shadow-none shrink-0">
                  <FileText size={20} className="text-white sm:hidden" />
                  <FileText size={24} className="text-white hidden sm:block" />
                </div>
                <div className="overflow-hidden">
                  <h2 className="text-base sm:text-xl font-bold text-[var(--ink)] tracking-tight truncate max-w-[150px] xs:max-w-[200px] sm:max-w-md transition-colors duration-300">
                    {file.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-[9px] sm:text-[10px] font-bold text-zinc-500 dark:text-zinc-400 rounded-md uppercase tracking-wider transition-colors duration-300">
                      {extension}
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest transition-colors duration-300">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={onClose}
                  className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-400 transition-all active:scale-95 group"
                  title="Close Preview"
                >
                  <X size={18} className="sm:hidden" />
                  <X size={22} className="hidden sm:block group-hover:rotate-90 transition-transform duration-300" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden bg-zinc-100/50 dark:bg-zinc-900/50 relative transition-colors duration-300">
              {isLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-[var(--card-bg)]/80 backdrop-blur-sm z-10 transition-colors duration-300">
                  <Loader2 size={32} className="text-indigo-600 animate-spin mb-4" />
                  <p className="text-sm font-bold text-[var(--ink)] transition-colors duration-300">Loading Preview...</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 transition-colors duration-300">Rendering your {extension.toUpperCase()} document.</p>
                </div>
              ) : error ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="h-16 w-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-4 border border-red-100 dark:border-red-900/30 transition-colors duration-300">
                    <AlertCircle size={24} className="text-red-500" />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--ink)] mb-1 transition-colors duration-300">Preview Error</h3>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-xs mb-6 transition-colors duration-300">{error}</p>
                  {previewUrl && (
                    <button 
                      onClick={() => window.open(previewUrl, '_blank')}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all"
                    >
                      Try Opening in New Tab
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-full w-full overflow-y-auto custom-scrollbar">
                  {extension === 'pdf' ? (
                    <PdfRenderer file={file} />
                  ) : extension === 'docx' ? (
                    <DocxRenderer file={file} />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <p className="text-sm text-zinc-400 dark:text-zinc-500 transition-colors duration-300">Preview not available for this file type.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-8 py-4 sm:py-5 bg-zinc-50 dark:bg-zinc-900/50 border-t border-[var(--line)] flex items-center justify-between gap-2 transition-colors duration-300">
              <button
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 shrink-0 transition-colors duration-300"
              >
                <Trash2 size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Remove Document</span>
                <span className="xs:hidden">Remove</span>
              </button>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={onClose}
                  className="px-6 sm:px-10 py-2.5 sm:py-3 bg-zinc-900 dark:bg-zinc-800 text-white rounded-xl sm:rounded-2xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-all active:scale-95 flex items-center gap-2 shadow-xl shadow-zinc-200 dark:shadow-none transition-colors duration-300"
                >
                  <Check size={14} className="sm:w-4 sm:h-4" />
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
