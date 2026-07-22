"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        boundary: "app-error",
        nextjs: "app-router",
      },
      contexts: {
        nextjs: {
          digest: error.digest ?? null,
        },
      },
      extra: {
        name: error.name,
        message: error.message,
      },
    });
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-white">
        This view failed to render
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-muted">
        The error was reported to Sentry. Retry Connection remounts this
        segment without a full page reload.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[10px] text-slate-500">
          digest {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/20"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Retry Connection
      </button>
    </div>
  );
}
