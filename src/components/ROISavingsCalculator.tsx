"use client";

import { useMemo, useState, type ElementType } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calculator,
  Clock,
  DollarSign,
  PiggyBank,
  TrendingDown,
  Zap,
} from "lucide-react";

const WEEKS_PER_MONTH = 52 / 12;
const AUTONOMOUS_FEE_RATIO = 0.15;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
          {label}
        </p>
        <div className={`rounded-lg border border-white/10 bg-white/5 p-2 ${accent}`}>
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
      <div className="flex items-end justify-between gap-4">
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

export default function ROISavingsCalculator() {
  const [weeklyHours, setWeeklyHours] = useState(25);
  const [hourlyRate, setHourlyRate] = useState(45);

  const metrics = useMemo(() => {
    const monthlyOverhead = weeklyHours * hourlyRate * WEEKS_PER_MONTH;
    const autonomousFee = monthlyOverhead * AUTONOMOUS_FEE_RATIO;
    const monthlyNetSavings = monthlyOverhead - autonomousFee;
    const annualSavings = monthlyNetSavings * 12;

    return {
      monthlyOverhead,
      autonomousFee,
      annualSavings,
    };
  }, [weeklyHours, hourlyRate]);

  const contactHref = `/contact?weeklyHours=${weeklyHours}&hourlyRate=${hourlyRate}&monthlyOverhead=${Math.round(metrics.monthlyOverhead)}&annualSavings=${Math.round(metrics.annualSavings)}`;

  return (
    <section
      className="relative px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="roi-calculator-heading"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute left-1/4 top-1/2 h-[400px] w-[600px] -translate-y-1/2 rounded-full bg-cyan-accent/[0.04] blur-[120px]" />
        <div className="absolute right-1/4 top-1/3 h-[350px] w-[500px] rounded-full bg-purple-500/[0.05] blur-[100px]" />
      </div>

      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
            <Calculator className="h-3.5 w-3.5" aria-hidden />
            ROI Projection Engine
          </div>
          <h2
            id="roi-calculator-heading"
            className="font-display text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Calculate Your{" "}
            <span className="text-gradient">Automation Savings</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-muted">
            Drag the sliders to model how much administrative overhead your team
            is burning—and what you keep when ScaleSystems agents absorb the
            workload.
          </p>
        </div>

        <div className="glass overflow-hidden rounded-3xl border border-white/10 shadow-glow-sm">
          <div className="grid lg:grid-cols-5">
            <div className="space-y-8 border-b border-white/10 bg-black/20 p-6 sm:p-8 lg:col-span-2 lg:border-b-0 lg:border-r">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-dim">
                  Input Parameters
                </h3>
                <p className="mt-1 text-sm text-slate-muted">
                  Adjust your operational baseline
                </p>
              </div>

              <RangeSlider
                id="weekly-hours"
                label="Estimated Weekly Administrative Hours Wasted"
                value={weeklyHours}
                min={5}
                max={100}
                step={1}
                unit="hrs/wk"
                formatValue={(v) => String(v)}
                onChange={setWeeklyHours}
              />

              <RangeSlider
                id="hourly-rate"
                label="Average Operational Labor Rate"
                value={hourlyRate}
                min={15}
                max={150}
                step={1}
                unit="/hr"
                formatValue={(v) => `$${v}`}
                onChange={setHourlyRate}
              />

              <div className="rounded-xl border border-cyan-accent/20 bg-cyan-accent/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-accent">
                  Modeling Assumption
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-muted">
                  ScaleSystems autonomous resource fee is calculated at{" "}
                  <span className="font-mono text-white">15%</span> of your
                  current monthly administrative waste—leaving{" "}
                  <span className="font-mono text-white">85%</span> as net
                  recoverable value.
                </p>
              </div>
            </div>

            <div className="space-y-6 p-6 sm:p-8 lg:col-span-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-dim">
                  Live Financial Metrics
                </h3>
                <p className="mt-1 text-sm text-slate-muted">
                  Recalculates instantly as inputs change
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard
                  label="Current Monthly Overhead Wasted"
                  value={formatCurrency(metrics.monthlyOverhead)}
                  sublabel={`${weeklyHours} hrs/wk × $${hourlyRate}/hr × 4.33 wks`}
                  icon={TrendingDown}
                  accent="text-rose-400"
                  delay={0}
                />
                <MetricCard
                  label="ScaleSystems Autonomous Resource Fee"
                  value={formatCurrency(metrics.autonomousFee)}
                  sublabel="~15% of current monthly waste"
                  icon={Zap}
                  accent="text-purple-400"
                  delay={0.05}
                />
              </div>

              <motion.div
                layout
                className="relative overflow-hidden rounded-2xl border border-cyan-accent/30 bg-gradient-to-br from-cyan-accent/10 via-black/40 to-purple-500/10 p-6 text-center sm:p-8"
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,242,254,0.08),transparent_70%)]"
                  aria-hidden
                />
                <div className="relative">
                  <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-accent">
                    <PiggyBank className="h-3.5 w-3.5" aria-hidden />
                    Total Net Annual Savings Projected
                  </div>
                  <motion.p
                    key={metrics.annualSavings}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="font-display text-4xl font-bold tracking-tight text-cyan-accent drop-shadow-[0_0_24px_rgba(0,242,254,0.45)] sm:text-5xl lg:text-6xl"
                  >
                    {formatCurrency(metrics.annualSavings)}
                  </motion.p>
                  <p className="mt-3 text-sm text-slate-muted">
                    Net of autonomous resource fees ·{" "}
                    <span className="font-mono text-white">
                      {formatCurrency(metrics.monthlyOverhead - metrics.autonomousFee)}
                    </span>
                    /mo recovered
                  </p>
                </div>
              </motion.div>

              <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 pt-6">
                <div className="flex items-center gap-2 text-xs text-slate-dim">
                  <Clock className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
                  {weeklyHours * 52} hrs/year reclaimed
                </div>
                <span className="hidden h-3 w-px bg-white/10 sm:block" aria-hidden />
                <div className="flex items-center gap-2 text-xs text-slate-dim">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                  {Math.round((1 - AUTONOMOUS_FEE_RATIO) * 100)}% cost retained as savings
                </div>
              </div>

              <Link href={contactHref} className="block">
                <motion.span
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-accent px-6 py-4 text-sm font-bold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow"
                >
                  Lock In These Savings
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </motion.span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
