"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Maximize2,
  Minimize2,
  Radio,
  Terminal,
} from "lucide-react";
import type { AgentStreamEvent } from "@/lib/agents/streamProtocol";
import type {
  StreamConnectionState,
  StreamResultItem,
} from "@/lib/agents/useAgentStream";
import CapacityLimitModal from "@/components/dashboard/CapacityLimitModal";

type LiveStreamTerminalProps = {
  lines: AgentStreamEvent[];
  /** Pre-parsed digests from the SSE hook (preferred for the left pane). */
  results?: StreamResultItem[];
  connection: StreamConnectionState;
  paymentRequired?: boolean;
  onDismissPaymentRequired?: () => void;
  onProceedCheckout?: () => void;
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
}: {
  results: StreamResultItem[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [results]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-white/10">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0a0e16] px-3 py-2">
        <FileText className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
          Actual Results Pane
        </span>
      </div>
      <div
        ref={scrollerRef}
        className="terminal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
      >
        {results.length === 0 ? (
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
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                  {item.markdown}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
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

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [verboseLines]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0a0e16] px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
          Verbose Kernel Feed
        </span>
      </div>
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
                      ? "text-emerald-300"
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
        ) : null}
      </div>
    </div>
  );
}

export default function LiveStreamTerminal({
  lines,
  results: resultsProp,
  connection,
  paymentRequired = false,
  onDismissPaymentRequired,
  onProceedCheckout,
}: LiveStreamTerminalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const verboseLines = useMemo(
    () => lines.flatMap((event) => verbosify(event)),
    [lines]
  );
  const derivedResults = useMemo(() => collectResults(lines), [lines]);
  const results = resultsProp ?? derivedResults;
  const isLive = connection === "live";

  const shell = (
    <section
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[#0B0F17] p-6"
          : "relative flex h-[500px] max-h-[600px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#050507] shadow-[0_0_30px_rgba(0,242,254,0.04)]"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d0d11] px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-cyan-accent" aria-hidden />
          <span className="font-mono text-xs text-slate-muted">
            runtime-sse-swarm-stream
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1">
            <Radio
              className={`h-3 w-3 ${
                isLive
                  ? "animate-pulse text-emerald-400"
                  : connection === "error"
                    ? "text-rose-400"
                    : "text-slate-500"
              }`}
              aria-hidden
            />
            <span
              className={`text-[10px] font-medium uppercase tracking-wide ${
                isLive
                  ? "text-emerald-400"
                  : connection === "error"
                    ? "text-rose-400"
                    : "text-slate-500"
              }`}
            >
              {isLive ? "Live" : connection}
            </span>
          </div>
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

      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <ResultsPane results={results} />
        <VerbosePane verboseLines={verboseLines} connection={connection} />

        <CapacityLimitModal
          open={paymentRequired}
          onClose={() => onDismissPaymentRequired?.()}
          onCheckout={() => onProceedCheckout?.()}
        />
      </div>
    </section>
  );

  if (fullscreen && mounted) {
    return createPortal(shell, document.body);
  }

  return shell;
}
