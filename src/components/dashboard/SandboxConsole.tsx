"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Terminal } from "lucide-react";
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
  /** Direct code runs show raw output only; swarm runs use polished chrome + stealth drawer. */
  mode?: "direct" | "swarm";
  /** Optional multi-agent trace lines folded under Stealth Trace Logs. */
  traceLogs?: string | string[] | null;
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

function normalizeTrace(traceLogs?: string | string[] | null): string {
  if (!traceLogs) return "";
  if (Array.isArray(traceLogs)) return traceLogs.filter(Boolean).join("\n");
  return traceLogs;
}

/** Strip sandbox policy / restriction boilerplate from operator-facing output. */
function sanitizeConsoleText(raw: string): {
  clean: string;
  restrictedNotes: string;
} {
  if (!raw.trim()) return { clean: "", restrictedNotes: "" };
  const restrictionPattern =
    /restrict|not allowed|blocked by policy|sandbox policy|permission denied|unavailable in this environment|security warning/i;
  const kept: string[] = [];
  const notes: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (restrictionPattern.test(line)) {
      notes.push(line);
      continue;
    }
    kept.push(line);
  }
  return {
    clean: kept.join("\n").trimEnd(),
    restrictedNotes: notes.join("\n").trim(),
  };
}

function StdoutBlock({
  text,
  compact,
}: {
  text: string;
  compact?: boolean;
}) {
  return (
    <pre
      className={`whitespace-pre-wrap rounded-lg border border-emerald-400/30 bg-[#03140c] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.22)] ${
        compact ? "max-h-48 overflow-y-auto" : ""
      }`}
    >
      {text}
    </pre>
  );
}

export default function SandboxConsole({
  status,
  language,
  stdout = "",
  stderr = "",
  exitCode = null,
  title = "Secure Sandbox Console",
  compact = false,
  mode = "swarm",
  traceLogs = null,
}: SandboxConsoleProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [stealthOpen, setStealthOpen] = useState(false);

  const stdoutSanitized = useMemo(
    () => sanitizeConsoleText(stdout),
    [stdout]
  );
  const stderrSanitized = useMemo(
    () => sanitizeConsoleText(stderr),
    [stderr]
  );
  const cleanStdout = stdoutSanitized.clean;
  const cleanStderr = stderrSanitized.clean;
  const restrictionNotes = [
    stdoutSanitized.restrictedNotes,
    stderrSanitized.restrictedNotes,
  ]
    .filter(Boolean)
    .join("\n");

  const trace = useMemo(() => {
    const base = normalizeTrace(traceLogs);
    return [base, restrictionNotes].filter(Boolean).join("\n\n");
  }, [traceLogs, restrictionNotes]);

  const isDirect = mode === "direct";
  const hasStdout = Boolean(cleanStdout);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [cleanStdout, cleanStderr, status]);

  if (isDirect) {
    return (
      <section
        className={`overflow-hidden rounded-lg bg-[#030504] ${compact ? "" : "mt-3"}`}
      >
        <div
          ref={scrollerRef}
          className={`terminal-scroll space-y-2 px-3 py-2.5 ${
            compact ? "max-h-52" : "max-h-64"
          } overflow-y-auto`}
          role="log"
          aria-live="polite"
        >
          {!cleanStdout && !cleanStderr && status === "idle" ? (
            <p className="font-mono text-[11px] text-emerald-500/40">$</p>
          ) : null}
          {hasStdout ? <StdoutBlock text={cleanStdout} compact /> : null}
          {cleanStderr ? (
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-rose-300">
              {cleanStderr}
            </pre>
          ) : null}
          {status === "running" && !cleanStdout && !cleanStderr ? (
            <p className="animate-pulse font-mono text-[11px] text-emerald-400/70">
              …
            </p>
          ) : null}
        </div>
      </section>
    );
  }

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
        className={`terminal-scroll space-y-2 px-3 py-2.5 ${
          compact ? "max-h-44" : "max-h-56"
        } overflow-y-auto`}
        role="log"
        aria-live="polite"
      >
        {!cleanStdout && !cleanStderr && status === "idle" ? (
          <p className="font-mono text-[11px] text-emerald-500/50">
            $ awaiting sandbox output…
          </p>
        ) : null}
        {hasStdout ? <StdoutBlock text={cleanStdout} /> : null}
        {cleanStderr ? (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-rose-300/95">
            {cleanStderr}
          </pre>
        ) : null}
        {status === "running" && !cleanStdout && !cleanStderr ? (
          <p className="animate-pulse font-mono text-[11px] text-cyan-accent/80">
            $ executing isolated payload…
          </p>
        ) : null}
      </div>

      {trace ? (
        <div className="border-t border-white/10">
          <button
            type="button"
            onClick={() => setStealthOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
            aria-expanded={stealthOpen}
          >
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
              Stealth Trace Logs
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-dim transition ${stealthOpen ? "rotate-180 text-cyan-accent" : ""}`}
              aria-hidden
            />
          </button>
          {stealthOpen ? (
            <pre className="max-h-32 overflow-y-auto border-t border-white/5 bg-black/40 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-muted">
              {trace}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
