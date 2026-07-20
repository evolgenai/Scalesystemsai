"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Coins,
  Fuel,
  type LucideIcon,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type GasLane = {
  id: string;
  label: string;
  tokens: number;
  color: string;
};

const GAS_LANES: GasLane[] = [
  { id: "supervisor", label: "Supervisor", tokens: 412_800, color: "bg-emerald-400" },
  { id: "writer", label: "Writer", tokens: 286_400, color: "bg-emerald-400/70" },
  { id: "validator", label: "Validator", tokens: 154_200, color: "bg-emerald-400/40" },
];

const GAS_TOTAL = GAS_LANES.reduce((sum, l) => sum + l.tokens, 0);

const ROYALTY_BARS = [
  { week: "W1", value: 42 },
  { week: "W2", value: 58 },
  { week: "W3", value: 51 },
  { week: "W4", value: 74 },
  { week: "W5", value: 68 },
  { week: "W6", value: 89 },
];

const NOTIFY_METERS = [
  { channel: "WhatsApp", cost: 18.4, share: 0.62 },
  { channel: "Telegram", cost: 11.2, share: 0.38 },
];

type MetricCardProps = {
  icon: LucideIcon;
  title: string;
  value: string;
  unit?: string;
  children: ReactNode;
};

function MetricCard({ icon: Icon, title, value, unit, children }: MetricCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-white/5 bg-[#121212] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            {title}
          </p>
          <p className="mt-1 font-display text-2xl font-bold tracking-tight text-white">
            {value}
            {unit ? (
              <span className="ml-1.5 font-mono text-xs font-medium text-emerald-400">
                {unit}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <Hover3DIcon intensity={12}>
            <Icon className="h-4 w-4" aria-hidden />
          </Hover3DIcon>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </article>
  );
}

export default function EconomyMetricsDashboard() {
  return (
    <section
      aria-labelledby="economy-heading"
      className="mb-8 space-y-3"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="economy-heading"
            className="font-display text-sm font-semibold text-white"
          >
            Economy &amp; Utility
          </h2>
          <p className="text-[11px] text-slate-dim">
            Tenant token economy · current billing cycle
          </p>
        </div>
        <span className="hidden font-mono text-[10px] text-emerald-400/80 sm:inline">
          live metering
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {/* Compute Gas */}
        <MetricCard
          icon={Fuel}
          title="Compute Gas Consumed"
          value={(GAS_TOTAL / 1000).toFixed(1)}
          unit="k tok"
        >
          <ul className="space-y-2" aria-label="Gas by agent role">
            {GAS_LANES.map((lane, i) => {
              const pct = Math.round((lane.tokens / GAS_TOTAL) * 100);
              return (
                <li key={lane.id}>
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-slate-muted">{lane.label}</span>
                    <span className="font-mono text-emerald-400">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      className={`h-full rounded-full ${lane.color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.1 + i * 0.08, duration: 0.55 }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </MetricCard>

        {/* Marketplace Royalties */}
        <MetricCard
          icon={Coins}
          title="Marketplace Royalties Accrued"
          value="$1,284"
          unit="USD"
        >
          <div
            className="flex h-16 items-end gap-1.5"
            role="img"
            aria-label="Weekly royalty bars"
          >
            {ROYALTY_BARS.map((bar, i) => (
              <div key={bar.week} className="flex flex-1 flex-col items-center gap-1">
                <motion.div
                  className="w-full rounded-sm bg-gradient-to-t from-emerald-500/80 to-emerald-300/90"
                  initial={{ height: 0 }}
                  animate={{ height: `${bar.value}%` }}
                  transition={{ delay: 0.12 + i * 0.05, duration: 0.45 }}
                  style={{ minHeight: 4 }}
                />
                <span className="font-mono text-[9px] text-slate-dim">
                  {bar.week}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-slate-dim">
            +12.4% vs prior cycle
          </p>
        </MetricCard>

        {/* Outbound Notification Costs */}
        <MetricCard
          icon={Bell}
          title="Outbound Notification Costs"
          value={`$${NOTIFY_METERS.reduce((s, m) => s + m.cost, 0).toFixed(1)}`}
          unit="fees"
        >
          <ul className="space-y-2.5" aria-label="Channel micro-metering">
            {NOTIFY_METERS.map((meter, i) => (
              <li key={meter.channel}>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-slate-muted">{meter.channel}</span>
                  <span className="font-mono text-white">
                    ${meter.cost.toFixed(1)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full bg-emerald-400/80"
                    initial={{ width: 0 }}
                    animate={{ width: `${meter.share * 100}%` }}
                    transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </MetricCard>
      </div>
    </section>
  );
}
