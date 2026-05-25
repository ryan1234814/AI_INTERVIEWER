import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled runtime error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 select-text">
          <div className="glass-card max-w-2xl w-full p-10 rounded-[2.5rem] border border-red-500/20 bg-red-500/5 shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-red-400">Application Rendering Crash</h2>
              <p className="text-white/60 text-sm">
                React caught an unhandled runtime error during rendering. This is usually caused by an unexpected data shape or browser API restriction.
              </p>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-2xl p-5 font-mono text-xs text-red-300 overflow-x-auto space-y-2 max-h-[300px]">
              <p className="font-bold">{this.state.error?.name}: {this.state.error?.message}</p>
              <pre className="opacity-70 whitespace-pre-wrap leading-relaxed">{this.state.error?.stack}</pre>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold border border-white/10 transition-all"
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.href = '/';
                }}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-all shadow-lg shadow-blue-500/25"
              >
                Reset App & Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
