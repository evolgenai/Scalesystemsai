"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Coins,
  Hand,
  Loader2,
  Radio,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import type {
  AnalyticsRunLog,
  AnalyticsRunStatus,
  OrgAnalyticsPayload,
  SortKey,
} from "@/lib/org/analyticsTypes";

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStatus(raw: unknown): AnalyticsRunStatus {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("fail") || value.includes("error")) return "Failed";
  if (
    value.includes("termin") ||
    value.includes("cancel") ||
    value.includes("abort")
  ) {
    return "Terminated";
  }
  return "Success";
}

function normalizeRuns(raw: unknown): AnalyticsRunLog[] {
  if (!Array.isArray(raw)) return [];
  const rows: AnalyticsRunLog[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? row.sessionId ?? "").trim();
    if (!id) continue;
    rows.push({
      id,
      objective: String(
        row.objective ?? row.objectiveName ?? row.name ?? "Untitled swarm"
      ),
      persona: String(row.persona ?? row.chosenPersona ?? row.personaId ?? "—"),
      status: normalizeStatus(row.status ?? row.runStatus),
      durationSeconds: asNumber(
        row.durationSeconds ?? row.duration ?? row.runTimeSeconds
      ),
      creditsSpent: asNumber(
        row.creditsSpent ?? row.credits ?? row.tokensSpent
      ),
    });
  }
  return rows;
}

export function normalizeAnalyticsPayload(
  payload: unknown
): OrgAnalyticsPayload {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const metrics =
    root.metrics && typeof root.metrics === "object"
      ? (root.metrics as Record<string, unknown>)
      : root;

  return {
    totalSwarmsRun: asNumber(
      metrics.totalSwarmsRun ?? metrics.totalSwarms ?? metrics.swarmCount
    ),
    creditsConsumed: asNumber(
      metrics.creditsConsumed ??
        metrics.tokensConsumed ??
        metrics.creditsUsed ??
        metrics.tokensUsed
    ),
    creditsQuota: Math.max(
      1,
      asNumber(
        metrics.creditsQuota ??
          metrics.quotaLimit ??
          metrics.tokenQuota ??
          metrics.workspaceQuota,
        1000
      )
    ),
    tokensConsumed: asNumber(
      metrics.tokensConsumed ?? metrics.creditsConsumed,
      0
    ),
    averageRunTimeSeconds: asNumber(
      metrics.averageRunTimeSeconds ??
        metrics.avgRunTimeSeconds ??
        metrics.averageDurationSeconds
    ),
    hitlRatePercent: asNumber(
      metrics.hitlRatePercent ?? metrics.interventionRate ?? metrics.hitlRate
    ),
    runs: normalizeRuns(root.runs ?? root.executionLogs ?? root.history),
  };
}

function statusClass(status: AnalyticsRunStatus): string {
  if (status === "Success") return "text-emerald-300";
  if (status === "Failed") return "text-rose-300";
  return "text-amber-200";
}

function MetricSkeleton() {
  return (
    <div className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
  );
}

export default function TelemetryDashboard() {
  const [data, setData] = useState<OrgAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("durationSeconds");
  const [sortAsc, setSortAsc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/orgs/analytics", {
        headers: {
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload &&
          "error" in payload &&
          typeof (payload as { error?: string }).error === "string"
            ? (payload as { error: string }).error
            : `Unable to load analytics (HTTP ${response.status}).`;
        setError(message);
        setData(null);
        return;
      }
      setData(normalizeAnalyticsPayload(payload));
    } catch {
      setError("Network error loading telemetry.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onOrgChanged = () => {
      void load();
    };
    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    return () =>
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
  }, [load]);

  const sortedRuns = useMemo(() => {
    const rows = [...(data?.runs ?? [])];
    rows.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if (typeof left === "number" && typeof right === "number") {
        return sortAsc ? left - right : right - left;
      }
      const cmp = String(left).localeCompare(String(right));
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [data?.runs, sortAsc, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((value) => !value);
      return;
    }
    setSortKey(key);
    setSortAsc(key === "objective" || key === "persona" || key === "status");
  };

  const quotaUsed = data
    ? Math.min(100, (data.creditsConsumed / data.creditsQuota) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-3 py-1 text-[11px] font-medium text-cyan-accent">
            <Radio className="h-3.5 w-3.5" aria-hidden />
            Swarm Telemetry
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
            Analytics &{" "}
            <span className="text-gradient">Performance</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-muted">
            Organization-wide swarm metrics, quota burn, and execution history
            for the active workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-3.5 py-2 text-xs font-semibold text-cyan-accent transition hover:bg-cyan-accent/20 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <section
        aria-label="Telemetry metric cards"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {loading && !data ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <article className="rounded-2xl border border-cyan-accent/25 bg-gradient-to-b from-cyan-accent/[0.08] to-white/[0.02] p-5 shadow-[0_0_28px_rgba(0,242,254,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
                  Total Swarms Run
                </p>
                <Activity className="h-4 w-4 text-cyan-accent" aria-hidden />
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-white">
                {(data?.totalSwarmsRun ?? 0).toLocaleString()}
              </p>
            </article>

            <article className="rounded-2xl border border-cyan-accent/25 bg-gradient-to-b from-cyan-accent/[0.08] to-white/[0.02] p-5 shadow-[0_0_28px_rgba(0,242,254,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
                  Credits & Tokens Consumed
                </p>
                <Coins className="h-4 w-4 text-cyan-accent" aria-hidden />
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-white">
                {(data?.creditsConsumed ?? 0).toLocaleString()}
              </p>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[10px] text-slate-dim">
                  <span>Quota burn</span>
                  <span className="font-mono text-cyan-accent">
                    {Math.round(quotaUsed)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-accent to-emerald-400 transition-all duration-500"
                    style={{ width: `${quotaUsed}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[10px] text-slate-dim">
                  of {(data?.creditsQuota ?? 0).toLocaleString()} workspace
                  quota
                </p>
              </div>
            </article>

            <article className="rounded-2xl border border-cyan-accent/25 bg-gradient-to-b from-cyan-accent/[0.08] to-white/[0.02] p-5 shadow-[0_0_28px_rgba(0,242,254,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
                  Average Swarm Run Time
                </p>
                <Clock className="h-4 w-4 text-cyan-accent" aria-hidden />
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-white">
                {(data?.averageRunTimeSeconds ?? 0).toFixed(1)}
                <span className="ml-1 text-base font-medium text-slate-dim">
                  s
                </span>
              </p>
            </article>

            <article className="rounded-2xl border border-cyan-accent/25 bg-gradient-to-b from-cyan-accent/[0.08] to-white/[0.02] p-5 shadow-[0_0_28px_rgba(0,242,254,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
                  Intervention / HITL Rate
                </p>
                <Hand className="h-4 w-4 text-cyan-accent" aria-hidden />
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-white">
                {(data?.hitlRatePercent ?? 0).toFixed(1)}
                <span className="ml-1 text-base font-medium text-slate-dim">
                  %
                </span>
              </p>
            </article>
          </>
        )}
      </section>

      <section
        aria-labelledby="execution-logs-heading"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            id="execution-logs-heading"
            className="font-display text-sm font-semibold text-white"
          >
            Execution Logs
          </h2>
          <p className="text-[11px] text-slate-dim">
            {sortedRuns.length} run{sortedRuns.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-black/40 text-[10px] uppercase tracking-wider text-slate-dim">
              <tr>
                {(
                  [
                    ["objective", "Objective Name"],
                    ["persona", "Chosen Persona"],
                    ["status", "Run Status"],
                    ["durationSeconds", "Duration"],
                    ["creditsSpent", "Credits Spent"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="inline-flex items-center gap-1 hover:text-cyan-accent"
                    >
                      {label}
                      {sortKey === key ? (
                        sortAsc ? (
                          <ArrowUp className="h-3 w-3" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden />
                        )
                      ) : null}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2.5 font-medium">Session</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-slate-dim"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                      Loading execution history…
                    </span>
                  </td>
                </tr>
              ) : sortedRuns.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-slate-dim"
                  >
                    No swarm runs recorded for this workspace yet.
                  </td>
                </tr>
              ) : (
                sortedRuns.map((run, index) => (
                  <tr
                    key={run.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                    style={{
                      animation: `fadeInUp 0.35s ease-out ${Math.min(index, 12) * 0.04}s both`,
                    }}
                  >
                    <td className="max-w-[18rem] px-3 py-2.5 text-slate-100">
                      <span className="line-clamp-2">{run.objective}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-cyan-accent/90">
                      {run.persona}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 font-semibold ${statusClass(run.status)}`}
                    >
                      {run.status}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-muted">
                      {run.durationSeconds.toFixed(1)}s
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-muted">
                      {run.creditsSpent.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Link
                        href={`/dashboard?session=${encodeURIComponent(run.id)}`}
                        className="text-cyan-accent hover:underline"
                      >
                        View Session
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
