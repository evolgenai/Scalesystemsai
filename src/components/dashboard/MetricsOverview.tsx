"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Clock,
  DollarSign,
  Zap,
  type LucideIcon,
} from "lucide-react";

type Metric = {
  id: string;
  label: string;
  value: string;
  sublabel: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
};

const METRICS: Metric[] = [
  {
    id: "tasks",
    label: "Tasks Automated This Month",
    value: "14,248",
    sublabel: "+18.4% vs last month",
    icon: Zap,
    accent: "text-cyan-accent",
    glow: "from-cyan-accent/10 to-transparent",
  },
  {
    id: "compute",
    label: "Active Compute Hours",
    value: "720h",
    sublabel: "3 agents running continuously",
    icon: Clock,
    accent: "text-purple-400",
    glow: "from-purple-500/10 to-transparent",
  },
  {
    id: "latency",
    label: "Average Latency",
    value: "1.8s",
    sublabel: "P95: 2.4s across all nodes",
    icon: Activity,
    accent: "text-emerald-400",
    glow: "from-emerald-500/10 to-transparent",
  },
  {
    id: "savings",
    label: "Estimated Cost Savings",
    value: "$4,250",
    sublabel: "Based on 142 FTE hours offset",
    icon: DollarSign,
    accent: "text-amber-400",
    glow: "from-amber-500/10 to-transparent",
  },
];

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

export default function MetricsOverview() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {METRICS.map((metric) => {
        const Icon = metric.icon;
        return (
          <motion.article
            key={metric.id}
            variants={item}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition-colors hover:border-white/15"
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${metric.glow} opacity-0 transition-opacity group-hover:opacity-100`}
              aria-hidden
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                  {metric.label}
                </p>
                <p className="font-display text-3xl font-bold tracking-tight text-white">
                  {metric.value}
                </p>
                <p className="text-xs text-slate-muted">{metric.sublabel}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                <Icon className={`h-5 w-5 ${metric.accent}`} aria-hidden />
              </div>
            </div>
          </motion.article>
        );
      })}
    </motion.div>
  );
}
