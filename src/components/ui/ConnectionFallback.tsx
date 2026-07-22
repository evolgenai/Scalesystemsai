"use client";

import { RefreshCw, type LucideIcon } from "lucide-react";

type ConnectionFallbackProps = {
  title: string;
  description: string;
  onRetry: () => void;
  icon?: LucideIcon;
  compact?: boolean;
  detail?: string;
};

/**
 * Shared user-facing fallback for WebGL / SSE / stream failures.
 * Single-click "Retry Connection" remounts the protected surface.
 */
export default function ConnectionFallback({
  title,
  description,
  onRetry,
  icon: Icon,
  compact = false,
  detail,
}: ConnectionFallbackProps) {
  return (
    <div
      role="alert"
      className={`flex h-full w-full flex-col items-center justify-center border border-emerald-500/25 bg-[#0a1210] text-center ${
        compact ? "gap-2 rounded-lg p-4" : "gap-3 rounded-2xl p-6 sm:p-8"
      }`}
    >
      {Icon ? (
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        </span>
      ) : null}
      <div className="max-w-sm space-y-1.5">
        <p
          className={`font-display font-semibold text-white ${
            compact ? "text-sm" : "text-base"
          }`}
        >
          {title}
        </p>
        <p className="text-[12px] leading-relaxed text-slate-muted">
          {description}
        </p>
        {detail ? (
          <p className="truncate font-mono text-[10px] text-rose-300/70">
            {detail}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/20 active:scale-[0.98]"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Retry Connection
      </button>
    </div>
  );
}
