import { Component, ErrorInfo, ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  title?: string;
  scope?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error(`[GhostCompute ErrorBoundary${this.props.scope ? ` - ${this.props.scope}` : ''}]:`, error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleCopyError = (): void => {
    const { error, errorInfo } = this.state;
    const details = [
      `GhostCompute Error Report`,
      `Timestamp: ${new Date().toISOString()}`,
      `Scope: ${this.props.scope || 'Root'}`,
      `Message: ${error?.message || 'Unknown error'}`,
      `Stack: ${error?.stack || 'No stack trace'}`,
      `Component Stack: ${errorInfo?.componentStack || 'No component stack'}`,
    ].join('\n\n');

    navigator.clipboard.writeText(details).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(err => {
      console.error('Failed to copy error report:', err);
    });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || 'An unexpected rendering error occurred.';
      const isRoot = !this.props.scope || this.props.scope === 'root';

      return (
        <div className={`flex flex-col items-center justify-center p-6 ${isRoot ? 'min-h-screen bg-[var(--gc-bg)]' : 'w-full py-8'}`}>
          <div className="double-bezel w-full max-w-xl shadow-2xl border-rose-500/30">
            <div className="double-bezel-inner p-6 md:p-8 flex flex-col gap-6 bg-[var(--gc-surface)]">
              
              {/* Header with Icon and Title */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-400 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
                  <Icon name="error" size={26} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--gc-text)] tracking-tight">
                    {this.props.title || 'Component Error Intercepted'}
                  </h3>
                  <p className="text-xs text-[var(--gc-text-muted)] mt-1 leading-relaxed">
                    GhostCompute caught an unhandled exception in {this.props.scope || 'the application tree'}. Your background daemon and configuration remain safe.
                  </p>
                </div>
              </div>

              {/* Error Message Box */}
              <div className="p-3.5 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] text-xs font-mono text-rose-300 break-words leading-relaxed select-text">
                {errorMessage}
              </div>

              {/* Stack Trace Accordion */}
              {this.state.error?.stack && (
                <details className="text-xs text-[var(--gc-text-muted)] group">
                  <summary className="cursor-pointer text-[11px] font-semibold text-[var(--gc-text-muted)] hover:text-[var(--gc-text)] transition-colors select-none">
                    View technical stack trace
                  </summary>
                  <pre className="mt-2.5 p-3 rounded-lg bg-black/60 border border-white/5 font-mono text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text max-h-48">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--gc-border)]">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={this.handleCopyError}
                  className="flex items-center gap-1.5 text-xs text-[var(--gc-text-muted)] hover:text-[var(--gc-text)]"
                >
                  <Icon name={this.state.copied ? 'check' : 'content_copy'} size={14} />
                  <span>{this.state.copied ? 'Copied' : 'Copy Report'}</span>
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={this.handleReset}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Icon name="refresh" size={14} />
                    <span>Try Again</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={this.handleReload}
                    className="flex items-center gap-1.5 text-xs px-4"
                  >
                    <Icon name="replay" size={14} />
                    <span>Reload App</span>
                  </Button>
                </div>
              </div>

            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
