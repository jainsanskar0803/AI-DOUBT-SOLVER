import React, { useRef } from 'react';
import { FileText, Upload, X, CheckCircle2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Filters an array of File objects to only PDF and DOCX files.
 * Checks by extension rather than MIME type to handle Windows quirks
 * where .docx files may arrive as application/octet-stream or application/zip.
 *
 * @param {File[]} files
 * @returns {File[]}
 */
const filterValidFiles = (files) =>
  files.filter((f) =>
    ['pdf', 'docx'].includes(f.name.split('.').pop().toLowerCase())
  );

// ─── Component ─────────────────────────────────────────────────────────────

export default function UploadPDF({ onFilesSelect, selectedFiles, onPreview }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = useRef(null);
  const addMoreInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    const validFiles = filterValidFiles(files);

    if (validFiles.length > 0) {
      onFilesSelect(validFiles);
    } else if (files.length > 0) {
      toast.error('Invalid file type', {
        description: 'Please upload PDF or DOCX files only.',
      });
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    const validFiles = filterValidFiles(files);

    if (validFiles.length > 0) {
      onFilesSelect(validFiles);
    } else if (files.length > 0) {
      toast.error('Invalid file type', {
        description: 'Please upload PDF or DOCX files only.',
      });
    }

    // Clear so the same file can be re-uploaded if removed and re-added.
    e.target.value = '';
  };

  const handleAddMoreChange = (e) => {
    const files = Array.from(e.target.files || []);
    const validFiles = filterValidFiles(files);

    if (validFiles.length > 0) {
      onFilesSelect([...(selectedFiles || []), ...validFiles]);
    } else if (files.length > 0) {
      toast.error('Invalid file type', {
        description: 'Please upload PDF or DOCX files only.',
      });
    }

    e.target.value = '';
  };

  const removeFile = (index, e) => {
    e.stopPropagation();
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    onFilesSelect(newFiles);
  };

  const hasFiles = selectedFiles && selectedFiles.length > 0;

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-xl shadow-zinc-200/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-indigo-50 rounded-lg flex items-center justify-center">
            <BookOpen size={14} className="text-indigo-600" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Document Source</h3>
        </div>
        {hasFiles && (
          <motion.span
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 flex items-center gap-1.5 shadow-sm shadow-emerald-100 relative overflow-hidden"
          >
            <CheckCircle2 size={12} className="animate-pulse" />
            {selectedFiles.length} {selectedFiles.length === 1 ? 'File' : 'Files'} Ready
            <motion.div
              className="absolute inset-0 bg-white/40"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            />
          </motion.span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!hasFiles ? (
          <motion.div
            key="upload-prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-[2rem] p-12 flex flex-col items-center justify-center cursor-pointer transition-all group relative overflow-hidden ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02] shadow-xl shadow-indigo-100'
                : 'border-zinc-100 hover:border-indigo-400 hover:bg-zinc-50'
            }`}
          >
            <div
              className={`h-20 w-20 rounded-[2rem] flex items-center justify-center mb-6 transition-all duration-500 ${
                isDragging
                  ? 'bg-indigo-600 text-white scale-110 rotate-12'
                  : 'bg-zinc-50 text-zinc-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:scale-110'
              }`}
            >
              <Upload size={32} />
            </div>
            <p
              className={`text-sm font-bold uppercase tracking-widest transition-colors ${
                isDragging ? 'text-indigo-600' : 'text-zinc-500 group-hover:text-indigo-600'
              }`}
            >
              {isDragging ? 'Drop to Upload' : 'Upload Documents'}
            </p>
            <p className="text-xs text-zinc-400 mt-3 font-medium text-center max-w-[200px] leading-relaxed">
              Drag & drop files or click to browse.<br />Supports PDF and DOCX.
            </p>

            {/* Background Glow */}
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors" />

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx"
              multiple
              className="hidden"
            />
          </motion.div>
        ) : (
          <motion.div
            key="file-display"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-2"
          >
            {selectedFiles.map((file, index) => (
              <motion.div
                key={`${file.name}-${file.size}-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-zinc-50 rounded-2xl p-3 sm:p-4 flex items-center justify-between border border-zinc-100 group hover:border-indigo-300 transition-all hover:bg-white hover:shadow-[0_10px_25px_-5px_rgba(79,70,229,0.1)] relative overflow-hidden"
              >
                <div
                  onClick={() => onPreview && onPreview(file)}
                  className="flex items-center gap-3 overflow-hidden cursor-pointer flex-1"
                >
                  <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border border-zinc-100 group-hover:border-indigo-200 group-hover:scale-105 transition-all">
                    <FileText size={18} className="text-indigo-600" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-zinc-900 truncate group-hover:text-indigo-600 transition-colors">
                        {file.name}
                      </p>
                      <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 uppercase tracking-tighter">
                        Ready
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[9px] font-medium text-zinc-400 uppercase">
                        {(file.size / 1024 / 1024).toFixed(2)} MB •{' '}
                        {file.name.split('.').pop().toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 ml-2 shrink-0">
                  <button
                    onClick={() => onPreview && onPreview(file)}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all group/btn"
                    title="Preview Document"
                  >
                    <BookOpen size={14} className="group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">
                      Preview
                    </span>
                  </button>

                  <button
                    onClick={(e) => removeFile(index, e)}
                    className="p-2 hover:bg-red-50 rounded-xl text-zinc-400 hover:text-red-500 transition-all"
                    title="Remove File"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Desktop Hover Overlay */}
                <div className="hidden lg:block absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/[0.02] pointer-events-none transition-colors" />
              </motion.div>
            ))}

            <button
              onClick={() => addMoreInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-zinc-100 rounded-2xl text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:border-indigo-200 hover:text-indigo-600 transition-all"
            >
              + Add More Files
            </button>

            {/* Separate hidden input for "Add More" to avoid ref conflicts */}
            <input
              type="file"
              ref={addMoreInputRef}
              onChange={handleAddMoreChange}
              accept=".pdf,.docx"
              multiple
              className="hidden"
            />

            {/* Hidden input for the initial upload zone (reused if user clicks the zone again) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx"
              multiple
              className="hidden"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
