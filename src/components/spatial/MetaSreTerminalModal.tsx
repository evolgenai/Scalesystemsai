"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bug,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AgentMemoryEntry } from "@/lib/agents/agentMemoryStore";
import type { HardwareInteractable } from "@/components/spatial/InstancedHardwareGrid";

type MemoryFeedResponse = {
  success?: boolean;
  feed?: {
    fetchedAt: string;
    source: string;
    traces: AgentMemoryEntry[];
    counts: Record<string, number>;
  };
  error?: string;
};

type MetaSreTerminalModalProps = {
  node: HardwareInteractable;
  sessionId: string;
  onClose: () => void;
};

function kindIcon(kind: string) {
  if (kind === "auto_patch") return Sparkles;
  if (kind === "sentry_resolution") return Bug;
  return Activity;
}

function kindColor(kind: string): string {
  if (kind === "auto_patch") return "text-[#00ffaa]";
  if (kind === "sentry_resolution") return "text-amber-300";
  return "text-emerald-300";
}

function highlightSummary(text: string): ReactNode[] {
  const parts = text.split(/(\bSS-\d+\b|\/api\/[\w/-]+|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^SS-\d+$/.test(part)) {
      return (
        <span key={i} className="text-amber-300">
          {part}
        </span>
      );
    }
    if (part.startsWith("/api/")) {
      return (
        <span key={i} className="text-cyan-300">
          {part}
        </span>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <span key={i} className="text-[#00ffaa]">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Bio-metallic Meta-SRE / Sentry memory HUD — live traces from
 * /api/spatial/memory-feed after PIN unlock.
 */
export default function MetaSreTerminalModal({
  node,
  sessionId,
  onClose,
}: MetaSreTerminalModalProps) {
  const [traces, setTraces] = useState<AgentMemoryEntry[]>([]);
  const [source, setSource] = useState<string>("…");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | AgentMemoryEntry["kind"]>("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setBusy(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          sessionId,
          node_type:
            node.dialogKind === "meta_sre"
              ? "meta_sre_autofix"
              : node.dialogKind === "sentry_terminal"
                ? "sentry_terminal"
                : "generic",
          limit: "24",
        });
        const res = await fetch(`/api/spatial/memory-feed?${qs}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as MemoryFeedResponse;
        if (!res.ok || !json.feed) {
          throw new Error(json.error ?? "Memory feed unavailable");
        }
        if (cancelled) return;
        setTraces(json.feed.traces);
        setSource(json.feed.source);
        setCounts(json.feed.counts);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Feed failed");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    const id = window.setInterval(load, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [node.id, node.dialogKind, sessionId]);

  const filtered = useMemo(() => {
    if (filter === "all") return traces;
    return traces.filter((t) => t.kind === filter);
  }, [traces, filter]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="meta-sre-memory-title"
        className="flex max-h-[min(86vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f] to-[#121e18] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_20px_40px_-15px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/80">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              meta-sre · persistent memory
            </p>
            <h3
              id="meta-sre-memory-title"
              className="truncate text-sm font-semibold text-white"
            >
              {node.label}
            </h3>
            <p className="mt-0.5 font-mono text-[10px] text-slate-dim">
              feed · {source} · patches {counts.auto_patch ?? 0} · sentry{" "}
              {counts.sentry_resolution ?? 0} · steps{" "}
              {counts.execution_step ?? 0}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Close memory terminal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-white/5 px-4 py-2">
          {(
            [
              ["all", "All"],
              ["auto_patch", "Auto-patches"],
              ["sentry_resolution", "Sentry"],
              ["execution_step", "Steps"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition ${
                filter === id
                  ? "border-[#00ffaa]/40 bg-[#00ffaa]/12 text-[#00ffaa]"
                  : "border-white/10 text-slate-muted hover:border-[#00ffaa]/25 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="terminal-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {busy && traces.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-slate-muted">
              <Loader2 className="h-4 w-4 animate-spin text-[#00ffaa]" />
              loading memory feed…
            </div>
          ) : null}
          {error ? (
            <p className="font-mono text-[11px] text-red-400">{error}</p>
          ) : null}
          <ul className="space-y-2.5">
            {filtered.map((trace) => {
              const Icon = kindIcon(trace.kind);
              return (
                <li
                  key={trace.id}
                  className="rounded-xl border border-white/5 bg-[#050807]/55 px-3 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${kindColor(trace.kind)}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[12px] font-semibold text-white">
                          {trace.title}
                        </p>
                        <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-dim">
                          {trace.kind.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-300">
                        {highlightSummary(trace.summary)}
                      </p>
                      <p className="mt-1.5 font-mono text-[9px] text-slate-dim">
                        {new Date(trace.createdAt).toLocaleString()} ·{" "}
                        {trace.agentId}
                        {trace.sentryIssueId
                          ? ` · ${trace.sentryIssueId}`
                          : ""}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {!busy && filtered.length === 0 ? (
            <p className="py-8 text-center font-mono text-[11px] text-slate-dim">
              No traces in this filter.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
