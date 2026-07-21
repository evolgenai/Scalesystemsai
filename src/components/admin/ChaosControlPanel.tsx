"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Database,
  Flame,
  Gauge,
  Loader2,
  Radio,
  Shield,
  Zap,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type CircuitStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "CIRCUIT_TRIPPED_AUTO_HEALING";

type ErrorRates = { "429": number; "500": number; "503": number };

type PoolSnap = {
  status: CircuitStatus;
  activeConnections: number;
  maxConnections: number;
  waitingClients: number;
  activeConcurrent: number;
  latencySpikeMs: number;
  errorRates: ErrorRates;
  autoHealEvents: number;
  lastHealAt: number | null;
  lastTripAt: number | null;
  generation: number;
  updatedAt: number;
};

type BurstSize = 10 | 100 | 1000;

type FeedLine = {
  id: string;
  at: number;
  text: string;
  tone: "info" | "warn" | "heal" | "error";
};

const IDLE_SNAP: PoolSnap = {
  status: "HEALTHY",
  activeConnections: 1,
  maxConnections: 5,
  waitingClients: 0,
  activeConcurrent: 0,
  latencySpikeMs: 42,
  errorRates: { "429": 0, "500": 0, "503": 0 },
  autoHealEvents: 0,
  lastHealAt: null,
  lastTripAt: null,
  generation: 1,
  updatedAt: Date.now(),
};

const BURSTS: { size: BurstSize; label: string; hazard: string }[] = [
  { size: 10, label: "×10", hazard: "Smoke" },
  { size: 100, label: "×100", hazard: "Load" },
  { size: 1000, label: "×1k", hazard: "Storm" },
];

function statusStyles(status: CircuitStatus) {
  switch (status) {
    case "HEALTHY":
      return "border-blue-500/40 bg-blue-500/15 text-blue-400 shadow-[0_0_18px_rgba(0, 102, 255,0.18)]";
    case "DEGRADED":
      return "border-amber-400/50 bg-amber-500/15 text-amber-300 shadow-[0_0_22px_rgba(251,191,36,0.28)]";
    case "CIRCUIT_TRIPPED_AUTO_HEALING":
      return "border-rose-400/50 bg-rose-500/15 text-rose-300 shadow-[0_0_24px_rgba(251,113,133,0.32)]";
  }
}

function GaugeBar({
  label,
  value,
  max,
  unit,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  tone: "sapphire" | "amber" | "rose" | "cyan";
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fill =
    tone === "sapphire"
      ? "bg-blue-400"
      : tone === "amber"
        ? "bg-amber-400"
        : tone === "rose"
          ? "bg-rose-400"
          : "bg-cyan-400";
  const glow =
    tone === "sapphire"
      ? "shadow-[0_0_12px_rgba(0, 102, 255,0.45)]"
      : tone === "amber"
        ? "shadow-[0_0_12px_rgba(251,191,36,0.45)]"
        : tone === "rose"
          ? "shadow-[0_0_12px_rgba(251,113,133,0.45)]"
          : "shadow-[0_0_12px_rgba(34,211,238,0.4)]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-dim">
          {label}
        </span>
        <span className="font-mono text-[11px] text-white">
          {typeof value === "number" && value % 1 !== 0
            ? value.toFixed(1)
            : Math.round(value).toLocaleString()}
          {unit ? (
            <span className="ml-0.5 text-slate-dim">{unit}</span>
          ) : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className={`h-full rounded-full ${fill} ${glow}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        />
      </div>
    </div>
  );
}

export default function ChaosControlPanel() {
  const [pool, setPool] = useState<PoolSnap>(IDLE_SNAP);
  const [busy, setBusy] = useState<"burst" | "exhaust" | null>(null);
  const [armedBurst, setArmedBurst] = useState<BurstSize | null>(null);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const seq = useRef(0);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef<CircuitStatus>(IDLE_SNAP.status);

  const pushFeed = useCallback((text: string, tone: FeedLine["tone"] = "info") => {
    seq.current += 1;
    setFeed((prev) =>
      [{ id: `c-${seq.current}`, at: Date.now(), text, tone }, ...prev].slice(0, 18)
    );
  }, []);

  const applySnap = useCallback((snap: PoolSnap) => {
    if (
      prevStatus.current === "CIRCUIT_TRIPPED_AUTO_HEALING" &&
      snap.status === "HEALTHY"
    ) {
      pushFeed("AUTO-HEAL COMPLETE · poolMonitor restored HEALTHY", "heal");
    }
    prevStatus.current = snap.status;
    setPool(snap);
  }, [pushFeed]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chaos/stress", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPollError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as { data?: PoolSnap };
      if (json.data) applySnap(json.data);
      setPollError(null);
    } catch {
      setPollError("Telemetry link offline");
    }
  }, [applySnap]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), 900);
    return () => window.clearInterval(id);
  }, [poll]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [feed]);

  const runBurst = async (concurrency: BurstSize) => {
    if (busy) return;
    setBusy("burst");
    setArmedBurst(concurrency);
    pushFeed(`ARM · webhook burst ×${concurrency.toLocaleString()}`, "warn");

    try {
      const res = await fetch("/api/admin/chaos/stress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "webhook_burst", concurrency }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          durationMs: number;
          tallies: { ok: number; "429": number; "500": number; "503": number };
          pool: PoolSnap;
        };
      };

      if (!res.ok || !json.success || !json.data) {
        pushFeed(json.error ?? `Burst failed (${res.status})`, "error");
        return;
      }

      applySnap(json.data.pool);
      const t = json.data.tallies;
      pushFeed(
        `BURST ACK · ${json.data.durationMs}ms · ok=${t.ok} 429=${t["429"]} 500=${t["500"]} 503=${t["503"]}`,
        t["503"] + t["500"] > t.ok * 0.2 ? "warn" : "info"
      );
    } catch {
      pushFeed("Burst transport failure", "error");
    } finally {
      setBusy(null);
      setArmedBurst(null);
    }
  };

  const runPoolExhaust = async () => {
    if (busy) return;
    setBusy("exhaust");
    pushFeed("ARM · DB pool timeout / exhaustion drill", "warn");

    try {
      const res = await fetch("/api/admin/chaos/stress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pool_exhaust" }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { message?: string; pool: PoolSnap };
      };

      if (!res.ok || !json.success || !json.data) {
        pushFeed(json.error ?? `Exhaust drill failed (${res.status})`, "error");
        return;
      }

      applySnap(json.data.pool);
      pushFeed(
        "CIRCUIT_TRIPPED_AUTO_HEALING · poolMonitor auto-heal armed",
        "warn"
      );
      pushFeed("Awaiting heal cycle (~2.4s)…", "info");
    } catch {
      pushFeed("Pool exhaust transport failure", "error");
    } finally {
      setBusy(null);
    }
  };

  const errSum =
    pool.errorRates["429"] + pool.errorRates["500"] + pool.errorRates["503"];

  return (
    <div className="space-y-6" style={{ backgroundColor: "#09090B" }}>
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400/80">
          chaos engineering · developer · ?view=chaos
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">
              Chaos Control Panel
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-muted">
              Concurrency load runner, DB pool exhaustion drills, and live stress
              telemetry against{" "}
              <span className="font-mono text-[11px] text-amber-300/90">
                poolMonitor.ts
              </span>
              .
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${statusStyles(pool.status)}`}
            role="status"
            aria-live="polite"
          >
            <Shield
              className={`h-3 w-3 ${
                pool.status === "CIRCUIT_TRIPPED_AUTO_HEALING"
                  ? "animate-pulse"
                  : ""
              }`}
              aria-hidden
            />
            {pool.status}
          </span>
        </div>
      </header>

      {pollError ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-400/30 border-l-2 border-l-amber-400 bg-amber-500/5 px-3.5 py-2.5 text-xs text-amber-200"
        >
          {pollError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Triggers */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Hover3DIcon intensity={12} glow={false}>
                <Flame className="h-4 w-4 text-amber-400" aria-hidden />
              </Hover3DIcon>
              <h3 className="text-sm font-semibold text-white">
                Load Test Triggers
              </h3>
            </div>
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-dim">
              gen {pool.generation}
            </span>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                <Zap className="h-3 w-3 text-amber-400" aria-hidden />
                Concurrency webhook burst
              </p>
              <div className="grid grid-cols-3 gap-2">
                {BURSTS.map((b) => {
                  const armed = armedBurst === b.size;
                  return (
                    <button
                      key={b.size}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void runBurst(b.size)}
                      className={`relative flex flex-col items-center gap-1 rounded-lg border px-2 py-3 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        armed
                          ? "border-amber-400/60 bg-amber-500/20 shadow-[0_0_20px_rgba(251,191,36,0.25)]"
                          : "border-white/5 bg-black/30 hover:border-amber-400/35 hover:bg-amber-500/5"
                      }`}
                    >
                      {busy === "burst" && armed ? (
                        <Loader2
                          className="h-4 w-4 animate-spin text-amber-300"
                          aria-hidden
                        />
                      ) : (
                        <span className="font-mono text-sm font-semibold text-white">
                          {b.label}
                        </span>
                      )}
                      <span className="text-[9px] uppercase tracking-wider text-slate-dim">
                        {b.hazard}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-dim">
                Fires parallel synthetic webhook ACKs — no live Discord egress.
              </p>
            </div>

            <div className="border-t border-white/5 pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                <Database className="h-3 w-3 text-rose-400" aria-hidden />
                Database pool timeout simulator
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runPoolExhaust()}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  busy === "exhaust"
                    ? "border-rose-400/50 bg-rose-500/20 text-rose-200"
                    : "border-rose-400/25 bg-rose-500/10 text-rose-300 hover:border-rose-400/45 hover:bg-rose-500/15"
                }`}
              >
                {busy === "exhaust" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                )}
                {busy === "exhaust"
                  ? "Exhausting pool…"
                  : "Trigger connection exhaustion"}
              </button>
              <p className="mt-2 text-[11px] text-slate-dim">
                Forces circuit trip → verifies poolMonitor auto-heal restores{" "}
                <span className="text-blue-400">HEALTHY</span>.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Telemetry */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Hover3DIcon intensity={12}>
                <Gauge className="h-4 w-4 text-blue-400" aria-hidden />
              </Hover3DIcon>
              <h3 className="text-sm font-semibold text-white">
                Real-time Stress Telemetry
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-blue-400/80">
              <Radio className="h-3 w-3 animate-pulse" aria-hidden />
              Live
            </span>
          </div>

          <div className="space-y-4 p-4">
            <GaugeBar
              label="Active concurrent"
              value={pool.activeConcurrent}
              max={1000}
              tone={pool.activeConcurrent > 200 ? "rose" : pool.activeConcurrent > 40 ? "amber" : "sapphire"}
            />
            <GaugeBar
              label="API error rate (429/500/503)"
              value={errSum}
              max={100}
              unit="%"
              tone={errSum > 40 ? "rose" : errSum > 12 ? "amber" : "sapphire"}
            />
            <div className="grid grid-cols-3 gap-2">
              {(["429", "500", "503"] as const).map((code) => (
                <div
                  key={code}
                  className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-center"
                >
                  <p className="font-mono text-[9px] text-slate-dim">{code}</p>
                  <p
                    className={`mt-0.5 font-mono text-sm font-semibold ${
                      pool.errorRates[code] > 15
                        ? "text-rose-300"
                        : pool.errorRates[code] > 5
                          ? "text-amber-300"
                          : "text-blue-400"
                    }`}
                  >
                    {pool.errorRates[code].toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
            <GaugeBar
              label="Latency spike"
              value={pool.latencySpikeMs}
              max={8000}
              unit="ms"
              tone={
                pool.latencySpikeMs > 2000
                  ? "rose"
                  : pool.latencySpikeMs > 400
                    ? "amber"
                    : "cyan"
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-dim">
                  Pool connections
                </p>
                <p className="mt-1 font-mono text-sm text-white">
                  {pool.activeConnections}
                  <span className="text-slate-dim">/{pool.maxConnections}</span>
                  {pool.waitingClients > 0 ? (
                    <span className="ml-1.5 text-[10px] text-amber-300">
                      +{pool.waitingClients} wait
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
                <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-dim">
                  <Activity className="h-3 w-3 text-blue-400" aria-hidden />
                  Auto-heal events
                </p>
                <p className="mt-1 font-mono text-sm text-blue-400">
                  {pool.autoHealEvents}
                  {pool.lastHealAt ? (
                    <span className="ml-1.5 text-[10px] text-slate-dim">
                      {new Date(pool.lastHealAt).toLocaleTimeString()}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Event feed */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl"
      >
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <Hover3DIcon intensity={10} glow={false}>
            <Zap className="h-4 w-4 text-amber-400" aria-hidden />
          </Hover3DIcon>
          <h3 className="text-sm font-semibold text-white">Drill Event Stream</h3>
        </div>
        <div className="max-h-48 overflow-y-auto font-mono text-[10px]">
          <ul className="space-y-0 p-2">
            <AnimatePresence initial={false}>
              {feed.length === 0 ? (
                <li className="px-2 py-8 text-center text-slate-dim">
                  Awaiting chaos drill…
                </li>
              ) : (
                feed.map((line) => (
                  <motion.li
                    key={line.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-baseline gap-2 border-b border-white/[0.03] px-2 py-1.5 ${
                      line.tone === "warn"
                        ? "text-amber-300"
                        : line.tone === "heal"
                          ? "text-blue-400"
                          : line.tone === "error"
                            ? "text-rose-300"
                            : "text-slate-muted"
                    }`}
                  >
                    <span className="shrink-0 text-slate-dim">
                      {new Date(line.at).toLocaleTimeString()}
                    </span>
                    <span className="min-w-0 break-words">{line.text}</span>
                  </motion.li>
                ))
              )}
            </AnimatePresence>
          </ul>
          <div ref={feedEndRef} />
        </div>
      </motion.section>
    </div>
  );
}
