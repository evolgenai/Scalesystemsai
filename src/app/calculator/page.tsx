"use client";

import { useMemo, useState, type ElementType } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Calculator,
  Coins,
  Layers,
  PiggyBank,
  Sparkles,
  Zap,
} from "lucide-react";

const TOKENS_PER_TASK = 2_500;
const HUMAN_OVERHEAD_PER_AGENT = 3_500;

const TIER_LIMITS = {
  free: { name: "Free", maxAgents: 1, maxTokens: 50_000, monthlyCost: 0 },
  starter: {
    name: "Starter",
    maxAgents: 5,
    maxTokens: 500_000,
    monthlyCost: 49,
  },
  premium: {
    name: "Premium",
    maxAgents: Infinity,
    maxTokens: Infinity,
    monthlyCost: 149,
  },
} as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTasks(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  }
  return String(value);
}

function resolveRecommendedTier(agentCount: number, totalTokens: number) {
  if (
    agentCount <= TIER_LIMITS.free.maxAgents &&
    totalTokens <= TIER_LIMITS.free.maxTokens
  ) {
    return TIER_LIMITS.free;
  }

  if (
    agentCount <= TIER_LIMITS.starter.maxAgents &&
    totalTokens <= TIER_LIMITS.starter.maxTokens
  ) {
    return TIER_LIMITS.starter;
  }

  return TIER_LIMITS.premium;
}

type RangeSliderProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
};

function RangeSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  formatValue,
  onChange,
}: RangeSliderProps) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-white">
          {label}
        </label>
        <span className="font-mono text-lg font-semibold text-cyan-accent">
          {formatValue(value)}
          <span className="ml-1 text-xs font-normal text-slate-dim">{unit}</span>
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="roi-range h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
          style={{
            background: `linear-gradient(to right, rgba(0,242,254,0.55) 0%, rgba(0,242,254,0.55) ${percent}%, rgba(255,255,255,0.08) ${percent}%, rgba(255,255,255,0.08) 100%)`,
          }}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
        />
        <div className="mt-1.5 flex justify-between text-[10px] font-mono text-slate-dim">
          <span>{formatValue(min)}</span>
          <span>{formatValue(max)}</span>
        </div>
      </div>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  sublabel: string;
  icon: ElementType;
  accent: string;
  delay?: number;
};

function MetricCard({
  label,
  value,
  sublabel,
  icon: Icon,
  accent,
  delay = 0,
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
          {label}
        </p>
        <div
          className={`shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 ${accent}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>
      <motion.p
        key={value}
        initial={{ opacity: 0.6, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl"
      >
        {value}
      </motion.p>
      <p className="mt-1.5 text-xs text-slate-muted">{sublabel}</p>
    </motion.div>
  );
}

export default function CalculatorPage() {
  const [agentCount, setAgentCount] = useState(5);
  const [tasksPerAgent, setTasksPerAgent] = useState(10_000);

  const metrics = useMemo(() => {
    const totalMonthlyTasks = agentCount * tasksPerAgent;
    const totalTokens = totalMonthlyTasks * TOKENS_PER_TASK;
    const recommendedTier = resolveRecommendedTier(agentCount, totalTokens);
    const humanOverheadSaved = agentCount * HUMAN_OVERHEAD_PER_AGENT;
    const netMonthlySavings =
      humanOverheadSaved - recommendedTier.monthlyCost;

    return {
      totalMonthlyTasks,
      totalTokens,
      recommendedTier,
      infrastructureCost: recommendedTier.monthlyCost,
      humanOverheadSaved,
      netMonthlySavings,
    };
  }, [agentCount, tasksPerAgent]);

  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-1/4 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/5 blur-[150px]" />
        <div className="absolute left-1/4 bottom-0 h-[400px] w-[500px] rounded-full bg-blue-500/5 blur-[130px]" />
      </div>

      <section
        className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="calculator-heading"
      >
        <header className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
            <Calculator className="h-3.5 w-3.5" aria-hidden />
            ROI &amp; Token Usage Calculator
          </div>
          <h1
            id="calculator-heading"
            className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            Model Your{" "}
            <span className="text-gradient">Automation Economics</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            Adjust fleet size and task throughput to project token consumption,
            infrastructure spend against our plan tiers, and the human overhead
            your agents replace.
          </p>
        </header>

        <div className="mt-12 glass overflow-hidden rounded-3xl border border-white/10 shadow-glow-sm">
          <div className="flex flex-col lg:grid lg:grid-cols-5">
            <div className="space-y-8 border-b border-white/10 bg-black/20 p-6 sm:p-8 lg:col-span-2 lg:border-b-0 lg:border-r">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-dim">
                  Fleet Parameters
                </h2>
                <p className="mt-1 text-sm text-slate-muted">
                  Drag sliders to shape your deployment model
                </p>
              </div>

              <RangeSlider
                id="agent-count"
                label="Number of Active Automation Agents"
                value={agentCount}
                min={1}
                max={50}
                step={1}
                unit="agents"
                formatValue={(v) => String(v)}
                onChange={setAgentCount}
              />

              <RangeSlider
                id="tasks-per-agent"
                label="Estimated Monthly Tasks per Agent"
                value={tasksPerAgent}
                min={1_000}
                max={100_000}
                step={1_000}
                unit="tasks/mo"
                formatValue={formatTasks}
                onChange={setTasksPerAgent}
              />

              <div className="rounded-xl border border-cyan-accent/20 bg-cyan-accent/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-accent">
                  Modeling Assumptions
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-muted">
                  Token throughput is estimated at{" "}
                  <span className="font-mono text-white">2,500</span> tokens per
                  task. Human processing overhead is modeled at{" "}
                  <span className="font-mono text-white">$3,500</span> per agent
                  per month. Infrastructure cost maps to the lowest matching
                  Free, Starter, or Premium tier.
                </p>
              </div>
            </div>

            <div className="space-y-6 p-6 sm:p-8 lg:col-span-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-dim">
                  Live Projection Metrics
                </h2>
                <p className="mt-1 text-sm text-slate-muted">
                  Updates instantly as inputs change
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard
                  label="Total Estimated Token Consumption"
                  value={formatTokens(metrics.totalTokens)}
                  sublabel={`${formatTasks(metrics.totalMonthlyTasks)} tasks × 2,500 tokens`}
                  icon={Zap}
                  accent="text-cyan-accent"
                />
                <MetricCard
                  label="Monthly Infrastructure Cost"
                  value={
                    metrics.infrastructureCost === 0
                      ? "$0"
                      : formatCurrency(metrics.infrastructureCost)
                  }
                  sublabel={`Fits ${metrics.recommendedTier.name} tier · ${agentCount} agents`}
                  icon={Layers}
                  accent="text-purple-400"
                />
              </div>

              <motion.div
                layout
                className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/10 via-black/40 to-cyan-accent/10 p-6 text-center sm:p-8"
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.1),transparent_70%)]"
                  aria-hidden
                />
                <div className="relative space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    <PiggyBank className="h-3.5 w-3.5" aria-hidden />
                    Estimated Human Overhead Saved
                  </div>
                  <motion.p
                    key={metrics.humanOverheadSaved}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="font-display text-4xl font-bold tracking-tight text-emerald-300 drop-shadow-[0_0_24px_rgba(52,211,153,0.35)] sm:text-5xl"
                  >
                    {formatCurrency(metrics.humanOverheadSaved)}
                    <span className="text-lg font-medium text-emerald-400/70 sm:text-xl">
                      /mo
                    </span>
                  </motion.p>
                  <p className="text-sm text-slate-muted">
                    {agentCount} agents × $3,500 mock monthly human processing
                    cost
                  </p>
                  <div className="inline-flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-accent/30 bg-cyan-accent/10 px-3 py-1 text-xs font-semibold text-cyan-accent">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      Net savings: {formatCurrency(metrics.netMonthlySavings)}/mo
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-muted">
                      <Coins className="h-3 w-3 text-purple-400" aria-hidden />
                      After {metrics.recommendedTier.name} infrastructure
                    </span>
                  </div>
                </div>
              </motion.div>

              <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 pt-6">
                <div className="flex items-center gap-2 text-xs text-slate-dim">
                  <Bot className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
                  {agentCount} active agent{agentCount === 1 ? "" : "s"}
                </div>
                <span
                  className="hidden h-3 w-px bg-white/10 sm:block"
                  aria-hidden
                />
                <div className="flex items-center gap-2 text-xs text-slate-dim">
                  <Zap className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
                  {formatTokens(metrics.totalTokens)} tokens/mo projected
                </div>
              </div>

              <Link href="/contact?purpose=calculator" className="block">
                <motion.span
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-accent px-6 py-4 text-sm font-bold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow"
                >
                  Request Enterprise Optimization Review
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </motion.span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
