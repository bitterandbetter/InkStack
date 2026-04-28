import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('InkStack render error', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-bg-base px-6 text-text-primary">
          <div className="w-full max-w-xl rounded-lg border border-border-subtle bg-bg-panel p-5 shadow-sm">
            <h1 className="text-[16px] font-semibold">InkStack failed to render</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              A runtime error stopped the desktop interface. The details are kept short here so the app does not fall back to a blank window.
            </p>
            <pre className="mt-4 max-h-52 overflow-auto rounded border border-border-subtle bg-bg-base p-3 text-[12px] leading-relaxed text-text-secondary">
              {this.state.error.message}
            </pre>
            <button
              className="mt-4 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
