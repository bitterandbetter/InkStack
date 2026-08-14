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
            <h1 className="text-[16px] font-semibold">InkStack 界面出现异常</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              应用已拦截运行错误，因此不会显示空白窗口。可以先尝试返回界面；若问题仍然出现，请重新载入应用。
            </p>
            <pre className="mt-4 max-h-52 overflow-auto rounded border border-border-subtle bg-bg-base p-3 text-[12px] leading-relaxed text-text-secondary">
              {this.state.error.message}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                onClick={() => this.setState({ error: null })}
              >
                返回界面
              </button>
              <button
                className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90"
                onClick={() => window.location.reload()}
              >
                重新载入
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
