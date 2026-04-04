import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, FileText } from 'lucide-react';

// Use a reliable CDN for the worker that matches the installed version
const PDFJS_VERSION = '4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export const PdfRenderer = ({ file }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(0.3);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [renderTask, setRenderTask] = useState(null);

  useEffect(() => {
    const loadPdf = async () => {
      console.log('Starting PDF load for:', file.name);
      setIsLoading(true);
      setError(null);
      
      // Create a timeout to prevent infinite loading state
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF loading timed out after 15 seconds')), 15000)
      );

      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
          cMapPacked: true,
        });
        
        const pdfDoc = await Promise.race([loadingTask.promise, timeoutPromise]);
        console.log('PDF loaded successfully:', pdfDoc.numPages, 'pages');
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setCurrentPage(1);
        setIsLoading(false);
      } catch (err) {
        console.error('PDF loading error detail:', err);
        setError(`Failed to load PDF: ${err.message || 'Unknown error'}. This can happen with very large files or restricted browser environments.`);
        setIsLoading(false);
      }
    };

    if (file) {
      loadPdf();
    }
  }, [file]);

  useEffect(() => {
    const renderPage = async () => {
      if (!pdf || !canvasRef.current) return;

      console.log('Rendering page:', currentPage, 'at scale:', scale);

      // Cancel any ongoing render task
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
      }

      try {
        const page = await pdf.getPage(currentPage);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });

        // Clear canvas and reset transform to prevent artifacts
        canvas.width = canvas.width; 
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        canvas.height = viewport.height * dpr;
        canvas.width = viewport.width * dpr;
        
        context.scale(dpr, dpr);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          intent: 'display',
          renderInteractiveForms: false
        };

        const task = page.render(renderContext);
        setRenderTask(task);
        await task.promise;
        console.log('Page rendered successfully');
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      }
    };

    const timeoutId = setTimeout(renderPage, 100);
    return () => clearTimeout(timeoutId);
  }, [pdf, currentPage, scale]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center bg-[var(--card-bg)] transition-colors duration-300">
        <Loader2 size={32} className="text-indigo-600 animate-spin mb-4" />
        <p className="text-sm font-bold text-[var(--ink)] transition-colors duration-300">Rendering PDF...</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 transition-colors duration-300">Optimizing for your browser environment.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center bg-[var(--card-bg)] transition-colors duration-300">
        <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
        <button 
          onClick={() => window.open(URL.createObjectURL(file), '_blank')}
          className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all"
        >
          Open in New Tab
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-100 dark:bg-zinc-900 relative group transition-colors duration-300">
      {/* Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-4 sm:p-8 md:p-12 flex justify-center custom-scrollbar bg-zinc-100 dark:bg-zinc-900 transition-colors duration-300"
      >
        <div className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-none rounded-sm border border-zinc-200 dark:border-zinc-800 h-fit transition-colors duration-300">
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Floating Controls */}
      <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-xl border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl transition-all duration-300 opacity-95 sm:opacity-90 hover:opacity-100 sm:hover:scale-105 max-w-[95vw] sm:max-w-none overflow-x-auto no-scrollbar">
        <div className="flex items-center bg-zinc-100/50 dark:bg-zinc-900/50 rounded-xl p-0.5 sm:p-1 border border-zinc-200/50 dark:border-zinc-700/50 transition-colors duration-300">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage <= 1}
            className="p-1.5 sm:p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg disabled:opacity-30 transition-all text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            <ChevronLeft size={18} className="sm:w-5 sm:h-5" />
          </button>
          <span className="px-2 sm:px-4 text-[10px] sm:text-[11px] font-bold text-zinc-900 dark:text-white min-w-[60px] sm:min-w-[90px] text-center tabular-nums whitespace-nowrap transition-colors duration-300">
            {currentPage} <span className="text-zinc-400 dark:text-zinc-500 mx-0.5 sm:mx-1">/</span> {numPages}
          </span>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, numPages))}
            disabled={currentPage >= numPages}
            className="p-1.5 sm:p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg disabled:opacity-30 transition-all text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            <ChevronRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="w-px h-5 sm:h-6 bg-zinc-200 dark:bg-zinc-700 mx-0.5 sm:mx-1 shrink-0 transition-colors duration-300" />

        <div className="flex items-center bg-zinc-100/50 dark:bg-zinc-900/50 rounded-xl p-0.5 sm:p-1 border border-zinc-200/50 dark:border-zinc-700/50 transition-colors duration-300">
          <button 
            onClick={() => setScale(prev => Math.max(prev - 0.1, 0.3))}
            className="p-1.5 sm:p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg transition-all text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            <ZoomOut size={18} className="sm:w-5 sm:h-5" />
          </button>
          <span className="px-2 sm:px-4 text-[10px] sm:text-[11px] font-bold text-zinc-900 dark:text-white min-w-[50px] sm:min-w-[70px] text-center tabular-nums transition-colors duration-300">
            {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={() => setScale(prev => Math.min(prev + 0.1, 3))}
            className="p-1.5 sm:p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg transition-all text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            <ZoomIn size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="w-px h-5 sm:h-6 bg-zinc-200 dark:bg-zinc-700 mx-0.5 sm:mx-1 shrink-0 transition-colors duration-300" />

        <button 
          onClick={() => window.open(URL.createObjectURL(file), '_blank')}
          className="p-2.5 sm:p-3 bg-zinc-900 dark:bg-zinc-700 text-white hover:bg-zinc-800 dark:hover:bg-zinc-600 rounded-xl transition-all shadow-lg shadow-zinc-200 dark:shadow-none active:scale-95 shrink-0"
          title="Open in New Tab"
        >
          <Maximize2 size={16} className="sm:w-[18px] sm:h-[18px]" />
        </button>
      </div>
    </div>
  );
};
