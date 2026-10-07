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
      // Styled with design tokens so the crash screen follows the active
      // theme (data-theme is set pre-paint by the script in index.html).
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-6 select-text"
          style={{ background: 'var(--background)', color: 'var(--foreground)' }}
        >
          <div className="panel max-w-2xl w-full p-10 rounded-2xl space-y-6" style={{ borderColor: 'var(--danger-border)' }}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)' }}
            >
              <svg className="w-8 h-8" style={{ color: 'var(--danger)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--danger)' }}>Application Rendering Crash</h2>
              <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                React caught an unhandled runtime error during rendering. This is usually caused by an unexpected data shape or browser API restriction.
              </p>
            </div>

            <div
              className="rounded-xl p-5 font-mono text-xs overflow-x-auto space-y-2 max-h-[300px]"
              style={{ background: 'var(--overlay-light)', border: '1px solid var(--border-subtle)', color: 'var(--danger)' }}
            >
              <p className="font-bold">{this.state.error?.name}: {this.state.error?.message}</p>
              <pre className="opacity-70 whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>{this.state.error?.stack}</pre>
            </div>

            <div className="flex gap-4">
              <button onClick={() => window.location.reload()} className="btn btn-ghost">
                Reload Page
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.href = '/';
                }}
                className="btn btn-primary"
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
