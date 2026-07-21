"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  Fuel,
  Globe2,
  HeartPulse,
  TrendingDown,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

const GAS_BALANCE_KEY = "scalesystems.workspace.gasBalance";
const DEFAULT_BALANCE = 42_500;

type GasCategoryId = "scrapers" | "aiNodes" | "webhooks" | "sreHealth";

type GasCategory = {
  id: GasCategoryId;
  label: string;
  gas: number;
  icon: LucideIcon;
  accent: string;
};

type TopAgent = {
  id: string;
  name: string;
  role: string;
  gas: number;
  executions: number;
  successRate: number;
};

type HeatCell = {
  day: number;
  hour: number;
  gas: number;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const GAS_BREAKDOWN: GasCategory[] = [
  {
    id: "scrapers",
    label: "Scrapers",
    gas: 128_400,
    icon: Globe2,
    accent: "text-blue-400",
  },
  {
    id: "aiNodes",
    label: "AI Nodes",
    gas: 246_800,
    icon: Bot,
    accent: "text-cyan-accent",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    gas: 38_200,
    icon: Webhook,
    accent: "text-amber-300",
  },
  {
    id: "sreHealth",
    label: "SRE Health Checks",
    gas: 19_650,
    icon: HeartPulse,
    accent: "text-rose-300",
  },
];

const TOP_AGENTS: TopAgent[] = [
  {
    id: "lead-sentinel",
    name: "Lead Sentinel Scout",
    role: "Outbound",
    gas: 86_420,
    executions: 1_842,
    successRate: 97.4,
  },
  {
    id: "db-janitor",
    name: "Database Janitor",
    role: "Ops",
    gas: 64_110,
    executions: 3_210,
    successRate: 99.1,
  },
  {
    id: "stripe-monitor",
    name: "Stripe Webhook Monitor",
    role: "Payments",
    gas: 52_880,
    executions: 8_640,
    successRate: 98.6,
  },
  {
    id: "crm-bridge",
    name: "CRM Sync Bridge",
    role: "Pipeline",
    gas: 41_250,
    executions: 2_104,
    successRate: 96.2,
  },
  {
    id: "modbus-relay",
    name: "Modbus PLC Relay",
    role: "IoT",
    gas: 33_900,
    executions: 912,
    successRate: 94.8,
  },
  {
    id: "trace-debugger",
    name: "Swarm Trace Debugger",
    role: "Telemetry",
    gas: 28_640,
    executions: 640,
    successRate: 91.3,
  },
];

/** Deterministic pseudo-burn matrix for demo heatmap (day × hour). */
function buildHeatmap(): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const businessBoost = hour >= 8 && hour <= 18 ? 1.55 : 0.55;
      const weekdayBoost = day < 5 ? 1.35 : 0.7;
      const wave =
        Math.sin((hour / 24) * Math.PI * 2 + day * 0.4) * 0.35 + 0.65;
      const seed = ((day * 37 + hour * 17) % 97) / 97;
      const gas = Math.round(
        (420 + seed * 2_800) * businessBoost * weekdayBoost * wave
      );
      cells.push({ day, hour, gas });
    }
  }
  return cells;
}

const HEATMAP = buildHeatmap();

function formatGas(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

function formatGasFull(n: number): string {
  return n.toLocaleString("en-US");
}

function readBalance(): number {
  if (typeof window === "undefined") return DEFAULT_BALANCE;
  try {
    const raw = window.localStorage.getItem(GAS_BALANCE_KEY);
    if (raw == null) return DEFAULT_BALANCE;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_BALANCE;
  } catch {
    return DEFAULT_BALANCE;
  }
}

function heatColor(intensity: number): string {
  const t = Math.min(1, Math.max(0, intensity));
  if (t < 0.2) return `rgba(0, 102, 255, ${0.08 + t * 0.2})`;
  if (t < 0.45) return `rgba(0, 102, 255, ${0.22 + t * 0.35})`;
  if (t < 0.7) return `rgba(59, 130, 246, ${0.45 + t * 0.25})`;
  return `rgba(96, 165, 250, ${0.65 + t * 0.3})`;
}

function intensityFor(gas: number, max: number): number {
  if (max <= 0) return 0;
  return Math.pow(gas / max, 0.72);
}

export default function UsageAnalytics() {
  const [balance, setBalance] = useState(DEFAULT_BALANCE);
  const [mode, setMode] = useState<"hourly" | "daily">("hourly");
  const [hover, setHover] = useState<HeatCell | null>(null);

  useEffect(() => {
    setBalance(readBalance());
    const onGas = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === "number" && Number.isFinite(detail.balance)) {
        setBalance(Math.max(0, Math.floor(detail.balance)));
        return;
      }
      setBalance(readBalance());
    };
    window.addEventListener("scalesystems:gas-balance", onGas);
    return () => window.removeEventListener("scalesystems:gas-balance", onGas);
  }, []);

  const totalBurn = useMemo(
    () => GAS_BREAKDOWN.reduce((sum, c) => sum + c.gas, 0),
    []
  );

  const maxHeat = useMemo(
    () => Math.max(...HEATMAP.map((c) => c.gas), 1),
    []
  );

  const dailyTotals = useMemo(() => {
    return DAYS.map((_, day) => {
      const gas = HEATMAP.filter((c) => c.day === day).reduce(
        (s, c) => s + c.gas,
        0
      );
      return { day, gas };
    });
  }, []);

  const maxDaily = useMemo(
    () => Math.max(...dailyTotals.map((d) => d.gas), 1),
    [dailyTotals]
  );

  /** 7-day average burn velocity (GAS / day). */
  const avgDailyBurn = useMemo(() => {
    const sum = dailyTotals.reduce((s, d) => s + d.gas, 0);
    return Math.round(sum / 7);
  }, [dailyTotals]);

  const daysRemaining =
    avgDailyBurn > 0 ? Math.floor(balance / avgDailyBurn) : Infinity;
  const forecastPct = Math.min(
    100,
    avgDailyBurn > 0 ? (balance / (avgDailyBurn * 30)) * 100 : 100
  );

  return (
    <div className="space-y-6" aria-label="Enterprise usage analytics">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-medium text-blue-400">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            Enterprise Usage Analytics
          </p>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Gas burn ·{" "}
            <span className="text-gradient">cost forecast</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-muted">
            Consumption breakdown, hourly intensity heatmap, and remaining Gas
            lifespan from 7-day average velocity.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            Workspace balance
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold text-blue-400">
            {formatGasFull(balance)}{" "}
            <span className="text-xs text-slate-dim">GAS</span>
          </p>
        </div>
      </header>

      {/* Gas consumption breakdown */}
      <section aria-labelledby="gas-breakdown-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="gas-breakdown-heading"
            className="font-display text-sm font-semibold text-white"
          >
            Total Gas Consumption Breakdown
          </h2>
          <span className="font-mono text-[11px] text-blue-400/80">
            {formatGas(totalBurn)} GAS · cycle
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GAS_BREAKDOWN.map((cat, i) => {
            const pct = Math.round((cat.gas / totalBurn) * 100);
            const Icon = cat.icon;
            return (
              <motion.article
                key={cat.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                className="glass-panel overflow-hidden p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                      {cat.label}
                    </p>
                    <p className="mt-1 font-display text-xl font-bold text-white">
                      {formatGas(cat.gas)}
                      <span className="ml-1.5 font-mono text-xs font-medium text-blue-400">
                        GAS
                      </span>
                    </p>
                  </div>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 ${cat.accent}`}
                  >
                    <Hover3DIcon intensity={12}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </Hover3DIcon>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.55 }}
                  />
                </div>
                <p className="mt-2 font-mono text-[10px] text-slate-dim">
                  {pct}% of workspace burn
                </p>
              </motion.article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Usage heatmap */}
        <section
          aria-labelledby="heatmap-heading"
          className="glass-panel overflow-hidden p-4 sm:p-5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="heatmap-heading"
                className="font-display text-sm font-semibold text-white"
              >
                Interactive Usage Heatmap
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-dim">
                Hourly &amp; daily Gas burn · dynamic intensity
              </p>
            </div>
            <div
              className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5"
              role="tablist"
              aria-label="Heatmap granularity"
            >
              {(["hourly", "daily"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize transition ${
                    mode === m
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-slate-muted hover:text-white"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {mode === "hourly" ? (
            <div className="overflow-x-auto">
              <div
                className="inline-grid min-w-[640px] gap-1"
                style={{
                  gridTemplateColumns: `2.5rem repeat(24, minmax(0, 1fr))`,
                }}
                role="img"
                aria-label="Hourly gas burn heatmap across seven days"
              >
                <div />
                {HOURS.map((h) => (
                  <div
                    key={`h-${h}`}
                    className="text-center font-mono text-[9px] text-slate-dim"
                  >
                    {h % 3 === 0 ? h : ""}
                  </div>
                ))}
                {DAYS.map((label, day) => (
                  <div key={label} className="contents">
                    <div className="flex items-center font-mono text-[10px] text-slate-muted">
                      {label}
                    </div>
                    {HOURS.map((hour) => {
                      const cell = HEATMAP.find(
                        (c) => c.day === day && c.hour === hour
                      )!;
                      const t = intensityFor(cell.gas, maxHeat);
                      const active =
                        hover?.day === day && hover?.hour === hour;
                      return (
                        <button
                          key={`${day}-${hour}`}
                          type="button"
                          title={`${label} ${hour}:00 · ${formatGasFull(cell.gas)} GAS`}
                          aria-label={`${label} ${hour}:00, ${formatGasFull(cell.gas)} gas`}
                          onMouseEnter={() => setHover(cell)}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover(cell)}
                          onBlur={() => setHover(null)}
                          className={`aspect-square rounded-sm border transition ${
                            active
                              ? "scale-110 border-blue-400/60 shadow-[0_0_12px_rgba(0, 102, 255,0.35)]"
                              : "border-transparent hover:border-white/20"
                          }`}
                          style={{ backgroundColor: heatColor(t) }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-2.5" aria-label="Daily gas burn totals">
              {dailyTotals.map((row) => {
                const pct = Math.round((row.gas / maxDaily) * 100);
                return (
                  <li key={row.day} className="flex items-center gap-3">
                    <span className="w-8 shrink-0 font-mono text-[11px] text-slate-muted">
                      {DAYS[row.day]}
                    </span>
                    <div className="h-7 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
                      <motion.div
                        className="flex h-full items-center rounded-md bg-gradient-to-r from-blue-700/80 to-blue-400/90 px-2"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, delay: row.day * 0.04 }}
                      >
                        <span className="truncate font-mono text-[10px] font-semibold text-white">
                          {formatGasFull(row.gas)}
                        </span>
                      </motion.div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-dim">Intensity</span>
              <div
                className="h-2 w-28 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(0, 102, 255,0.1), rgba(96, 165, 250,0.95))",
                }}
                aria-hidden
              />
              <span className="font-mono text-[10px] text-slate-dim">
                low → peak
              </span>
            </div>
            {hover ? (
              <p className="font-mono text-[11px] text-blue-400">
                {DAYS[hover.day]} {String(hover.hour).padStart(2, "0")}:00 ·{" "}
                {formatGasFull(hover.gas)} GAS
              </p>
            ) : (
              <p className="text-[11px] text-slate-dim">
                Hover a cell for burn detail
              </p>
            )}
          </div>
        </section>

        {/* Cost forecast */}
        <section
          aria-labelledby="forecast-heading"
          className="glass-panel flex flex-col overflow-hidden p-4 sm:p-5"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2
                id="forecast-heading"
                className="font-display text-sm font-semibold text-white"
              >
                Workspace Cost Forecast
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-dim">
                Remaining Gas lifespan · 7-day velocity
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400">
              <Hover3DIcon intensity={12}>
                <TrendingDown className="h-4 w-4" aria-hidden />
              </Hover3DIcon>
            </div>
          </div>

          <div className="relative mx-auto my-4 flex h-36 w-36 items-center justify-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="10"
              />
              <motion.circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#forecastGrad)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                animate={{
                  strokeDashoffset:
                    2 * Math.PI * 52 * (1 - Math.min(1, forecastPct / 100)),
                }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0052CC" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="relative text-center">
              <p className="font-display text-3xl font-bold text-white">
                {Number.isFinite(daysRemaining) ? daysRemaining : "∞"}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
                days left
              </p>
            </div>
          </div>

          <dl className="mt-auto space-y-2.5 border-t border-white/5 pt-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <dt className="text-slate-muted">7-day avg burn</dt>
              <dd className="font-mono text-blue-400">
                {formatGasFull(avgDailyBurn)} / day
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <dt className="text-slate-muted">Projected 30-day cost</dt>
              <dd className="font-mono text-white">
                {formatGasFull(avgDailyBurn * 30)} GAS
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <dt className="inline-flex items-center gap-1.5 text-slate-muted">
                <Fuel className="h-3 w-3 text-blue-400" aria-hidden />
                Runway vs balance
              </dt>
              <dd
                className={`font-mono ${
                  daysRemaining < 7
                    ? "text-rose-300"
                    : daysRemaining < 14
                      ? "text-amber-300"
                      : "text-blue-400"
                }`}
              >
                {daysRemaining < 7
                  ? "Critical"
                  : daysRemaining < 14
                    ? "Watch"
                    : "Healthy"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Top agents table */}
      <section
        aria-labelledby="top-agents-heading"
        className="glass-panel overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
          <div>
            <h2
              id="top-agents-heading"
              className="font-display text-sm font-semibold text-white"
            >
              Top Executed Agents
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-dim">
              Ranked by Gas consumption and execution frequency
            </p>
          </div>
          <span className="font-mono text-[10px] text-blue-400/80">
            {TOP_AGENTS.length} agents
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-dim">
                <th className="px-4 py-3 font-semibold sm:px-5">#</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Agent</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Role</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Gas</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Executions</th>
                <th className="px-4 py-3 font-semibold sm:px-5">Success</th>
              </tr>
            </thead>
            <tbody>
              {TOP_AGENTS.map((agent, i) => (
                <motion.tr
                  key={agent.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-dim sm:px-5">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3 font-medium text-white sm:px-5">
                    {agent.name}
                  </td>
                  <td className="px-4 py-3 text-slate-muted sm:px-5">
                    {agent.role}
                  </td>
                  <td className="px-4 py-3 font-mono text-blue-400 sm:px-5">
                    {formatGasFull(agent.gas)}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-muted sm:px-5">
                    {formatGasFull(agent.executions)}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={`font-mono text-xs ${
                        agent.successRate >= 97
                          ? "text-blue-400"
                          : agent.successRate >= 94
                            ? "text-amber-300"
                            : "text-rose-300"
                      }`}
                    >
                      {agent.successRate.toFixed(1)}%
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
