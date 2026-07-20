"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Database,
  Gauge,
  Radio,
  Users,
  Wifi,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";
import RobotMeshIcon, {
  type RobotMeshStatus,
} from "@/components/ui/RobotMeshIcon";

type StreamEvent = {
  id: string;
  user: string;
  action: string;
  edge: string;
  latencyMs: number;
  cache: "HIT" | "MISS";
  at: number;
};

type LatencyPoint = { t: number; ms: number };
type CachePoint = { t: number; hitPct: number };

const EDGES = ["cpt-1a", "jnb-2b", "ams-3c", "iad-4d", "sin-5e"];
const ACTIONS = [
  "swarm.launch",
  "tool.invoke",
  "kv.scratch.read",
  "kv.scratch.write",
  "agent.heartbeat",
  "heal.probe",
  "mcp.list_tools",
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function Sparkline({
  points,
  color,
  height = 72,
  label,
}: {
  points: number[];
  color: string;
  height?: number;
  label: string;
}) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const w = 100;
  const h = 40;
  const d = points
    .map((v, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const area = `${d} L${w} ${h} L0 ${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={`fill-${label}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#fill-${label})`} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function RingMeter({
  value,
  label,
  color = "#34d399",
}: {
  value: number;
  label: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          <motion.circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-sm font-semibold text-white">
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-slate-dim">
        {label}
      </p>
    </div>
  );
}

export default function TeletrafficBoard() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [latencySeries, setLatencySeries] = useState<LatencyPoint[]>([]);
  const [cacheSeries, setCacheSeries] = useState<CachePoint[]>([]);
  const [activeUsers, setActiveUsers] = useState(128);
  const [robotStatus, setRobotStatus] = useState<RobotMeshStatus>("working");

  useEffect(() => {
    const seedLat: LatencyPoint[] = Array.from({ length: 28 }, (_, i) => ({
      t: i,
      ms: rand(18, 62),
    }));
    const seedCache: CachePoint[] = Array.from({ length: 28 }, (_, i) => ({
      t: i,
      hitPct: rand(72, 96),
    }));
    setLatencySeries(seedLat);
    setCacheSeries(seedCache);

    const tick = window.setInterval(() => {
      const cacheHit = Math.random() > 0.22;
      const latency = cacheHit ? rand(12, 38) : rand(40, 92);
      const ev: StreamEvent = {
        id: uid(),
        user: `u_${Math.floor(rand(1000, 9999))}`,
        action: ACTIONS[Math.floor(Math.random() * ACTIONS.length)]!,
        edge: EDGES[Math.floor(Math.random() * EDGES.length)]!,
        latencyMs: Math.round(latency),
        cache: cacheHit ? "HIT" : "MISS",
        at: Date.now(),
      };

      setEvents((prev) => [ev, ...prev].slice(0, 14));
      setLatencySeries((prev) => {
        const next = [...prev, { t: (prev.at(-1)?.t ?? 0) + 1, ms: latency }];
        return next.slice(-36);
      });
      setCacheSeries((prev) => {
        const window = [...prev.slice(-11).map((p) => p.hitPct), cacheHit ? 100 : 55];
        const hitPct = window.reduce((a, b) => a + b, 0) / window.length;
        const next = [...prev, { t: (prev.at(-1)?.t ?? 0) + 1, hitPct }];
        return next.slice(-36);
      });
      setActiveUsers((n) =>
        Math.max(64, Math.min(420, Math.round(n + rand(-8, 12))))
      );
      setRobotStatus(
        latency > 75 ? "error" : latency > 45 ? "working" : "idle"
      );
    }, 1100);

    return () => window.clearInterval(tick);
  }, []);

  const avgLatency = useMemo(() => {
    if (!latencySeries.length) return 0;
    const slice = latencySeries.slice(-12);
    return slice.reduce((s, p) => s + p.ms, 0) / slice.length;
  }, [latencySeries]);

  const cacheHit = useMemo(() => {
    if (!cacheSeries.length) return 0;
    return cacheSeries.at(-1)?.hitPct ?? 0;
  }, [cacheSeries]);

  const latencyReduction = useMemo(() => {
    if (latencySeries.length < 8) return 0;
    const early =
      latencySeries.slice(0, 8).reduce((s, p) => s + p.ms, 0) / 8;
    return Math.max(0, ((early - avgLatency) / early) * 100);
  }, [latencySeries, avgLatency]);

  return (
    <section
      aria-labelledby="teletraffic-heading"
      className="mb-8 space-y-4"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <RobotMeshIcon
            size={52}
            variant="supervisor"
            status={robotStatus}
            active={robotStatus === "working"}
            label="Edge teletraffic supervisor"
            className="rounded-lg border border-white/5 bg-[#121212]"
          />
          <div>
            <h2
              id="teletraffic-heading"
              className="font-display text-sm font-semibold text-white"
            >
              Teletraffic Playground
            </h2>
            <p className="text-[11px] text-slate-dim">
              Live edge stream · KV scratchpad cache · client-only simulation
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          streaming
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: Users,
            label: "Active users",
            value: activeUsers.toLocaleString(),
            hint: "concurrent sessions",
          },
          {
            icon: Gauge,
            label: "Edge latency",
            value: `${avgLatency.toFixed(0)}ms`,
            hint: `−${latencyReduction.toFixed(1)}% vs window start`,
          },
          {
            icon: Database,
            label: "KV cache hit",
            value: `${cacheHit.toFixed(1)}%`,
            hint: "scratchpad reads",
          },
          {
            icon: Wifi,
            label: "Edge PoPs",
            value: String(EDGES.length),
            hint: "router anycast set",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="overflow-hidden rounded-lg border border-white/5 bg-[#121212] p-3.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                  {card.label}
                </p>
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <Hover3DIcon intensity={12}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </Hover3DIcon>
                </div>
              </div>
              <p className="font-display text-xl font-bold text-white">
                {card.value}
              </p>
              <p className="mt-1 font-mono text-[10px] text-emerald-400/80">
                {card.hint}
              </p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <article className="overflow-hidden rounded-lg border border-white/5 bg-[#121212] p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              <h3 className="text-xs font-semibold text-white">
                Edge router latency
              </h3>
            </div>
            <span className="font-mono text-[10px] text-slate-dim">
              p50 rolling
            </span>
          </div>
          <Sparkline
            points={latencySeries.map((p) => p.ms)}
            color="#34d399"
            height={96}
            label="latency"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <RingMeter value={Math.min(100, latencyReduction * 2.2)} label="Latency ↓" />
            <RingMeter value={cacheHit} label="Cache HIT" />
            <RingMeter
              value={Math.min(100, (1 - avgLatency / 100) * 100)}
              label="SLA headroom"
              color="#6ee7b7"
            />
          </div>
        </article>

        <article className="overflow-hidden rounded-lg border border-white/5 bg-[#121212] p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              <h3 className="text-xs font-semibold text-white">
                KV scratchpad hit ratio
              </h3>
            </div>
          </div>
          <Sparkline
            points={cacheSeries.map((p) => p.hitPct)}
            color="#10b981"
            height={88}
            label="cache"
          />
          <ul className="mt-3 space-y-1.5" aria-label="PoP cache skew">
            {EDGES.map((edge, i) => {
              const pct = Math.max(
                55,
                Math.min(99, cacheHit + Math.sin(i * 1.7) * 8)
              );
              return (
                <li key={edge}>
                  <div className="mb-0.5 flex justify-between font-mono text-[10px]">
                    <span className="text-slate-muted">{edge}</span>
                    <span className="text-emerald-400">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      className="h-full rounded-full bg-emerald-400/80"
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.45 }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
      </div>

      <article className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
            <h3 className="text-xs font-semibold text-white">
              Active user stream
            </h3>
          </div>
          <span className="font-mono text-[10px] text-slate-dim">
            last {events.length} events
          </span>
        </div>
        <ul className="divide-y divide-white/5" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {events.map((ev) => (
              <motion.li
                key={ev.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[11px]"
              >
                <span className="font-mono text-emerald-400">{ev.user}</span>
                <span className="text-slate-muted">{ev.action}</span>
                <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-slate-dim">
                  {ev.edge}
                </span>
                <span
                  className={`ml-auto font-mono ${
                    ev.latencyMs > 60
                      ? "text-rose-300"
                      : ev.latencyMs > 40
                        ? "text-amber-300"
                        : "text-white"
                  }`}
                >
                  {ev.latencyMs}ms
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
                    ev.cache === "HIT"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {ev.cache}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {events.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-slate-dim">
              Awaiting edge traffic…
            </li>
          ) : null}
        </ul>
      </article>
    </section>
  );
}
