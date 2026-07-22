"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Short label shown on the recovery card (e.g. "Marketplace"). */
  label?: string;
  /** Optional compact variant for nested panels. */
  compact?: boolean;
  /** Remount children when this value changes (external reset). */
  resetKey?: string | number;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
  resetCount: number;
  eventId: string | null;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, resetCount: 0, eventId: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);

    const eventId = Sentry.captureException(error, {
      tags: {
        boundary: "react-error-boundary",
        surface: this.props.label ?? "view",
      },
      contexts: {
        react: {
          componentStack: info.componentStack,
        },
        ui: {
          label: this.props.label ?? "view",
          compact: Boolean(this.props.compact),
          resetKey: this.props.resetKey ?? null,
        },
      },
      extra: {
        digest: (error as Error & { digest?: string }).digest ?? null,
      },
    });

    this.setState({ eventId });

    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[ErrorBoundary:${this.props.label ?? "view"}]`,
        error,
        info,
        eventId ? `sentry:${eventId}` : ""
      );
    }
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (
      this.state.error &&
      this.props.resetKey !== undefined &&
      prev.resetKey !== this.props.resetKey
    ) {
      this.setState((s) => ({
        error: null,
        eventId: null,
        resetCount: s.resetCount + 1,
      }));
    }
  }

  private hotReload = () => {
    this.setState((s) => ({
      error: null,
      eventId: null,
      resetCount: s.resetCount + 1,
    }));
  };

  render() {
    const { error, resetCount, eventId } = this.state;
    const { children, label = "Panel", compact = false, fallback } = this.props;

    if (error) {
      if (fallback) return fallback;
      return (
        <div
          role="alert"
          className={`overflow-hidden rounded-lg border border-emerald-500/25 bg-[#121212] ${
            compact ? "p-3.5" : "p-5"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition-transform duration-300 hover:scale-105">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-white">
                {label} crashed
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-muted">
                A render exception was isolated here. Hot-reload this panel —
                the rest of the console stays live.
              </p>
              {!compact && error.message ? (
                <p className="mt-2 truncate font-mono text-[10px] text-rose-300/80">
                  {error.message}
                </p>
              ) : null}
              {!compact && eventId ? (
                <p className="mt-1 font-mono text-[9px] text-slate-500">
                  Sentry {eventId}
                </p>
              ) : null}
              <button
                type="button"
                onClick={this.hotReload}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:border-emerald-400/60 hover:bg-emerald-500/20 active:scale-[0.98]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <div key={resetCount}>{children}</div>;
  }
}
