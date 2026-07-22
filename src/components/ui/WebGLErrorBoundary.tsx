"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import * as Sentry from "@sentry/nextjs";
import { Box } from "lucide-react";
import ConnectionFallback from "@/components/ui/ConnectionFallback";

type WebGLErrorBoundaryProps = {
  children: ReactNode;
  label?: string;
  /** Called when WebGL/render fails (e.g. switch to 2D). */
  onError?: (error: Error, info: ErrorInfo) => void;
  className?: string;
};

type WebGLErrorBoundaryState = {
  error: Error | null;
  resetCount: number;
};

/**
 * Isolates Three.js / Canvas failures and offers Retry Connection.
 * Reports rich context to Sentry without crashing the parent tree.
 */
export default class WebGLErrorBoundary extends Component<
  WebGLErrorBoundaryProps,
  WebGLErrorBoundaryState
> {
  state: WebGLErrorBoundaryState = { error: null, resetCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<WebGLErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    Sentry.captureException(error, {
      tags: {
        boundary: "webgl",
        surface: this.props.label ?? "3d-canvas",
      },
      contexts: {
        react: {
          componentStack: info.componentStack,
        },
        webgl: {
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : "ssr",
          label: this.props.label ?? "3d-canvas",
        },
      },
      level: "error",
    });
  }

  private retry = () => {
    this.setState((s) => ({ error: null, resetCount: s.resetCount + 1 }));
  };

  render() {
    const { error, resetCount } = this.state;
    const { children, label = "3D view", className } = this.props;

    if (error) {
      return (
        <div className={className ?? "h-full min-h-[160px] w-full"}>
          <ConnectionFallback
            icon={Box}
            title={`${label} unavailable`}
            description="WebGL failed to initialize or the canvas crashed. Retry to remount the scene."
            detail={error.message}
            onRetry={this.retry}
          />
        </div>
      );
    }

    return (
      <div key={resetCount} className={className ?? "contents"}>
        {children}
      </div>
    );
  }
}
