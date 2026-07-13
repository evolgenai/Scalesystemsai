"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  const diagnosticCode = error.message || error.digest || "UNKNOWN_BOUNDARY_FAULT";

  return (
    <html lang="en">
      <body className="min-h-screen bg-obsidian font-sans text-slate-100 antialiased">
        <main className="flex min-h-screen items-center justify-center bg-obsidian px-4 py-10 sm:px-6">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-glow backdrop-blur-xl sm:p-8">
            <header className="mb-6 text-center">
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-accent/80">
                Fault Containment Layer
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                System Boundary Disruption
              </h1>
            </header>

            <p className="mb-6 text-center text-sm leading-relaxed text-slate-muted sm:text-base">
              An isolation event has occurred at the application root. The
              runtime has been quarantined to prevent cascading failures across
              the system boundary. Review the diagnostic output below, then
              attempt recovery when ready.
            </p>

            <div className="mb-8 overflow-hidden rounded-xl border border-white/10 bg-slate-900/60">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-slate-dim">
                  Diagnostic Console
                </span>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-cyan-accent/90 sm:text-sm">
                <code>{diagnosticCode}</code>
              </pre>
            </div>

            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-accent px-6 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow"
            >
              Attempt Operational State Recovery
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
