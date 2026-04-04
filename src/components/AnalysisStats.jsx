import React from 'react';
import { motion } from 'motion/react';
import { Database, Zap, Clock, FileText, Sparkles, Loader2, Search } from 'lucide-react';

export default function AnalysisStats({ chunks, selectedFiles, isAnalyzing, onSummarize, isSummarizing }) {
  const [summaryLength, setSummaryLength] = React.useState('medium'); // 'short', 'medium', 'detailed'
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedSummaryFiles, setSelectedSummaryFiles] = React.useState([]);

  React.useEffect(() => {
    if (selectedFiles) {
      setSelectedSummaryFiles(selectedFiles.map(f => f.name));
    }
  }, [selectedFiles]);

  if ((!selectedFiles || selectedFiles.length === 0) && !isAnalyzing) return null;

  const filteredFiles = selectedFiles?.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const toggleFileSelection = (fileName) => {
    setSelectedSummaryFiles(prev => 
      prev.includes(fileName) 
        ? prev.filter(name => name !== fileName) 
        : [...prev, fileName]
    );
  };

  const toggleSelectAll = () => {
    if (selectedSummaryFiles.length === selectedFiles.length) {
      setSelectedSummaryFiles([]);
    } else {
      setSelectedSummaryFiles(selectedFiles.map(f => f.name));
    }
  };

  const totalSize = selectedFiles ? selectedFiles.reduce((acc, file) => acc + file.size, 0) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl border border-zinc-100 shadow-xl shadow-zinc-200/50 p-6 mt-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-100">
            <Database size={14} className="text-white" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Analysis Engine</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatItem 
          icon={<FileText size={14} />} 
          label="Corpus Size" 
          value={totalSize > 0 ? `${(totalSize / 1024).toFixed(1)} KB` : '---'} 
        />
        <StatItem 
          icon={<Database size={14} />} 
          label="Knowledge Base" 
          value={`${chunks.length} sections`} 
        />
      </div>

      {/* Document List Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Analyzed Documents</h4>
            <button 
              onClick={toggleSelectAll}
              className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider hover:underline"
            >
              {selectedSummaryFiles.length === selectedFiles?.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <span className="text-[9px] font-medium text-zinc-400">{selectedFiles?.length || 0} Files</span>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={12} />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-[11px] font-medium text-zinc-600 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
          {filteredFiles.length > 0 ? (
            filteredFiles.map((file, idx) => {
              const isSelected = selectedSummaryFiles.includes(file.name);
              return (
                <div
                  key={idx}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${
                    isSelected ? 'bg-indigo-50/30 border-indigo-100' : 'bg-zinc-50 border-zinc-100'
                  } group/doc`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFileSelection(file.name)}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-white text-indigo-600 border border-zinc-100 group-hover/doc:border-indigo-200 transition-colors">
                      <FileText size={14} />
                    </div>
                    <div className="text-left overflow-hidden">
                      <p className="text-[11px] font-bold truncate text-zinc-900">
                        {file.name}
                      </p>
                      <p className="text-[9px] text-zinc-400 uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => onSummarize(summaryLength, [file.name])}
                    disabled={isSummarizing || isAnalyzing}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all group/btn"
                    title={`Summarize ${file.name} only`}
                  >
                    <span className="text-[8px] font-bold uppercase tracking-wider opacity-0 group-hover/btn:opacity-100 transition-opacity">Summarize</span>
                    <Sparkles size={12} />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">No documents found</p>
            </div>
          )}
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Indexing Progress</span>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{isAnalyzing ? 'Processing...' : 'Ready'}</span>
        </div>
        <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden relative mb-6">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: isAnalyzing ? '70%' : '100%' }}
            className={`h-full ${isAnalyzing ? 'bg-indigo-500' : 'bg-emerald-500'} rounded-full relative transition-colors duration-500`}
            transition={{ duration: 1, ease: "circOut" }}
          >
            {isAnalyzing && (
              <motion.div
                animate={{
                  x: ['-100%', '200%'],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2,
                  ease: "linear",
                }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            )}
          </motion.div>
        </div>

        {!isAnalyzing && chunks.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Summary Detail</span>
              <div className="flex p-1 bg-zinc-100 rounded-xl">
                {['short', 'medium', 'detailed'].map((len) => (
                  <button
                    key={len}
                    onClick={() => setSummaryLength(len)}
                    className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      summaryLength === len 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-600'
                    }`}
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSummarize(summaryLength, selectedSummaryFiles)}
              disabled={isSummarizing || selectedSummaryFiles.length === 0}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-2xl font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all"
            >
              {isSummarizing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>
                    {selectedSummaryFiles.length === 1 
                      ? 'Summarize Document' 
                      : selectedSummaryFiles.length === selectedFiles?.length
                        ? 'Summarize All Documents'
                        : `Summarize Documents (${selectedSummaryFiles.length})`}
                  </span>
                </>
              )}
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatItem({ icon, label, value }) {
  return (
    <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
      <div className="flex items-center gap-2 text-zinc-400 mb-1">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm font-bold text-zinc-900">{value}</div>
    </div>
  );
}
