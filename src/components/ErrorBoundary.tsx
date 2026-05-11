import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { captureError } from "@/lib/errorSink";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label for telemetry — usually a route name. */
  scope?: string;
  /** Custom fallback render. If omitted, a small inline error card is shown. */
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { scope: this.props.scope, componentStack: info.componentStack });
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.retry);
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-sm font-semibold text-foreground">Something broke on this screen.</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            {this.state.error.message}
          </p>
          <button
            onClick={this.retry}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 text-xs font-medium"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}