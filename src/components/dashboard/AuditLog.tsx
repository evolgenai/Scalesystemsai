"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ClipboardList,
  KeyRound,
  Shield,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type OpStatus = "success" | "denied" | "flagged";

type AuditEntry = {
  id: string;
  timestamp: string;
  apiKeyHash: string;
  actionTarget: string;
  status: OpStatus;
};

const STATUS_META: Record<
  OpStatus,
  { label: string; className: string; Icon: LucideIcon }
> = {
  success: {
    label: "Success",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    Icon: CheckCircle2,
  },
  denied: {
    label: "Denied",
    className: "border-rose-400/30 bg-rose-500/10 text-rose-300",
    Icon: XCircle,
  },
  flagged: {
    label: "Flagged",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    Icon: Shield,
  },
};

const SEED: Omit<AuditEntry, "id">[] = [
  {
    timestamp: "2026-07-20T20:14:02.184Z",
    apiKeyHash: "sk_live_a7f3…9c2e",
    actionTarget: "POST /api/agents/stream · swarm launch",
    status: "success",
  },
  {
    timestamp: "2026-07-20T20:11:44.901Z",
    apiKeyHash: "sk_live_b1e8…4d71",
    actionTarget: "PATCH /workspace/quotas · gas ceiling",
    status: "success",
  },
  {
    timestamp: "2026-07-20T19:58:12.330Z",
    apiKeyHash: "sk_test_c9aa…12f0",
    actionTarget: "DELETE /orgs/memories · purge recall",
    status: "denied",
  },
  {
    timestamp: "2026-07-20T19:42:07.662Z",
    apiKeyHash: "sk_live_a7f3…9c2e",
    actionTarget: "POST /api/chaos/inject · cascade",
    status: "flagged",
  },
  {
    timestamp: "2026-07-20T19:31:55.118Z",
    apiKeyHash: "sk_live_d4c2…88ab",
    actionTarget: "GET /api/telemetry/plugins · lease scan",
    status: "success",
  },
  {
    timestamp: "2026-07-20T18:57:29.447Z",
    apiKeyHash: "sk_live_b1e8…4d71",
    actionTarget: "PUT /alerts/rules · threshold commit",
    status: "success",
  },
  {
    timestamp: "2026-07-20T18:22:03.890Z",
    apiKeyHash: "sk_test_e0ff…3b19",
    actionTarget: "POST /api/mcp/iot · Modbus relay",
    status: "flagged",
  },
  {
    timestamp: "2026-07-20T17:48:41.205Z",
    apiKeyHash: "sk_live_a7f3…9c2e",
    actionTarget: "POST /marketplace/plugins · mount lease",
    status: "success",
  },
  {
    timestamp: "2026-07-20T17:05:16.774Z",
    apiKeyHash: "sk_live_f62d…c441",
    actionTarget: "GET /api/orgs/members · roster export",
    status: "denied",
  },
  {
    timestamp: "2026-07-20T16:39:52.041Z",
    apiKeyHash: "sk_live_d4c2…88ab",
    actionTarget: "POST /healer/validate · patch ACK",
    status: "success",
  },
  {
    timestamp: "2026-07-20T15:58:08.519Z",
    apiKeyHash: "sk_test_c9aa…12f0",
    actionTarget: "POST /token-vault · rotate secret",
    status: "success",
  },
  {
    timestamp: "2026-07-20T15:12:33.960Z",
    apiKeyHash: "sk_live_b1e8…4d71",
    actionTarget: "POST /api/agents/stream · persona override",
    status: "flagged",
  },
];

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    SEED.forEach((entry, i) => {
      const t = setTimeout(() => {
        if (cancelled) return;
        setRows((prev) => [
          ...prev,
          { ...entry, id: `audit-${i}-${entry.timestamp}` },
        ]);
      }, 90 + i * 110);
      timers.push(t);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const successCount = rows.filter((r) => r.status === "success").length;
  const deniedCount = rows.filter((r) => r.status === "denied").length;
  const flaggedCount = rows.filter((r) => r.status === "flagged").length;

  return (
    <section aria-labelledby="audit-log-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
            <Hover3DIcon intensity={12}>
              <ClipboardList className="h-3 w-3" aria-hidden />
            </Hover3DIcon>
            Immutable audit stream
          </div>
          <h2
            id="audit-log-heading"
            className="font-display text-2xl font-bold tracking-tight text-white"
          >
            Tenant Compliance Audit Log
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-muted">
            Append-only security grid of historical platform actions — hashed
            API keys, targets, and operational outcomes.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-[#121212] px-3 py-2 font-mono text-[10px] text-zinc-500">
          <KeyRound className="h-3 w-3 text-emerald-400" aria-hidden />
          HASH-REDACTED · WORM
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatChip label="Committed" value={`${rows.length} / ${SEED.length}`} />
        <StatChip label="Success" value={String(successCount)} accent />
        <StatChip
          label="Denied / Flagged"
          value={`${deniedCount} / ${flaggedCount}`}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
                <th className="px-4 py-3 font-semibold">Access timestamp</th>
                <th className="px-4 py-3 font-semibold">API key hash</th>
                <th className="px-4 py-3 font-semibold">Action target</th>
                <th className="px-4 py-3 font-semibold">Operational status</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((row, index) => {
                  const meta = STATUS_META[row.status];
                  const StatusIcon = meta.Icon;
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{
                        duration: 0.4,
                        delay: 0.02,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                      className="border-b border-white/[0.04] last:border-b-0"
                      style={{
                        borderLeftWidth: 2,
                        borderLeftColor:
                          index % 2 === 0
                            ? "rgba(52, 211, 153, 0.35)"
                            : "transparent",
                      }}
                    >
                      <td className="px-4 py-3 align-middle">
                        <time
                          dateTime={row.timestamp}
                          className="font-mono text-[12px] text-slate-100"
                        >
                          {formatTs(row.timestamp)}
                        </time>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <code className="rounded border border-white/5 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400/90">
                          {row.apiKeyHash}
                        </code>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <p className="max-w-xs truncate text-sm text-white sm:max-w-md">
                          {row.actionTarget}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}
                        >
                          <StatusIcon className="h-3 w-3" aria-hidden />
                          {meta.label}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {rows.length < SEED.length ? (
          <div className="border-t border-white/5 px-4 py-2.5">
            <p className="animate-pulse font-mono text-[10px] text-zinc-500">
              Streaming historical lines…
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-[#121212] px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-sm font-semibold ${
          accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
