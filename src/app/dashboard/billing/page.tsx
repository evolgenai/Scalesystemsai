"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard,
  Receipt,
  ArrowUpCircle,
  Zap,
  Server,
  Shield,
  CheckCircle2,
  Calendar,
  Layers,
  Gauge,
} from "lucide-react";

const TOKEN_ALLOCATION = 500_000;
const ALLOCATION_BOUNDARIES = [
  { pct: 50, label: "50%", tone: "bg-cyan-accent/40" },
  { pct: 80, label: "80%", tone: "bg-amber-400/50" },
  { pct: 100, label: "100%", tone: "bg-rose-400/60" },
] as const;

const INVOICES = [
  {
    id: "#INV-001",
    date: "Jun 01, 2026",
    amount: "$149.00",
    status: "PAID" as const,
  },
  {
    id: "#INV-002",
    date: "May 01, 2026",
    amount: "$149.00",
    status: "PAID" as const,
  },
  {
    id: "#INV-003",
    date: "Apr 01, 2026",
    amount: "$149.00",
    status: "PAID" as const,
  },
  {
    id: "#INV-004",
    date: "Mar 01, 2026",
    amount: "$49.00",
    status: "PAID" as const,
  },
];

const ENTERPRISE_FEATURES = [
  "Extended API thresholds (10M+ req/mo)",
  "Dedicated compute blocks per tenant",
  "Isolated LangGraph cluster endpoints",
  "Priority SLA & on-call escalation",
];

function formatTokenCount(value: number) {
  return value.toLocaleString("en-US");
}

function usageTone(pct: number) {
  if (pct >= 100) return "from-rose-500 to-rose-400";
  if (pct >= 80) return "from-amber-500 to-amber-400";
  return "from-cyan-accent to-cyan-300";
}

export default function BillingDashboardPage() {
  const [simulatedUsage, setSimulatedUsage] = useState(342_180);
  const [requestSent, setRequestSent] = useState(false);

  const usagePct = Math.min(
    100,
    Math.round((simulatedUsage / TOKEN_ALLOCATION) * 100)
  );
  const tokensRemaining = Math.max(0, TOKEN_ALLOCATION - simulatedUsage);

  const handleAllocationRequest = () => {
    setRequestSent(true);
    setTimeout(() => setRequestSent(false), 3000);
  };

  return (
    <main className="relative min-h-screen bg-obsidian text-white">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-0 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/[0.04] blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[600px] rounded-full bg-purple-500/[0.05] blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
                <CreditCard className="h-3.5 w-3.5" aria-hidden />
                Client Billing Portal
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Billing &amp;{" "}
                <span className="text-gradient">Quota Management</span>
              </h1>
              <p className="max-w-2xl text-sm text-slate-muted sm:text-base">
                Review your active plan tier, monitor token allocation
                consumption, request quota upgrades, and browse historical
                invoice records.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-muted sm:flex">
                <Calendar className="h-4 w-4 text-purple-400" aria-hidden />
                <span>
                  Cycle:{" "}
                  <span className="font-mono text-emerald-400">
                    Jul 01 – Jul 31, 2026
                  </span>
                </span>
              </div>
            </div>
          </div>
        </motion.header>

        <div className="space-y-10">
          {/* Current Plan Card */}
          <section aria-labelledby="current-plan-heading">
            <h2 id="current-plan-heading" className="sr-only">
              Current Plan
            </h2>
            <motion.article
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl"
            >
              <div className="border-b border-white/10 bg-black/30 px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                      <Gauge className="h-5 w-5 text-cyan-accent" aria-hidden />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                        Active Subscription
                      </p>
                      <h3 className="font-display text-xl font-semibold text-white">
                        Premium Tier Plan
                      </h3>
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Active
                  </span>
                </div>
              </div>

              <div className="space-y-6 p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                      Tracking Cycle
                    </p>
                    <p className="mt-2 font-mono text-sm text-white">
                      Jul 01 – Jul 31, 2026
                    </p>
                    <p className="mt-1 text-xs text-slate-muted">
                      Resets in 19 days
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                      Token Allocation
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold text-white">
                      {formatTokenCount(TOKEN_ALLOCATION)}
                    </p>
                    <p className="mt-1 text-xs text-slate-muted">
                      Monthly runtime ceiling
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                      Remaining Balance
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold text-cyan-accent">
                      {formatTokenCount(tokensRemaining)}
                    </p>
                    <p className="mt-1 text-xs text-slate-muted">
                      {usagePct}% consumed this cycle
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-cyan-accent" aria-hidden />
                      <span className="text-sm font-medium text-white">
                        Token Usage Ledger
                      </span>
                    </div>
                    <span className="font-mono text-xs text-slate-muted">
                      {formatTokenCount(simulatedUsage)} /{" "}
                      {formatTokenCount(TOKEN_ALLOCATION)} tokens
                    </span>
                  </div>

                  <div className="relative">
                    <div
                      className="relative h-3 overflow-hidden rounded-full border border-white/10 bg-black/40"
                      role="progressbar"
                      aria-valuenow={usagePct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Token consumption"
                    >
                      <motion.div
                        className={`h-full rounded-full bg-gradient-to-r ${usageTone(usagePct)}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${usagePct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                      {ALLOCATION_BOUNDARIES.map((boundary) => (
                        <span
                          key={boundary.pct}
                          className={`absolute top-0 h-full w-px ${boundary.tone}`}
                          style={{ left: `${boundary.pct}%` }}
                          aria-hidden
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] font-mono text-slate-dim">
                      {ALLOCATION_BOUNDARIES.map((boundary) => (
                        <span
                          key={boundary.label}
                          style={{
                            position: "absolute",
                            left: `${boundary.pct}%`,
                            transform: "translateX(-50%)",
                          }}
                          className="hidden sm:inline"
                        >
                          {boundary.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-slate-dim">
                    {ALLOCATION_BOUNDARIES.map((boundary) => (
                      <span
                        key={boundary.label}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${boundary.tone}`}
                          aria-hidden
                        />
                        {boundary.label} allocation boundary
                      </span>
                    ))}
                  </div>

                  <label className="block pt-2">
                    <span className="text-xs text-slate-muted">
                      Simulate consumption level
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={TOKEN_ALLOCATION}
                      step={1_000}
                      value={simulatedUsage}
                      onChange={(e) =>
                        setSimulatedUsage(Number(e.target.value))
                      }
                      className="mt-2 w-full accent-cyan-accent"
                    />
                  </label>
                </div>
              </div>
            </motion.article>
          </section>

          {/* Quota Tier Upgrade Grid */}
          <section aria-labelledby="upgrade-grid-heading" className="space-y-4">
            <div>
              <h2
                id="upgrade-grid-heading"
                className="font-display text-xl font-semibold text-white"
              >
                Quota Tier Upgrade Grid
              </h2>
              <p className="mt-1 text-sm text-slate-muted">
                Compare your current allocation against enterprise cluster
                capacity
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <motion.article
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                    <Layers className="h-5 w-5 text-purple-400" aria-hidden />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                      Current Package
                    </p>
                    <h3 className="font-display text-lg font-semibold text-white">
                      Premium Tier Plan
                    </h3>
                  </div>
                </div>
                <ul className="flex-1 space-y-2.5 text-sm text-slate-muted">
                  <li className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden
                    />
                    500,000 tokens / month runtime pool
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden
                    />
                    Unlimited active agent deployments
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden
                    />
                    Shared multi-tenant compute fabric
                  </li>
                </ul>
                <p className="mt-5 font-display text-2xl font-bold text-white">
                  $149
                  <span className="text-sm font-normal text-slate-dim">/mo</span>
                </p>
              </motion.article>

              <motion.article
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-cyan-accent/30 bg-gradient-to-br from-cyan-accent/[0.06] to-purple-500/[0.04] p-5 backdrop-blur-xl sm:p-6"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-accent/10 blur-2xl" aria-hidden />
                <div className="relative mb-4 flex items-center gap-3">
                  <div className="rounded-xl border border-cyan-accent/30 bg-black/30 p-2.5">
                    <Server className="h-5 w-5 text-cyan-accent" aria-hidden />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-accent/80">
                      Upgrade Target
                    </p>
                    <h3 className="font-display text-lg font-semibold text-white">
                      Enterprise Cluster Tier
                    </h3>
                  </div>
                </div>
                <ul className="relative flex-1 space-y-2.5 text-sm text-slate-muted">
                  {ENTERPRISE_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Shield
                        className="mt-0.5 h-4 w-4 shrink-0 text-cyan-accent"
                        aria-hidden
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="relative mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-display text-2xl font-bold text-white">
                    Custom
                    <span className="ml-1 text-sm font-normal text-slate-dim">
                      pricing
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={handleAllocationRequest}
                    disabled={requestSent}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-accent px-5 py-2.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-80"
                  >
                    {requestSent ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Request Submitted
                      </>
                    ) : (
                      <>
                        <ArrowUpCircle className="h-4 w-4" aria-hidden />
                        Request Allocation Bump
                      </>
                    )}
                  </button>
                </div>
              </motion.article>
            </div>
          </section>

          {/* Historical Invoice Log Matrix */}
          <section aria-labelledby="invoice-log-heading" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="invoice-log-heading"
                  className="font-display text-xl font-semibold text-white"
                >
                  Historical Invoice Log
                </h2>
                <p className="mt-1 text-sm text-slate-muted">
                  Simulated payment records for your account billing history
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-muted">
                <Receipt className="h-3.5 w-3.5 text-purple-400" aria-hidden />
                {INVOICES.length} records on file
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-black/30 text-slate-muted">
                    <tr>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider">
                        Invoice ID
                      </th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider">
                        Billing Date
                      </th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider">
                        Amount Paid
                      </th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {INVOICES.map((invoice, index) => (
                      <motion.tr
                        key={invoice.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 + index * 0.05 }}
                        className="transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs font-semibold text-cyan-accent">
                            {invoice.id}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-muted">
                          {invoice.date}
                        </td>
                        <td className="px-5 py-4 font-mono font-medium text-white">
                          {invoice.amount}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                            {invoice.status}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </section>
        </div>
      </div>
    </main>
  );
}
