"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bug,
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AgentMemoryEntry } from "@/lib/agents/agentMemoryStore";
import type { HardwareInteractable } from "@/components/spatial/InstancedHardwareGrid";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";
import { emitSwarmLaser } from "@/lib/spatial/swarmEvents";

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

type DeployStep = {
  step: number;
  name: string;
  status: "pending" | "running" | "ok" | "error";
  detail: string;
};

type ExecutePatchResponse = {
  success?: boolean;
  deploy?: {
    deployId: string;
    status: string;
    steps: DeployStep[];
    targetFile: string;
    sentryIssueId: string | null;
  };
  memories?: AgentMemoryEntry[];
  steps?: DeployStep[];
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

const DEPLOY_ANIM: DeployStep[] = [
  {
    step: 1,
    name: "validate_patch",
    status: "pending",
    detail: "Validating autofix payload…",
  },
  {
    step: 2,
    name: "sandbox_verify",
    status: "pending",
    detail: "Running sandbox smoke checks…",
  },
  {
    step: 3,
    name: "apply_virtual_deploy",
    status: "pending",
    detail: "Applying virtual deploy marker…",
  },
  {
    step: 4,
    name: "record_memory",
    status: "pending",
    detail: "Appending live memory stream…",
  },
];

/**
 * Bio-metallic Meta-SRE / Sentry memory HUD — live traces + Deploy Auto-Fix.
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
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<DeployStep[] | null>(null);
  const [deployLog, setDeployLog] = useState<string[]>([]);

  const refreshFeed = useCallback(async () => {
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
    setTraces(json.feed.traces);
    setSource(json.feed.source);
    setCounts(json.feed.counts);
  }, [node.dialogKind, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setBusy(true);
      setError(null);
      try {
        await refreshFeed();
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
  }, [refreshFeed]);

  const filtered = useMemo(() => {
    if (filter === "all") return traces;
    return traces.filter((t) => t.kind === filter);
  }, [traces, filter]);

  const deployFix = useCallback(
    async (trace: AgentMemoryEntry) => {
      if (deployingId) return;
      setDeployingId(trace.id);
      setProgress(DEPLOY_ANIM.map((s) => ({ ...s })));
      setDeployLog([`> deploy autofix · ${trace.sentryIssueId ?? trace.id}`]);
      playSpatialCue("deploy");
      emitSwarmLaser({
        fromCluster: "meta_sre",
        toCluster: "sandbox",
        label: "auto-patch deploy",
        durationMs: 1800,
      });
      window.setTimeout(() => {
        emitSwarmLaser({
          fromCluster: "sandbox",
          toCluster: "sentry",
          label: "resolution hand-off",
          durationMs: 1600,
        });
      }, 900);

      // Animate progress terminal while request runs
      let stepIdx = 0;
      const animId = window.setInterval(() => {
        stepIdx = Math.min(stepIdx + 1, DEPLOY_ANIM.length);
        setProgress((prev) =>
          (prev ?? DEPLOY_ANIM).map((s, i) => {
            if (i < stepIdx - 1) return { ...s, status: "ok" };
            if (i === stepIdx - 1)
              return {
                ...s,
                status: "running",
                detail: DEPLOY_ANIM[i]?.detail ?? s.detail,
              };
            return s;
          })
        );
        setDeployLog((log) => [
          ...log,
          `[*] ${DEPLOY_ANIM[Math.max(0, stepIdx - 1)]?.name ?? "step"}…`,
        ]);
      }, 420);

      try {
        const payloadTarget =
          typeof trace.payload?.targetFile === "string"
            ? trace.payload.targetFile
            : undefined;
        const payloadPatch =
          typeof trace.payload?.patch === "string"
            ? trace.payload.patch
            : undefined;

        const res = await fetch("/api/agents/execute-patch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            memoryId: trace.id,
            sentryIssueId: trace.sentryIssueId ?? undefined,
            title: `Deploy · ${trace.title}`,
            summary: trace.summary,
            targetFile: payloadTarget,
            patch: payloadPatch,
            nodeId: node.id,
            agentId: "meta-sre",
            dryRun: false,
          }),
        });
        const json = (await res.json()) as ExecutePatchResponse;
        window.clearInterval(animId);

        if (!res.ok || !json.deploy) {
          throw new Error(json.error ?? "Deploy failed");
        }

        setProgress(
          (json.steps ?? json.deploy.steps).map((s) => ({
            ...s,
            status: s.status === "pending" ? "ok" : s.status,
          }))
        );
        setDeployLog((log) => [
          ...log,
          `[ok] ${json.deploy!.deployId} · ${json.deploy!.status}`,
          `[ok] target ${json.deploy!.targetFile}`,
          "[*] refreshing memory stream…",
        ]);

        if (json.memories?.length) {
          setTraces((prev) => {
            const merged = [...json.memories!, ...prev];
            const seen = new Set<string>();
            return merged.filter((m) => {
              if (seen.has(m.id)) return false;
              seen.add(m.id);
              return true;
            });
          });
          setCounts((c) => ({
            ...c,
            auto_patch:
              (c.auto_patch ?? 0) +
              json.memories!.filter((m) => m.kind === "auto_patch").length,
            sentry_resolution:
              (c.sentry_resolution ?? 0) +
              json.memories!.filter((m) => m.kind === "sentry_resolution")
                .length,
            execution_step:
              (c.execution_step ?? 0) +
              json.memories!.filter((m) => m.kind === "execution_step").length,
          }));
        } else {
          await refreshFeed();
        }
        setFilter("all");
      } catch (err) {
        window.clearInterval(animId);
        setProgress((prev) =>
          (prev ?? DEPLOY_ANIM).map((s) =>
            s.status === "running" || s.status === "pending"
              ? { ...s, status: "error" as const }
              : s
          )
        );
        setDeployLog((log) => [
          ...log,
          `[err] ${err instanceof Error ? err.message : "Deploy failed"}`,
        ]);
        playSpatialCue("error");
      } finally {
        setDeployingId(null);
      }
    },
    [deployingId, node.id, refreshFeed, sessionId]
  );

  const canDeploy = (trace: AgentMemoryEntry) =>
    trace.kind === "sentry_resolution" ||
    trace.kind === "auto_patch" ||
    !!trace.sentryIssueId;

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

        {(progress || deployLog.length > 0) && (
          <div className="border-b border-white/5 bg-[#050807]/70 px-4 py-2.5">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-[#00ffaa]/75">
              deploy terminal
            </p>
            {progress ? (
              <ul className="mb-2 space-y-1">
                {progress.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center gap-2 font-mono text-[10px]"
                  >
                    <span
                      className={
                        s.status === "ok"
                          ? "text-[#00ffaa]"
                          : s.status === "running"
                            ? "text-amber-300"
                            : s.status === "error"
                              ? "text-red-400"
                              : "text-slate-dim"
                      }
                    >
                      {s.status === "ok"
                        ? "✓"
                        : s.status === "running"
                          ? "›"
                          : s.status === "error"
                            ? "✕"
                            : "·"}
                    </span>
                    <span className="text-slate-300">
                      {s.name.replace(/_/g, " ")}
                    </span>
                    <span className="truncate text-slate-dim">{s.detail}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="max-h-20 overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-muted">
              {deployLog.slice(-8).map((line, i) => (
                <p key={`${line}-${i}`}>{line}</p>
              ))}
            </div>
          </div>
        )}

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
              const showDeploy = canDeploy(trace);
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
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-[9px] text-slate-dim">
                          {new Date(trace.createdAt).toLocaleString()} ·{" "}
                          {trace.agentId}
                          {trace.sentryIssueId
                            ? ` · ${trace.sentryIssueId}`
                            : ""}
                        </p>
                        {showDeploy ? (
                          <button
                            type="button"
                            disabled={!!deployingId}
                            onClick={() => void deployFix(trace)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#00ffaa]/40 bg-[#00ffaa]/15 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#00ffaa] shadow-[0_0_18px_rgba(0,255,170,0.12)] transition hover:bg-[#00ffaa]/25 disabled:opacity-45"
                          >
                            {deployingId === trace.id ? (
                              <Loader2
                                className="h-3 w-3 animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <Rocket className="h-3 w-3" aria-hidden />
                            )}
                            Deploy Auto-Fix
                          </button>
                        ) : null}
                      </div>
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
