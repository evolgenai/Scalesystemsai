"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Database,
  Globe,
  RefreshCw,
  Server,
  Shield,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type Health = "healthy" | "degraded" | "incident" | "unknown";

type SparkPoint = number;

type RouteMetric = {
  id: string;
  route: string;
  category: "api" | "db" | "scraper" | "cdn";
  latencyMs: number;
  p99Ms: number;
  errorRate: number;
  rps: number;
  health: Health;
  spark: SparkPoint[];
};

type Container = {
  id: string;
  name: string;
  image: string;
  status: "running" | "restarting" | "stopped" | "degraded";
  uptime: string;
  cpu: number;
  mem: number;
};

function randBetween(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function generateSpark(base: number, variance: number, len = 20): SparkPoint[] {
  return Array.from({ length: len }, () =>
    Math.max(1, base + (Math.random() - 0.5) * variance * 2)
  );
}

const INITIAL_ROUTES: RouteMetric[] = [
  {
    id: "api-agent",
    route: "/api/agent",
    category: "api",
    latencyMs: 142,
    p99Ms: 380,
    errorRate: 0.4,
    rps: 28,
    health: "healthy",
    spark: generateSpark(142, 30),
  },
  {
    id: "api-contact",
    route: "/api/contact",
    category: "api",
    latencyMs: 88,
    p99Ms: 210,
    errorRate: 0.1,
    rps: 4,
    health: "healthy",
    spark: generateSpark(88, 20),
  },
  {
    id: "db-prisma",
    route: "prisma.query",
    category: "db",
    latencyMs: 34,
    p99Ms: 98,
    errorRate: 0.0,
    rps: 120,
    health: "healthy",
    spark: generateSpark(34, 10),
  },
  {
    id: "db-pooler",
    route: "connection.pool",
    category: "db",
    latencyMs: 8,
    p99Ms: 22,
    errorRate: 0.0,
    rps: 340,
    health: "healthy",
    spark: generateSpark(8, 4),
  },
  {
    id: "scraper-extract",
    route: "/api/scraper/extract",
    category: "scraper",
    latencyMs: 2840,
    p99Ms: 8200,
    errorRate: 3.2,
    rps: 0.8,
    health: "degraded",
    spark: generateSpark(2840, 400),
  },
  {
    id: "cdn-assets",
    route: "cdn.assets",
    category: "cdn",
    latencyMs: 22,
    p99Ms: 55,
    errorRate: 0.0,
    rps: 820,
    health: "healthy",
    spark: generateSpark(22, 8),
  },
];

const INITIAL_CONTAINERS: Container[] = [
  { id: "c-next", name: "next-app", image: "node:20-alpine", status: "running", uptime: "7d 14h", cpu: 12, mem: 38 },
  { id: "c-pg", name: "postgres-16", image: "postgres:16", status: "running", uptime: "7d 14h", cpu: 4, mem: 52 },
  { id: "c-pw", name: "playwright-pool", image: "playwright:1.44", status: "degraded", uptime: "2h 11m", cpu: 78, mem: 84 },
  { id: "c-redis", name: "redis-cache", image: "redis:7-alpine", status: "running", uptime: "7d 14h", cpu: 2, mem: 15 },
  { id: "c-worker", name: "scraper-worker", image: "custom/worker:latest", status: "restarting", uptime: "0h 3m", cpu: 0, mem: 8 },
];

function healthBg(h: Health) {
  if (h === "healthy") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  if (h === "degraded") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  if (h === "incident") return "bg-rose-500/10 border-rose-500/20 text-rose-400";
  return "bg-white/5 border-white/10 text-slate-400";
}

function containerStatusColor(s: Container["status"]) {
  if (s === "running") return "text-emerald-400 bg-emerald-500/10";
  if (s === "degraded") return "text-amber-400 bg-amber-500/10";
  if (s === "restarting") return "text-violet-400 bg-violet-500/10";
  return "text-rose-400 bg-rose-500/10";
}

function MiniSparkline({ points, color = "#34d399" }: { points: number[]; color?: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const W = 80;
  const H = 28;
  const step = W / (points.length - 1);

  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = H - ((p - min) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={W} height={H} aria-hidden viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function categoryColor(cat: RouteMetric["category"]) {
  if (cat === "api") return "#22d3ee";
  if (cat === "db") return "#a78bfa";
  if (cat === "scraper") return "#fb923c";
  return "#34d399";
}

function categoryLabel(cat: RouteMetric["category"]) {
  if (cat === "api") return "API";
  if (cat === "db") return "DB";
  if (cat === "scraper") return "Scraper";
  return "CDN";
}

type GaugeProps = { value: number; max?: number; color: string; label: string };

function MiniGauge({ value, max = 100, color, label }: GaugeProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-dim">{label}</span>
        <span className="font-mono" style={{ color }}>{value.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function HealthDot({ health, pulse }: { health: Health; pulse?: boolean }) {
  const c = health === "healthy" ? "bg-emerald-400" : health === "degraded" ? "bg-amber-400" : health === "incident" ? "bg-rose-400" : "bg-slate-500";
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${c} ${pulse ? "animate-pulse" : ""}`} aria-hidden />
  );
}

export default function SreHealthMonitor() {
  const [routes, setRoutes] = useState<RouteMetric[]>(INITIAL_ROUTES);
  const [containers, setContainers] = useState<Container[]>(INITIAL_CONTAINERS);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const jitter = useCallback(() => {
    setRoutes((prev) =>
      prev.map((r) => ({
        ...r,
        latencyMs: Math.max(1, r.latencyMs + randBetween(-15, 15)),
        p99Ms: Math.max(1, r.p99Ms + randBetween(-30, 30)),
        errorRate: Math.max(0, Math.min(15, r.errorRate + (Math.random() - 0.5) * 0.3)),
        rps: Math.max(0, r.rps + (Math.random() - 0.5) * 2),
        spark: [...r.spark.slice(1), Math.max(1, r.latencyMs + randBetween(-15, 15))],
      }))
    );
    setContainers((prev) =>
      prev.map((c) => ({
        ...c,
        cpu: Math.max(0, Math.min(100, c.cpu + randBetween(-4, 4))),
        mem: Math.max(0, Math.min(100, c.mem + randBetween(-2, 2))),
      }))
    );
    setLastRefresh(new Date());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 550));
    jitter();
    setRefreshing(false);
  }, [jitter]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(jitter, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, jitter]);

  const overall: Health =
    routes.some((r) => r.health === "incident") || containers.some((c) => c.status === "stopped")
      ? "incident"
      : routes.some((r) => r.health === "degraded") || containers.some((c) => c.status === "degraded" || c.status === "restarting")
        ? "degraded"
        : "healthy";

  const totalRps = routes.reduce((s, r) => s + r.rps, 0);
  const avgLatency = Math.round(routes.reduce((s, r) => s + r.latencyMs, 0) / routes.length);
  const avgErrorRate = (routes.reduce((s, r) => s + r.errorRate, 0) / routes.length).toFixed(2);

  const summaryStats = [
    { label: "Overall Health", value: overall === "healthy" ? "Operational" : overall === "degraded" ? "Degraded" : "Incident", icon: Shield, color: overall === "healthy" ? "#34d399" : overall === "degraded" ? "#fbbf24" : "#f87171" },
    { label: "Total RPS", value: totalRps.toFixed(1), icon: Activity, color: "#22d3ee" },
    { label: "Avg Latency", value: `${avgLatency}ms`, icon: Clock, color: "#a78bfa" },
    { label: "Avg Error Rate", value: `${avgErrorRate}%`, icon: AlertTriangle, color: Number(avgErrorRate) > 1 ? "#fbbf24" : "#34d399" },
  ];

  return (
    <div className="space-y-6" style={{ backgroundColor: "#09090B" }}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            Super-Admin · SRE Telemetry
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-white sm:text-2xl">
            System Health Monitor
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Live latency sparklines, error rates, and container statuses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className={`flex h-5 w-9 rounded-full border transition ${autoRefresh ? "border-emerald-500/40 bg-emerald-500/20" : "border-white/10 bg-white/[0.03]"}`}>
              <span className={`m-0.5 h-4 w-4 rounded-full transition ${autoRefresh ? "translate-x-4 bg-emerald-400" : "bg-slate-600"}`} />
            </span>
            <span className="text-xs text-slate-dim">Auto</span>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="sr-only" />
          </label>

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-muted transition hover:border-white/10 hover:text-white active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>

          <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-dim">
            <HealthDot health={overall} pulse={overall !== "healthy"} />
            {overall === "healthy" ? "All Systems Operational" : overall === "degraded" ? "Partial Degradation" : "Active Incident"}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">{stat.label}</p>
                <Hover3DIcon intensity={10}>
                  <Icon className="h-3.5 w-3.5" style={{ color: stat.color }} aria-hidden />
                </Hover3DIcon>
              </div>
              <p className="font-display text-xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl overflow-hidden" aria-label="Route latency">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Hover3DIcon intensity={10}>
                <Activity className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
              </Hover3DIcon>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                Route Latency Sparklines
              </p>
            </div>
            <p className="text-[10px] text-slate-dim">
              Updated <span className="font-mono text-white">{lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </p>
          </div>

          <div className="divide-y divide-white/[0.04] overflow-x-auto">
            {routes.map((route) => (
              <div key={route.id} className="min-w-[280px]">
                <button
                  type="button"
                  onClick={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left transition hover:bg-white/[0.02] sm:gap-3 sm:px-4"
                  aria-expanded={expandedRoute === route.id}
                >
                  <HealthDot health={route.health} pulse={route.health !== "healthy"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-white">{route.route}</p>
                    <p className="text-[10px] text-slate-dim">
                      <span style={{ color: categoryColor(route.category) }}>{categoryLabel(route.category)}</span>
                      {" · "}{route.rps.toFixed(1)} rps
                    </p>
                  </div>
                  <MiniSparkline points={route.spark} color={categoryColor(route.category)} />
                  <div className="shrink-0 text-right space-y-0.5">
                    <p className="font-mono text-sm text-white">{route.latencyMs}ms</p>
                    <p className={`text-[10px] ${route.errorRate > 1 ? "text-amber-400" : "text-slate-dim"}`}>
                      {route.errorRate.toFixed(1)}% err
                    </p>
                  </div>
                  <span className="ml-1 hidden text-slate-600 sm:inline">
                    {expandedRoute === route.id ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                </button>

                <AnimatePresence>
                  {expandedRoute === route.id ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] px-4 py-3 border-t border-white/[0.04]">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-slate-dim">P50 Latency</p>
                          <p className="font-mono text-sm text-white">{route.latencyMs}ms</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-slate-dim">P99 Latency</p>
                          <p className="font-mono text-sm text-white">{route.p99Ms}ms</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-slate-dim">Error Rate</p>
                          <p className={`font-mono text-sm ${route.errorRate > 1 ? "text-amber-400" : "text-emerald-400"}`}>{route.errorRate.toFixed(2)}%</p>
                        </div>
                        <div className="col-span-3">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${healthBg(route.health)}`}>
                            {route.health === "healthy" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : route.health === "degraded" ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
                            {route.health}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl overflow-hidden" aria-label="Container statuses">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <Hover3DIcon intensity={10}>
                <Server className="h-3.5 w-3.5 text-violet-400" aria-hidden />
              </Hover3DIcon>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                Active Containers
              </p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {containers.map((c) => (
                <motion.div
                  key={c.id}
                  layout
                  className="px-4 py-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <HealthDot
                        health={c.status === "running" ? "healthy" : c.status === "degraded" ? "degraded" : c.status === "restarting" ? "degraded" : "incident"}
                        pulse={c.status !== "running"}
                      />
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-white truncate">{c.name}</p>
                        <p className="text-[9px] text-slate-dim truncate">{c.image}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${containerStatusColor(c.status)}`}>
                        {c.status}
                      </span>
                      <span className="text-[9px] text-slate-dim">{c.uptime}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniGauge value={c.cpu} label="CPU" color={c.cpu > 70 ? "#f87171" : c.cpu > 50 ? "#fbbf24" : "#34d399"} />
                    <MiniGauge value={c.mem} label="MEM" color={c.mem > 80 ? "#f87171" : c.mem > 60 ? "#fbbf24" : "#22d3ee"} />
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl p-4 space-y-3" aria-label="Infrastructure summary">
            <div className="flex items-center gap-2">
              <Hover3DIcon intensity={10}>
                <Globe className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              </Hover3DIcon>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                Infrastructure
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { icon: Database, label: "Postgres", val: "Neon Serverless", ok: true },
                { icon: Zap, label: "Edge Fn", val: "Vercel Edge", ok: true },
                { icon: Wifi, label: "WebSocket", val: "SSE stream", ok: true },
                { icon: Cpu, label: "Playwright", val: "pw-pool v1.44", ok: false },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${row.ok ? "text-emerald-400" : "text-amber-400"}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-dim">{row.label}</p>
                      <p className="truncate text-[10px] font-medium text-white">{row.val}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
