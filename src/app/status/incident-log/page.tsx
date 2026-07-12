import type { Metadata } from "next";
import { Activity, Clock, Layers, Server } from "lucide-react";

export const metadata: Metadata = {
  title: "Incident Log",
  description:
    "Automated system-status incident log for ScaleSystems infrastructure: uptime monitoring, historical operational events, and per-layer health tracking.",
};

const INFRASTRUCTURE_LAYERS = [
  { name: "API Gateway", status: "OPERATIONAL" as const },
  { name: "AI Orchestration Hub", status: "OPERATIONAL" as const },
  { name: "Multi-Rail Ledger Node", status: "OPERATIONAL" as const },
];

const TIMELINE_EVENTS = [
  {
    id: "evt-001",
    title: "Upstream LLM Provider Latency Degradation",
    resolution: "Resolved",
    tone: "amber" as const,
    timestamp: "Jul 8, 2026 · 14:22 UTC",
    duration: "47 min",
    summary:
      "Elevated p95 inference latency detected across primary LLM routing paths. Traffic was shifted to secondary provider endpoints until baseline response times were restored.",
  },
  {
    id: "evt-002",
    title: "Scheduled Database Schema Migration Window",
    resolution: "Completed",
    tone: "emerald" as const,
    timestamp: "Jul 3, 2026 · 02:00 UTC",
    duration: "2 hr 15 min",
    summary:
      "Planned migration applied tenant-partition indexes and quota-metric archival tables. Read replicas were promoted sequentially with zero client-facing downtime.",
  },
  {
    id: "evt-003",
    title: "Cross-Border ACH Rail Gateway Maintenance",
    resolution: "Completed",
    tone: "emerald" as const,
    timestamp: "Jun 27, 2026 · 06:30 UTC",
    duration: "3 hr 40 min",
    summary:
      "Coordinated maintenance on the ACH settlement gateway for compliance certificate rotation. Outbound batch queues were drained prior to the window and reconciled on completion.",
  },
];

function StatusPulse() {
  return (
    <span className="relative flex h-3 w-3" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
    </span>
  );
}

function StatusBadge({
  status,
  tone = "emerald",
}: {
  status: string;
  tone?: "emerald" | "amber";
}) {
  const styles =
    tone === "amber"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
      : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";

  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide ${styles}`}
    >
      {status}
    </span>
  );
}

export default function IncidentLogPage() {
  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-1/4 top-0 h-[480px] w-[640px] -translate-x-1/2 rounded-full bg-emerald-500/5 blur-[150px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[520px] rounded-full bg-cyan-accent/[0.04] blur-[130px]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {/* Global Uptime Monitor Header */}
        <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-10">
          <p className="text-sm font-medium text-cyan-accent">
            Automated System-Status Incident Log
          </p>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="mt-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/5">
                <StatusPulse />
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                  99.98% Core Nodes Operational
                </h1>
                <p className="mt-2 max-w-xl text-sm text-slate-dim sm:text-base">
                  Macro-system health across orchestration, settlement, and
                  inference layers. Last automated sweep{" "}
                  <span className="font-mono text-slate-100">11:41 UTC</span>.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-sm font-medium text-emerald-300 sm:self-center">
              <StatusPulse />
              Live Monitor Active
            </div>
          </div>
        </header>

        {/* Historical Timeline Ledger */}
        <div className="mt-10">
          <div className="mb-5 flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-accent" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              Historical Timeline Ledger
            </h2>
          </div>

          <ol className="relative space-y-0">
            {TIMELINE_EVENTS.map((event, index) => {
              const isLast = index === TIMELINE_EVENTS.length - 1;
              const dotColor =
                event.tone === "amber" ? "bg-amber-400" : "bg-emerald-400";
              const lineColor =
                event.tone === "amber" ? "bg-amber-400/30" : "bg-emerald-400/30";

              return (
                <li key={event.id} className="relative flex gap-4 sm:gap-6">
                  <div className="flex flex-col items-center">
                    <span
                      className={`relative z-10 mt-6 h-3 w-3 shrink-0 rounded-full ring-4 ring-obsidian ${dotColor}`}
                      aria-hidden
                    />
                    {!isLast && (
                      <span
                        className={`w-px flex-1 ${lineColor}`}
                        aria-hidden
                      />
                    )}
                  </div>

                  <article className="mb-4 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-base font-semibold text-white sm:text-lg">
                          {event.title}
                        </h3>
                        <p className="font-mono text-xs text-slate-dim">
                          {event.timestamp}
                        </p>
                      </div>
                      <StatusBadge
                        status={event.resolution}
                        tone={event.tone}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-muted">
                      {event.summary}
                    </p>
                    <p className="mt-3 text-xs text-slate-dim">
                      Window duration:{" "}
                      <span className="font-medium text-slate-100">
                        {event.duration}
                      </span>
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>

        {/* System Infrastructure Grid */}
        <div className="mt-10">
          <div className="mb-5 flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-accent" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              System Infrastructure Grid
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INFRASTRUCTURE_LAYERS.map((layer) => (
              <div
                key={layer.name}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                      <Server
                        className="h-4 w-4 text-cyan-accent"
                        aria-hidden
                      />
                    </div>
                    <h3 className="text-sm font-semibold text-white sm:text-base">
                      {layer.name}
                    </h3>
                  </div>
                  <StatusPulse />
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-xs text-slate-dim">Layer status</span>
                  <StatusBadge status={layer.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-10 flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2 text-xs text-slate-dim">
            <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
            <span>Automated status ledger · refreshed every 60s</span>
          </div>
          <a
            href="/status"
            className="text-xs font-medium text-cyan-accent transition-colors hover:text-cyan-accent/80"
          >
            ← Back to Platform Status
          </a>
        </footer>
      </section>
    </main>
  );
}
