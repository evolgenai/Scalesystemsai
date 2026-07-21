"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Clock3,
  Coins,
  Plug,
  type LucideIcon,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type LeaseStatus = "active" | "trial" | "expired" | "suspended";

type PluginMetric = {
  id: string;
  name: string;
  publisher: string;
  lease: LeaseStatus;
  invocations: number;
  revenueTotal: number;
  revenuePerRun: number;
  latencyMs: number;
};

const PLUGINS: PluginMetric[] = [
  {
    id: "db-janitor",
    name: "Database Janitor Agent",
    publisher: "Scale Systems Labs",
    lease: "active",
    invocations: 12_840,
    revenueTotal: 372.36,
    revenuePerRun: 0.029,
    latencyMs: 184,
  },
  {
    id: "stripe-webhook-monitor",
    name: "Stripe Webhook Monitor",
    publisher: "Payments Edge",
    lease: "active",
    invocations: 48_210,
    revenueTotal: 1_205.25,
    revenuePerRun: 0.025,
    latencyMs: 96,
  },
  {
    id: "modbus-plc",
    name: "Modbus PLC Relay Adapter",
    publisher: "Meerendal IoT",
    lease: "active",
    invocations: 3_102,
    revenueTotal: 775.5,
    revenuePerRun: 0.25,
    latencyMs: 412,
  },
  {
    id: "lead-sentinel",
    name: "Lead Sentinel Scout",
    publisher: "Outbound Swarm",
    lease: "trial",
    invocations: 890,
    revenueTotal: 0,
    revenuePerRun: 0.049,
    latencyMs: 268,
  },
  {
    id: "obsidian-sync-mcp",
    name: "Obsidian Vault Sync MCP",
    publisher: "Memory Bank Co",
    lease: "active",
    invocations: 6_450,
    revenueTotal: 122.55,
    revenuePerRun: 0.019,
    latencyMs: 142,
  },
  {
    id: "swarm-debugger",
    name: "Swarm Trace Debugger",
    publisher: "Telemetry Forge",
    lease: "suspended",
    invocations: 210,
    revenueTotal: 20.79,
    revenuePerRun: 0.099,
    latencyMs: 540,
  },
  {
    id: "gate-power-probe",
    name: "Estate Gate Power Probe",
    publisher: "Meerendal Estate",
    lease: "active",
    invocations: 1_640,
    revenueTotal: 82.0,
    revenuePerRun: 0.05,
    latencyMs: 318,
  },
  {
    id: "crm-sync-bridge",
    name: "CRM Sync Bridge",
    publisher: "Pipeline Ops",
    lease: "expired",
    invocations: 0,
    revenueTotal: 0,
    revenuePerRun: 0.015,
    latencyMs: 0,
  },
];

const LEASE_STYLES: Record<
  LeaseStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  trial: {
    label: "Trial",
    className: "border-cyan-accent/30 bg-cyan-accent/10 text-cyan-accent",
  },
  expired: {
    label: "Expired",
    className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  },
  suspended: {
    label: "Suspended",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
};

function formatUsd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n < 1 && n > 0 ? 3 : 2,
    maximumFractionDigits: n < 1 && n > 0 ? 3 : 2,
  });
}

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-[#121212] px-3.5 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
        <Hover3DIcon intensity={12}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </Hover3DIcon>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
          {label}
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

export default function PluginAnalytics() {
  const activeLeases = PLUGINS.filter((p) => p.lease === "active").length;
  const totalInvocations = PLUGINS.reduce((s, p) => s + p.invocations, 0);
  const totalRevenue = PLUGINS.reduce((s, p) => s + p.revenueTotal, 0);
  const avgLatency =
    PLUGINS.filter((p) => p.latencyMs > 0).reduce(
      (s, p) => s + p.latencyMs,
      0
    ) / Math.max(PLUGINS.filter((p) => p.latencyMs > 0).length, 1);

  return (
    <section
      aria-labelledby="plugin-analytics-heading"
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
            <Hover3DIcon intensity={12}>
              <Plug className="h-3 w-3" aria-hidden />
            </Hover3DIcon>
            Multi-tenant plugins
          </div>
          <h2
            id="plugin-analytics-heading"
            className="font-display text-2xl font-bold tracking-tight text-white"
          >
            Plugin Performance Monitor
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-muted">
            Lease status, invocation volume, revenue per run, and execution
            latency across installed marketplace extensions.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatChip
          icon={Plug}
          label="Active leases"
          value={`${activeLeases} / ${PLUGINS.length}`}
        />
        <StatChip
          icon={Activity}
          label="Total invocations"
          value={formatCount(totalInvocations)}
        />
        <StatChip
          icon={Coins}
          label="Revenue earned"
          value={formatUsd(totalRevenue)}
        />
        <StatChip
          icon={Clock3}
          label="Avg latency"
          value={`${Math.round(avgLatency)} ms`}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                <th className="px-4 py-3 font-semibold">Extension</th>
                <th className="px-4 py-3 font-semibold">Lease status</th>
                <th className="px-4 py-3 font-semibold">Invocations</th>
                <th className="px-4 py-3 font-semibold">Revenue earned</th>
                <th className="px-4 py-3 font-semibold">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {PLUGINS.map((plugin, index) => {
                const lease = LEASE_STYLES[plugin.lease];
                return (
                  <motion.tr
                    key={plugin.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.35,
                      delay: index * 0.045,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileHover={{ scale: 1.008 }}
                    className="origin-left border-b border-white/[0.04] last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {plugin.name}
                        </p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {plugin.publisher}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${lease.className}`}
                      >
                        {lease.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-100">
                      {formatCount(plugin.invocations)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-sm text-emerald-400">
                        {formatUsd(plugin.revenueTotal)}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        {formatUsd(plugin.revenuePerRun)}/run
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono text-sm ${
                          plugin.latencyMs === 0
                            ? "text-zinc-500"
                            : plugin.latencyMs > 400
                              ? "text-amber-300"
                              : "text-cyan-accent"
                        }`}
                      >
                        {plugin.latencyMs === 0
                          ? "—"
                          : `${plugin.latencyMs} ms`}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
