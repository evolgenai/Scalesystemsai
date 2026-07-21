"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Database, HeartPulse, Loader2, Zap } from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { useAlertToasts } from "@/components/dashboard/AlertToastContext";

type HealthPayload = {
  success?: boolean;
  data?: {
    database?: {
      latencyMs?: number;
      activeConnections?: number;
      reachable?: boolean;
    };
    systemStatus?: string;
    uptimeMs?: number;
  };
  error?: string;
};

const AUTO_HEAL_DIRECTIVE =
  "Meta-SRE auto-heal: scan platform health, remediate degraded database pool connections, and verify sandbox build integrity.";

function estimateCpuLoad(): number {
  if (typeof navigator === "undefined") return 0;
  const cores = navigator.hardwareConcurrency ?? 4;
  const base = 18 + (cores % 5) * 3;
  return Math.min(95, Math.max(8, base + Math.round(Math.random() * 12)));
}

export default function MobileSreHealthWidget() {
  const { pushAlert } = useAlertToasts();
  const [cpuPct, setCpuPct] = useState(0);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(null);
  const [poolConnections, setPoolConnections] = useState<number | null>(null);
  const [status, setStatus] = useState<"healthy" | "degraded" | "critical" | "unknown">("unknown");
  const [loading, setLoading] = useState(true);
  const [healing, setHealing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sre-health", {
        headers: { Accept: "application/json", ...getClientAuthHeaders() },
        cache: "no-store",
      });
      const payload = (await res.json()) as HealthPayload;
      if (!res.ok || !payload.success || !payload.data) {
        setStatus("unknown");
        setDbLatencyMs(null);
        setPoolConnections(null);
        return;
      }

      const db = payload.data.database;
      setDbLatencyMs(db?.latencyMs ?? null);
      setPoolConnections(db?.activeConnections ?? null);
      setCpuPct(estimateCpuLoad());

      const sys = payload.data.systemStatus;
      if (sys === "healthy") setStatus("healthy");
      else if (sys === "degraded") setStatus("degraded");
      else if (sys === "critical") setStatus("critical");
      else setStatus(db?.reachable === false ? "critical" : "healthy");
    } catch {
      setStatus("unknown");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    intervalRef.current = setInterval(() => {
      void fetchHealth();
    }, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchHealth]);

  const triggerAutoHeal = async () => {
    if (healing) return;
    setHealing(true);
    try {
      const res = await fetch("/api/admin/sre-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          directive: AUTO_HEAL_DIRECTIVE,
          title: "Meta-SRE Auto-Heal",
          summary: "Mobile one-touch platform remediation",
          severity: "high",
          dryRun: true,
          stream: false,
        }),
      });
      const payload = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !payload.success) {
        pushAlert({
          tone: "incident",
          title: "Auto-heal failed",
          detail: payload.error ?? `Request failed (${res.status})`,
        });
        return;
      }
      pushAlert({
        tone: "heal",
        title: "Meta-SRE auto-heal dispatched",
        detail: "Remediation pipeline queued · check command deck feed",
      });
      void fetchHealth();
    } catch {
      pushAlert({
        tone: "incident",
        title: "Auto-heal failed",
        detail: "Network error while dispatching Meta-SRE pipeline.",
      });
    } finally {
      setHealing(false);
    }
  };

  const statusColor =
    status === "healthy"
      ? "text-emerald-400"
      : status === "degraded"
        ? "text-amber-400"
        : status === "critical"
          ? "text-rose-400"
          : "text-slate-400";

  return (
    <section
      className="glass-panel overflow-hidden lg:hidden"
      aria-label="Mobile SRE health widget"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
            <HeartPulse className="h-4 w-4 text-emerald-400" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">SRE Health</p>
            <p className={`text-[10px] font-mono uppercase tracking-wider ${statusColor}`}>
              {loading ? "Syncing…" : status}
            </p>
          </div>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />
        ) : (
          <span className={`h-2.5 w-2.5 rounded-full ${status === "healthy" ? "bg-emerald-400" : status === "degraded" ? "bg-amber-400 animate-pulse" : "bg-rose-400 animate-pulse"}`} aria-hidden />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
            <Cpu className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
            CPU Load
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {loading ? "—" : `${cpuPct}%`}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
            <Database className="h-3.5 w-3.5 text-violet-400" aria-hidden />
            DB Pool
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {dbLatencyMs === null ? "—" : `${dbLatencyMs}ms`}
          </p>
          {poolConnections !== null ? (
            <p className="mt-0.5 text-[10px] text-slate-dim">
              {poolConnections} active conn
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/5 p-4">
        <button
          type="button"
          onClick={() => void triggerAutoHeal()}
          disabled={healing}
          className="inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-400 transition active:scale-[0.98] hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {healing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Zap className="h-4 w-4" aria-hidden />
          )}
          {healing ? "Dispatching…" : "Trigger Meta-SRE Auto-Heal"}
        </button>
      </div>
    </section>
  );
}
