"use client";

import { useEffect, useRef } from "react";
import { Loader2, Terminal } from "lucide-react";
import type {
  SandboxExecutionStatus,
  SandboxLanguage,
} from "@/lib/agents/streamProtocol";

export type SandboxConsoleProps = {
  status: SandboxExecutionStatus;
  language?: SandboxLanguage | string | null;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  title?: string;
  compact?: boolean;
};

function statusLabel(
  status: SandboxExecutionStatus,
  exitCode?: number | null
): string {
  if (status === "running") return "running…";
  if (status === "success") {
    return `success (exit code ${exitCode ?? 0})`;
  }
  if (status === "error") {
    return `error (exit code ${exitCode ?? 1})`;
  }
  return "idle";
}

function statusTone(status: SandboxExecutionStatus): string {
  if (status === "running") return "text-cyan-accent";
  if (status === "success") return "text-emerald-300";
  if (status === "error") return "text-rose-300";
  return "text-slate-dim";
}

export default function SandboxConsole({
  status,
  language,
  stdout = "",
  stderr = "",
  exitCode = null,
  title = "Secure Sandbox Console",
  compact = false,
}: SandboxConsoleProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [stdout, stderr, status]);

  return (
    <section
      className={`overflow-hidden rounded-xl border border-emerald-400/25 bg-[#050807] shadow-[0_0_28px_rgba(52,211,153,0.12)] ${
        compact ? "" : "mt-3"
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-emerald-400/20 bg-black/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300/90">
            {title}
          </span>
          {language ? (
            <span className="rounded-full border border-cyan-accent/30 bg-cyan-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-cyan-accent">
              {language}
            </span>
          ) : null}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide ${statusTone(status)}`}
        >
          {status === "running" ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "success"
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : status === "error"
                    ? "bg-rose-400"
                    : status === "running"
                      ? "animate-pulse bg-cyan-accent"
                      : "bg-slate-500"
              }`}
              aria-hidden
            />
          )}
          {statusLabel(status, exitCode)}
        </span>
      </header>

      <div
        ref={scrollerRef}
        className={`terminal-scroll font-mono text-[11px] leading-relaxed ${
          compact ? "max-h-40" : "max-h-56"
        } overflow-y-auto px-3 py-2.5`}
        role="log"
        aria-live="polite"
      >
        {!stdout && !stderr && status === "idle" ? (
          <p className="text-emerald-500/50">$ awaiting sandbox output…</p>
        ) : null}
        {stdout ? (
          <pre className="whitespace-pre-wrap text-emerald-300/95">{stdout}</pre>
        ) : null}
        {stderr ? (
          <pre className="mt-2 whitespace-pre-wrap text-rose-300/95">
            {stderr}
          </pre>
        ) : null}
        {status === "running" && !stdout && !stderr ? (
          <p className="animate-pulse text-cyan-accent/80">
            $ executing isolated payload…
          </p>
        ) : null}
      </div>
    </section>
  );
}
