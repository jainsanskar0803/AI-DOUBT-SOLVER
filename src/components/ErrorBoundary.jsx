import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorDetails = null;
      try {
        // Try to parse FirestoreErrorInfo JSON
        if (this.state.error && this.state.error.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a FirestoreErrorInfo JSON
      }

      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-8 border border-zinc-100 text-center">
            <div className="h-16 w-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-rose-500" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Something went wrong</h2>
            <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
              {errorDetails 
                ? `A database error occurred during ${errorDetails.operationType}. Please check your connection or permissions.`
                : "An unexpected error occurred. We've been notified and are looking into it."}
            </p>
            
            {errorDetails && (
              <div className="mb-8 p-4 bg-zinc-50 rounded-2xl text-left">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Error Details</p>
                <p className="text-xs font-mono text-zinc-600 break-all">{errorDetails.error}</p>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-4 mb-2">Path</p>
                <p className="text-xs font-mono text-zinc-600">{errorDetails.path || 'N/A'}</p>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-200/40 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
