"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  Scale,
  Terminal,
  XCircle,
} from "lucide-react";
import type { AgentStreamEvent } from "@/lib/agents/streamProtocol";
import type {
  DebateTurn,
  DebateVote,
  RecalledMemory,
  SandboxExecutionFrame,
  StreamConnectionState,
  StreamResultItem,
} from "@/lib/agents/useAgentStream";
import CapacityLimitModal from "@/components/dashboard/CapacityLimitModal";
import DebateArena from "@/components/dashboard/DebateArena";
import RecalledMemoriesIndicator from "@/components/dashboard/RecalledMemoriesIndicator";
import ResultMarkdown from "@/components/dashboard/ResultMarkdown";
import SandboxConsole from "@/components/dashboard/SandboxConsole";
import WorkspaceActivityFeed from "@/components/org/WorkspaceActivityFeed";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

type LiveStreamTerminalProps = {
  lines: AgentStreamEvent[];
  /** Pre-parsed digests from the SSE hook (preferred for the left pane). */
  results?: StreamResultItem[];
  connection: StreamConnectionState;
  sessionId?: string | null;
  debateTurns?: DebateTurn[];
  consensusPending?: boolean;
  debateVote?: DebateVote | null;
  recalledMemories?: RecalledMemory[];
  sandboxFrames?: SandboxExecutionFrame[];
  onDebateVoteRegistered?: (vote: DebateVote) => void;
  paymentRequired?: boolean;
  onDismissPaymentRequired?: () => void;
  onProceedCheckout?: () => void;
  onPause?: () => void;
  onResume?: () => void;
};

function formatStamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

function latencyMs(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "0ms";
  return `${delta}ms`;
}

function personalityPrefix(agentName?: string): string {
  const name = (agentName ?? "").toLowerCase();
  if (name.includes("code")) return "ARCHITECT";
  if (name.includes("scraper") || name.includes("web")) return "SCRAPER";
  if (name.includes("orchestrator") || name.includes("system")) {
    return "ORCHESTRATOR";
  }
  if (name.includes("support")) return "SUPPORT";
  if (name.includes("lead")) return "SENTINEL";
  return "NODE";
}

function verbosify(event: AgentStreamEvent): string[] {
  const stamp = formatStamp(event.timestamp);
  const tag = personalityPrefix(event.agentName);
  const lines: string[] = [];

  if (
    event.type === "debate_turn" ||
    event.type === "consensus_pending" ||
    event.type === "memory_recalled" ||
    event.type === "sandbox_execution"
  ) {
    return [];
  }

  if (event.command) {
    lines.push(`${stamp} $ ${event.command}`);
  }

  if (event.type === "command" && event.message.startsWith("$")) {
    lines.push(`${stamp} ${event.message}`);
  } else if (event.type === "heartbeat") {
    lines.push(
      `${stamp} [${tag}] heartbeat ok · rtt=${latencyMs(event.timestamp)}`
    );
  } else if (event.agentName?.toLowerCase().includes("code")) {
    lines.push(
      `${stamp} [${tag}] precision_check=pass · ${event.message}`
    );
  } else if (event.agentName?.toLowerCase().includes("scraper")) {
    lines.push(
      `${stamp} [${tag}] fetch_window_open · ${event.message}`
    );
  } else if (event.agentName?.toLowerCase().includes("orchestrator")) {
    lines.push(
      `${stamp} [${tag}] DIRECTIVE :: ${event.message}`
    );
  } else {
    lines.push(
      `${stamp} [${tag}] ${event.message}`
    );
  }

  if (event.status === "EXECUTING") {
    lines.push(
      `${stamp} [kernel] pid=swarm-${(event.agentId ?? "0").slice(0, 6)} state=RUN cpu=ok`
    );
  }

  return lines;
}

function collectResults(
  lines: AgentStreamEvent[]
): StreamResultItem[] {
  const results: StreamResultItem[] = [];

  for (const [index, event] of lines.entries()) {
    if (event.resultMarkdown?.trim()) {
      results.push({
        id: `${event.timestamp}-md-${index}`,
        markdown: event.resultMarkdown.trim(),
        agent: event.agentName,
      });
      continue;
    }

    if (event.type === "result" || event.type === "summary") {
      results.push({
        id: `${event.timestamp}-res-${index}`,
        markdown: event.message,
        agent: event.agentName,
      });
      continue;
    }

    if (
      event.message.startsWith("[gemini:digest]") ||
      event.message.startsWith("[webScraper:content]")
    ) {
      results.push({
        id: `${event.timestamp}-dig-${index}`,
        markdown: event.message
          .replace(/^\[gemini:digest\]\s*/, "")
          .replace(/^\[webScraper:content\]\s*/, ""),
        agent: event.agentName,
      });
    }
  }

  return results.slice(-40);
}

function ResultsPane({
  results,
  debateTurns,
  consensusPending,
  sessionId,
  debateVote,
  sandboxFrames,
  onDebateVoteRegistered,
}: {
  results: StreamResultItem[];
  debateTurns: DebateTurn[];
  consensusPending: boolean;
  sessionId: string | null;
  debateVote: DebateVote | null;
  sandboxFrames: SandboxExecutionFrame[];
  onDebateVoteRegistered?: (vote: DebateVote) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [leftTab, setLeftTab] = useState<"results" | "debate">("results");

  useEffect(() => {
    if (debateTurns.length > 0 || consensusPending) {
      setLeftTab("debate");
    }
  }, [debateTurns.length, consensusPending]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || leftTab !== "results") return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [results, sandboxFrames, leftTab]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-white/10">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#0a0e16] px-2 py-1.5">
        <button
          type="button"
          onClick={() => setLeftTab("results")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${
            leftTab === "results"
              ? "bg-cyan-accent/15 text-cyan-accent"
              : "text-slate-dim hover:text-slate-muted"
          }`}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Actual Results
        </button>
        <button
          type="button"
          onClick={() => setLeftTab("debate")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${
            leftTab === "debate"
              ? "bg-amber-400/15 text-amber-200"
              : "text-slate-dim hover:text-slate-muted"
          }`}
        >
          <Scale className="h-3.5 w-3.5" aria-hidden />
          Debate Arena
          {debateTurns.length > 0 ? (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] tabular-nums">
              {debateTurns.length}
            </span>
          ) : null}
        </button>
      </div>

      {leftTab === "debate" ? (
        <DebateArena
          turns={debateTurns}
          consensusPending={consensusPending}
          sessionId={sessionId}
          lockedVote={debateVote}
          onVoteRegistered={(vote) => onDebateVoteRegistered?.(vote)}
        />
      ) : (
        <div
          ref={scrollerRef}
          className="terminal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        >
          {results.length === 0 && sandboxFrames.length === 0 ? (
            <p className="text-sm text-slate-dim">
              Human-readable outcomes will appear here — greetings, scrape
              summaries, and sandbox digests.
            </p>
          ) : (
            <div className="space-y-4">
              {results.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  {item.agent ? (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-accent/80">
                      {item.agent}
                    </p>
                  ) : null}
                  <ResultMarkdown markdown={item.markdown} />
                </article>
              ))}

              {sandboxFrames.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300/80">
                    Live sandbox telemetry
                  </p>
                  {sandboxFrames.map((frame) => (
                    <SandboxConsole
                      key={frame.id}
                      status={frame.status}
                      language={frame.language}
                      stdout={frame.stdout}
                      stderr={frame.stderr}
                      exitCode={frame.exitCode}
                      title="Agent Sandbox Execution"
                      mode={frame.code ? "direct" : "swarm"}
                      traceLogs={frame.message}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VerbosePane({
  verboseLines,
  connection,
}: {
  verboseLines: string[];
  connection: StreamConnectionState;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [stealthOpen, setStealthOpen] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stealthOpen) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [verboseLines, stealthOpen]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#0a0e16] px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-blue-400" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
            Swarm Surface
          </span>
        </div>
        <button
          type="button"
          onClick={() => setStealthOpen((open) => !open)}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-dim transition hover:border-cyan-accent/30 hover:text-cyan-accent"
          aria-expanded={stealthOpen}
        >
          Stealth Trace Logs
          <span className="tabular-nums text-cyan-accent/80">
            {verboseLines.length}
          </span>
        </button>
      </div>

      {stealthOpen ? (
        <div
          ref={scrollerRef}
          className="terminal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 font-mono text-[11px] sm:text-xs"
          role="log"
          aria-live="polite"
        >
          {verboseLines.length === 0 ? (
            <p className="animate-pulse text-slate-dim">
              {connection === "connecting"
                ? "$ opening ReadableStream channel…"
                : "$ awaiting swarm telemetry…"}
            </p>
          ) : (
            verboseLines.map((line, index) => {
              const isLatest = index === verboseLines.length - 1;
              return (
                <div
                  key={`${line}-${index}`}
                  className={`mb-1.5 break-words leading-relaxed ${
                    line.includes("SECURITY") || line.includes("ERROR")
                      ? "text-rose-400"
                      : line.startsWith("$") || line.includes(" $ ")
                        ? "text-blue-300"
                        : isLatest
                          ? "text-cyan-accent"
                          : "text-slate-300"
                  }`}
                >
                  {line}
                </div>
              );
            })
          )}
          {connection === "live" ? (
            <div className="mt-2 flex items-center gap-1 text-cyan-accent">
              <span className="text-cyan-500/50">$</span>
              <span className="h-3.5 w-1.5 animate-pulse bg-cyan-accent" />
            </div>
          ) : connection === "paused" ? (
            <div className="mt-2 flex items-center gap-1.5 text-amber-300">
              <Pause className="h-3 w-3" aria-hidden />
              <span className="text-[10px] uppercase tracking-wider">
                swarm paused — awaiting directive
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm text-slate-muted">
            Multi-agent kernel chatter is folded into Stealth Trace Logs.
          </p>
          <p className="max-w-xs text-[11px] text-slate-dim">
            Expand only when you need low-level swarm diagnostics.
          </p>
          {connection === "live" ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-blue-300">
              stream live
            </p>
          ) : connection === "paused" ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-amber-300">
              stream paused
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function LiveStreamTerminal({
  lines,
  results: resultsProp,
  connection,
  sessionId = null,
  debateTurns = [],
  consensusPending = false,
  debateVote = null,
  recalledMemories = [],
  sandboxFrames = [],
  onDebateVoteRegistered,
  paymentRequired = false,
  onDismissPaymentRequired,
  onProceedCheckout,
  onPause,
  onResume,
}: LiveStreamTerminalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [directive, setDirective] = useState("");
  const [intervenePending, setIntervenePending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (connection !== "paused") {
      setDirective("");
      setIntervenePending(false);
    }
  }, [connection]);

  const verboseLines = useMemo(
    () => lines.flatMap((event) => verbosify(event)),
    [lines]
  );
  const derivedResults = useMemo(() => collectResults(lines), [lines]);
  const results = resultsProp ?? derivedResults;
  const isLive = connection === "live";
  const isPaused = connection === "paused";
  const canPause = isLive;
  const canResume = isPaused;

  const postIntervene = async (body: {
    sessionId: string;
    action: "pause" | "resume";
    directive?: string;
  }) => {
    const response = await fetch("/api/agents/intervene", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getClientAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      message?: string;
    };

    if (!response.ok || payload.success === false) {
      throw new Error(
        payload.error ??
          payload.message ??
          `Intervention failed (HTTP ${response.status}).`
      );
    }
  };

  const handlePause = async () => {
    if (!sessionId || !canPause || actionPending) return;
    setActionPending(true);
    setToast(null);
    try {
      await postIntervene({ sessionId, action: "pause" });
      onPause?.();
    } catch (error) {
      setToast({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to pause swarm.",
      });
    } finally {
      setActionPending(false);
    }
  };

  const submitDirective = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = directive.trim();
    if (!trimmed || !sessionId || intervenePending || actionPending) return;

    setIntervenePending(true);
    setToast(null);

    try {
      await postIntervene({
        sessionId,
        action: "resume",
        directive: trimmed,
      });

      setToast({
        tone: "success",
        message: "Directive submitted — resuming swarm.",
      });
      setDirective("");
      onResume?.();
    } catch (error) {
      setToast({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Network error — could not submit directive.",
      });
    } finally {
      setIntervenePending(false);
    }
  };

  const statusLabel = isLive
    ? "Live"
    : isPaused
      ? "Paused"
      : connection;

  const shell = (
    <section
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[#0B0F17] p-6"
          : isPaused
            ? "relative flex min-h-[560px] max-h-[720px] flex-col overflow-hidden rounded-2xl border border-amber-400/25 bg-[#050507] shadow-[0_0_30px_rgba(251,191,36,0.08)]"
            : "relative flex h-[500px] max-h-[600px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#050507] shadow-[0_0_30px_rgba(0,242,254,0.04)]"
      }
    >
      <div className="flex shrink-0 flex-col border-b border-white/10 bg-[#0d0d11]">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-cyan-accent" aria-hidden />
          <span className="font-mono text-xs text-slate-muted">
            runtime-sse-swarm-stream
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1">
            <Radio
              className={`h-3 w-3 ${
                isLive
                  ? "animate-pulse text-blue-400"
                  : isPaused
                    ? "animate-pulse text-amber-400"
                    : connection === "error"
                      ? "text-rose-400"
                      : "text-slate-500"
              }`}
              aria-hidden
            />
            <span
              className={`text-[10px] font-medium uppercase tracking-wide ${
                isLive
                  ? "text-blue-400"
                  : isPaused
                    ? "text-amber-300"
                    : connection === "error"
                      ? "text-rose-400"
                      : "text-slate-500"
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handlePause()}
              disabled={!canPause || actionPending || !sessionId}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-35 ${
                canPause
                  ? "border-amber-400/50 bg-amber-400/15 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.25)] hover:bg-amber-400/25"
                  : "border-white/10 bg-black/30 text-slate-500"
              }`}
              aria-label="Pause swarm"
            >
              <Pause className="h-3 w-3" aria-hidden />
              {actionPending && canPause ? "Pausing…" : "Pause Swarm"}
            </button>
            {canResume ? (
              <button
                type="button"
                onClick={() => onResume?.()}
                disabled={actionPending || intervenePending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400/50 bg-blue-400/15 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300 shadow-[0_0_18px_rgba(59, 130, 246,0.28)] transition hover:bg-blue-400/25 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Resume swarm"
              >
                <Play className="h-3 w-3" aria-hidden />
                Resume Swarm
              </button>
            ) : null}
          </div>

          <RecalledMemoriesIndicator memories={recalledMemories} />

          <button
            type="button"
            onClick={() => setFullscreen((value) => !value)}
            className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-slate-muted transition hover:border-cyan-accent/30 hover:text-cyan-accent"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" aria-hidden />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        </div>
        <div className="border-t border-white/5 px-4 py-1.5">
          <WorkspaceActivityFeed />
        </div>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <ResultsPane
          results={results}
          debateTurns={debateTurns}
          consensusPending={consensusPending}
          sessionId={sessionId}
          debateVote={debateVote}
          sandboxFrames={sandboxFrames}
          onDebateVoteRegistered={onDebateVoteRegistered}
        />
        <VerbosePane verboseLines={verboseLines} connection={connection} />

        <CapacityLimitModal
          open={paymentRequired}
          onClose={() => onDismissPaymentRequired?.()}
          onCheckout={() => onProceedCheckout?.()}
        />
      </div>

      {isPaused ? (
        <form
          onSubmit={submitDirective}
          className="shrink-0 border-t border-amber-400/30 bg-gradient-to-b from-amber-400/[0.08] to-black/40 px-4 py-3"
        >
          <label
            htmlFor="hitl-directive"
            className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200"
          >
            ⚠️ Intervene in swarm directive
          </label>
          <textarea
            id="hitl-directive"
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-amber-400/35 bg-[#0b0f17] px-3 py-2.5 font-mono text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/25"
            placeholder="E.g., 'Stop scraping that domain and focus on the contact page instead...'"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={intervenePending || !directive.trim() || !sessionId}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/45 bg-amber-400/15 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-amber-100 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {intervenePending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Submitting…
                </>
              ) : (
                "Submit Directive"
              )}
            </button>
            {!sessionId ? (
              <span className="text-[10px] text-rose-300">
                Missing session id — relaunch swarm to enable intervention.
              </span>
            ) : null}
          </div>
          {toast ? (
            <div
              role="status"
              className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                toast.tone === "success"
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300"
              }`}
            >
              {toast.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span>{toast.message}</span>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );

  if (fullscreen && mounted) {
    return createPortal(shell, document.body);
  }

  return shell;
}
