"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Loader2,
  Radio,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import type { SwarmTelemetrySnapshot } from "@/lib/telemetry/swarmTelemetry";
import {
  SKILL_LIBRARY_OPEN_EVENT,
  SWARM_TELEMETRY_TOGGLE_EVENT,
} from "@/lib/spatial/swarmEvents";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";
import { useSwarmStream } from "@/hooks/useSwarmStream";
import { useWorkspaceScope } from "@/components/navigation/WorkspaceScopeContext";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

type SwarmResponse = {
  success?: boolean;
  swarm?: SwarmTelemetrySnapshot;
  error?: string;
};

function statusColor(status: string) {
  if (status === "healthy") return "text-[#00ffaa]";
  if (status === "busy") return "text-amber-300";
  if (status === "degraded") return "text-orange-300";
  return "text-slate-dim";
}

function LatencySpark({
  series,
}: {
  series: SwarmTelemetrySnapshot["latencySeries"];
}) {
  const max = Math.max(1, ...series.map((p) => p.p95));
  const w = 220;
  const h = 48;
  const p50 = series
    .map((p, i) => {
      const x = (i / Math.max(1, series.length - 1)) * w;
      const y = h - (p.p50 / max) * (h - 4);
      return `${x},${y}`;
    })
    .join(" ");
  const p95 = series
    .map((p, i) => {
      const x = (i / Math.max(1, series.length - 1)) * w;
      const y = h - (p.p95 / max) * (h - 4);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-12 w-full"
      aria-label="Latency chart"
    >
      <polyline
        fill="none"
        stroke="rgba(0,255,170,0.35)"
        strokeWidth="1.5"
        points={p95}
      />
      <polyline
        fill="none"
        stroke="#00ffaa"
        strokeWidth="2"
        points={p50}
      />
    </svg>
  );
}

/**
 * Sliding bio-metallic swarm telemetry drawer — header button or [T].
 */
export function SwarmTelemetryDrawer() {
  const { workspaceId } = useWorkspaceScope();
  const { counters, recent } = useSwarmStream({ workspaceId, enabled: true });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swarm, setSwarm] = useState<SwarmTelemetrySnapshot | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ workspaceId });
      const res = await fetch(`/api/telemetry/swarm?${qs}`, {
        headers: getClientAuthHeaders(),
        cache: "no-store",
      });
      const json = (await res.json()) as SwarmResponse;
      if (!res.ok || !json.swarm) {
        throw new Error(json.error ?? "Telemetry unavailable");
      }
      setSwarm(json.swarm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const onToggle = (ev: Event) => {
      const detail = (ev as CustomEvent<{ open?: boolean }>).detail;
      setOpen((prev) => {
        const next = typeof detail?.open === "boolean" ? detail.open : !prev;
        if (next) playSpatialCue("navigate");
        return next;
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "KeyT" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) playSpatialCue("navigate");
          return next;
        });
      }
      if (e.code === "Escape") setOpen(false);
    };
    window.addEventListener(SWARM_TELEMETRY_TOGGLE_EVENT, onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(SWARM_TELEMETRY_TOGGLE_EVENT, onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const id = window.setInterval(load, 10_000);
    return () => window.clearInterval(id);
  }, [open, load]);

  const totals = swarm?.totals;

  const handOffs = useMemo(
    () => swarm?.handOffLogs.slice(0, 12) ?? [],
    [swarm]
  );

  return (
    <>
      <div
        className={`fixed inset-y-0 right-0 z-[70] flex w-full max-w-md transform flex-col border-l border-[#00ffaa]/20 bg-gradient-to-b from-[#0b120f] to-[#050807] shadow-[-20px_0_48px_-20px_rgba(0,0,0,0.9)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div>
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/80">
              <Radio className="h-3 w-3" aria-hidden />
              swarm telemetry
            </p>
            <h2 className="text-sm font-semibold text-white">
              Live agent mesh
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              source · {swarm?.source ?? "…"} · sse{" "}
              {counters.connected ? "live" : "…"} · ws {workspaceId.slice(0, 12)}
              · press T
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-[#00ffaa]"
              aria-label="Refresh telemetry"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
              aria-label="Close swarm telemetry"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="font-mono text-[11px] text-red-400">{error}</p>
          ) : null}
          {busy && !swarm ? (
            <div className="flex items-center gap-2 py-8 font-mono text-xs text-slate-muted">
              <Loader2 className="h-4 w-4 animate-spin text-[#00ffaa]" />
              syncing swarm…
            </div>
          ) : null}

          {totals ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                ["agents", Math.max(totals.activeAgents, counters.agentsOnline)],
                [
                  "tok in",
                  totals.tokensIn.toLocaleString(),
                ],
                [
                  "tok out",
                  totals.tokensOut.toLocaleString(),
                ],
                [
                  "avg lat",
                  `${totals.avgLatencyMs}ms`,
                ],
                [
                  "sse gas",
                  counters.gasBalance != null
                    ? counters.gasBalance.toLocaleString()
                    : "—",
                ],
                ["sse inc", counters.openIncidents],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="rounded-xl border border-white/5 bg-[#050807]/6 px-3 py-2"
                >
                  <p className="font-mono text-[9px] uppercase tracking-wider text-slate-dim">
                    {k}
                  </p>
                  <p className="mt-0.5 font-mono text-sm text-[#00ffaa]">{v}</p>
                </div>
              ))}
            </div>
          ) : null}

          {recent.length > 0 ? (
            <div className="rounded-xl border border-[#00ffaa]/15 bg-[#050807]/55 p-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/75">
                live sse feed · {counters.eventCount} events
              </p>
              <ul className="max-h-28 space-y-1 overflow-y-auto font-mono text-[10px] text-slate-muted">
                {recent.slice(0, 8).map((ev, i) => (
                  <li key={`${ev.id ?? i}-${ev.at ?? i}`}>
                    <span className="text-[#00ffaa]/80">{ev.type}</span>
                    {ev.at ? ` · ${new Date(String(ev.at)).toLocaleTimeString()}` : ""}
                    {typeof ev.message === "string"
                      ? ` · ${ev.message.slice(0, 60)}`
                      : typeof ev.agentName === "string"
                        ? ` · ${ev.agentName}`
                        : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {swarm?.latencySeries ? (
            <div className="rounded-xl border border-white/5 bg-[#050807]/55 p-3">
              <p className="mb-1 inline-flex items-center gap-1.5 font-mono text-[10px] text-slate-muted">
                <Activity className="h-3 w-3 text-[#00ffaa]" />
                latency · p50 / p95
              </p>
              <LatencySpark series={swarm.latencySeries} />
            </div>
          ) : null}

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-dim">
              agent health
            </p>
            <ul className="space-y-1.5">
              {(swarm?.agents ?? []).map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-white/5 bg-[#0b120f]/7 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-medium text-white">
                      {a.name}
                    </p>
                    <span
                      className={`font-mono text-[9px] uppercase ${statusColor(a.status)}`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-dim">
                    {a.cluster} · {a.role} · {a.latencyMs}ms · cpu {a.cpuPct}%
                  </p>
                  <p className="font-mono text-[9px] text-slate-dim">
                    tokens {a.tokensIn.toLocaleString()}→
                    {a.tokensOut.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-dim">
              hand-off log
            </p>
            <ul className="space-y-1.5">
              {handOffs.map((h) => (
                <li
                  key={h.id}
                  className="rounded-lg border border-[#00ffaa]/10 bg-[#050807]/7 px-2.5 py-2"
                >
                  <p className="font-mono text-[10px] text-[#00ffaa]/90">
                    {h.fromAgentId} → {h.toAgentId}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-300">{h.summary}</p>
                  <p className="mt-1 font-mono text-[9px] text-slate-dim">
                    {h.kind} · {new Date(h.at).toLocaleTimeString()}
                    {h.sentryIssueId ? ` · ${h.sentryIssueId}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 p-3">
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(SKILL_LIBRARY_OPEN_EVENT));
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#00ffaa]/35 bg-[#00ffaa]/12 px-3 py-2.5 font-mono text-[11px] font-semibold text-[#00ffaa] transition hover:bg-[#00ffaa]/20"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Open Skill Library
          </button>
        </div>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-[1px]"
          aria-label="Dismiss swarm telemetry"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Compact header trigger for the swarm telemetry drawer. */
export function SwarmTelemetryTrigger() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(SWARM_TELEMETRY_TOGGLE_EVENT, {
            detail: { open: true },
          })
        )
      }
      className="hidden items-center gap-1.5 rounded-xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f] to-[#121e18] px-2.5 py-1.5 font-mono text-[10px] font-semibold text-[#00ffaa] transition hover:border-[#00ffaa]/45 sm:inline-flex"
      title="Swarm telemetry (T)"
      aria-label="Open swarm telemetry"
    >
      <Zap className="h-3 w-3" aria-hidden />
      Swarm
    </button>
  );
}

export default SwarmTelemetryDrawer;
