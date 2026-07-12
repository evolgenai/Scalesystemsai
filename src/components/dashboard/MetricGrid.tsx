"use client";

import { motion } from "framer-motion";
import {
  Bot,
  Coins,
  Gauge,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type AutomationClusterMetric = {
  active: number;
  limit: number;
};

type TokenMeterMetric = {
  used: number;
  limit: number;
  usedLabel: string;
  limitLabel: string;
};

type InfrastructureCostMetric = {
  amount: string;
  period: string;
  tier: string;
};

type EfficiencySavingsMetric = {
  amount: string;
  label: string;
};

export type MetricGridProps = {
  automationClusters?: AutomationClusterMetric;
  tokenMeter?: TokenMeterMetric;
  infrastructureCost?: InfrastructureCostMetric;
  efficiencySavings?: EfficiencySavingsMetric;
};

const MOCK_AUTOMATION_CLUSTERS: AutomationClusterMetric = {
  active: 12,
  limit: 50,
};

const MOCK_TOKEN_METER: TokenMeterMetric = {
  used: 2_400_000,
  limit: 10_000_000,
  usedLabel: "2.4M",
  limitLabel: "10.0M",
};

const MOCK_INFRASTRUCTURE_COST: InfrastructureCostMetric = {
  amount: "$149.00",
  period: "mo",
  tier: "Premium",
};

const MOCK_EFFICIENCY_SAVINGS: EfficiencySavingsMetric = {
  amount: "$41,851.00",
  label: "Saved",
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function MetricCardShell({
  children,
  glow,
  className = "",
}: {
  children: React.ReactNode;
  glow: string;
  className?: string;
}) {
  return (
    <motion.article
      variants={item}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition-colors hover:border-white/15 sm:p-6 ${className}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glow} opacity-0 transition-opacity group-hover:opacity-100`}
        aria-hidden
      />
      <div className="relative flex h-full flex-col">{children}</div>
    </motion.article>
  );
}

function CardHeader({
  label,
  icon: Icon,
  accent,
}: {
  label: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
        {label}
      </p>
      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
        <Icon className={`h-4 w-4 ${accent}`} aria-hidden />
      </div>
    </div>
  );
}

function ActiveAutomationClustersCard({
  data,
}: {
  data: AutomationClusterMetric;
}) {
  const utilization = Math.round((data.active / data.limit) * 100);

  return (
    <MetricCardShell glow="from-cyan-accent/10 to-transparent">
      <CardHeader
        label="Active Automation Clusters"
        icon={Bot}
        accent="text-cyan-accent"
      />
      <div className="mt-auto space-y-4">
        <div className="flex items-end gap-2">
          <span className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {data.active}
          </span>
          <span className="pb-1 text-lg font-medium text-slate-dim">/</span>
          <span className="pb-1 font-display text-xl font-semibold text-slate-muted">
            {data.limit}
          </span>
        </div>
        <p className="text-sm text-slate-muted">Agents Operating</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-dim">
            <span>Cluster utilization</span>
            <span className="font-mono text-cyan-accent">{utilization}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-accent/80 to-cyan-accent"
              style={{ width: `${utilization}%` }}
            />
          </div>
        </div>
      </div>
    </MetricCardShell>
  );
}

function TokenMeterCard({ data }: { data: TokenMeterMetric }) {
  const percent = Math.min(100, Math.round((data.used / data.limit) * 100));

  return (
    <MetricCardShell glow="from-purple-500/10 to-transparent">
      <CardHeader
        label="Current Month Token Meter"
        icon={Gauge}
        accent="text-purple-400"
      />
      <div className="mt-auto space-y-4">
        <p className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          <span className="text-purple-300">{data.usedLabel}</span>
          <span className="mx-2 text-lg font-medium text-slate-dim">/</span>
          <span className="text-slate-muted">{data.limitLabel}</span>
        </p>
        <p className="text-sm text-slate-muted">Tokens Used</p>
        <div className="space-y-2.5">
          <div className="relative h-3 overflow-hidden rounded-full border border-white/5 bg-black/40">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-500 via-purple-400 to-fuchsia-400 shadow-[0_0_16px_rgba(168,85,247,0.45)]"
              style={{ width: `${percent}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/20"
              style={{ width: `${percent}%` }}
              aria-hidden
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-dim">Billing cycle progress</span>
            <span className="font-mono text-purple-300">{percent}% consumed</span>
          </div>
        </div>
      </div>
    </MetricCardShell>
  );
}

function InfrastructureCostCard({
  data,
}: {
  data: InfrastructureCostMetric;
}) {
  return (
    <MetricCardShell glow="from-amber-500/10 to-transparent">
      <CardHeader
        label="Estimated Infrastructure Costs"
        icon={Coins}
        accent="text-amber-400"
      />
      <div className="mt-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {data.amount}
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.12)]">
            <Sparkles className="h-3 w-3" aria-hidden />
            {data.tier}
          </span>
        </div>
        <p className="text-sm text-slate-muted">
          Per month · Includes runtime, orchestration, and observability
        </p>
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/25 px-3 py-2.5 text-xs">
          <span className="text-slate-dim">Billing period</span>
          <span className="font-mono text-amber-300">/{data.period}</span>
        </div>
      </div>
    </MetricCardShell>
  );
}

function EfficiencySavingsCard({
  data,
}: {
  data: EfficiencySavingsMetric;
}) {
  return (
    <MetricCardShell
      glow="from-emerald-500/15 to-transparent"
      className="border-emerald-500/15"
    >
      <CardHeader
        label="Net Corporate Efficiency Savings"
        icon={Sparkles}
        accent="text-emerald-400"
      />
      <div className="mt-auto space-y-3">
        <p className="font-display text-3xl font-bold tracking-tight text-emerald-400 drop-shadow-[0_0_28px_rgba(52,211,153,0.5)] sm:text-4xl">
          {data.amount}
        </p>
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300/90">
          {data.label}
        </p>
        <p className="text-xs leading-relaxed text-slate-dim">
          Net offset from automated workflows vs. equivalent manual FTE hours
        </p>
      </div>
    </MetricCardShell>
  );
}

export default function MetricGrid({
  automationClusters = MOCK_AUTOMATION_CLUSTERS,
  tokenMeter = MOCK_TOKEN_METER,
  infrastructureCost = MOCK_INFRASTRUCTURE_COST,
  efficiencySavings = MOCK_EFFICIENCY_SAVINGS,
}: MetricGridProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <ActiveAutomationClustersCard data={automationClusters} />
      <TokenMeterCard data={tokenMeter} />
      <InfrastructureCostCard data={infrastructureCost} />
      <EfficiencySavingsCard data={efficiencySavings} />
    </motion.div>
  );
}
