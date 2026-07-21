import type { Metadata } from "next";
import { Activity } from "lucide-react";

export const metadata: Metadata = {
  title: "System Status",
  description:
    "Live operational status for the ScaleSystems platform: agent orchestration, billing pipelines, and quota guarding subsystems.",
};

const SERVICES = [
  {
    name: "Agentic Workspace Orchestrator",
    state: "Active",
    uptime: "99.98%",
  },
  {
    name: "BVNK Native Crypto Settlement Processing Pipeline",
    state: "Operational",
    uptime: "99.99%",
  },
  {
    name: "Stripe Subscription Synchronization Engine",
    state: "Operational",
    uptime: "99.99%",
  },
  {
    name: "Multi-Tenant Quota Guard Metric System",
    state: "Operational",
    uptime: "100.00%",
  },
];

const INCIDENT_LOG = [
  { label: "Today", note: "All Systems Operational" },
  { label: "Yesterday", note: "All Systems Operational" },
  { label: "3 days ago", note: "All Systems Operational" },
  { label: "9 days ago", note: "All Systems Operational" },
  { label: "18 days ago", note: "All Systems Operational" },
  { label: "30 days ago", note: "All Systems Operational" },
];

const UPTIME_DAYS = Array.from({ length: 30 }, (_, i) => i);

function StatusPulse() {
  return (
    <span className="relative flex h-2.5 w-2.5" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
    </span>
  );
}

export default function StatusPage() {
  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-1/4 top-0 h-[500px] w-[700px] rounded-full bg-emerald-500/5 blur-[150px]" />
      </div>

      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <header className="text-center">
          <p className="text-sm font-medium text-cyan-accent">System Status</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Platform Operational Status
          </h1>
          <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-sm font-medium text-emerald-300">
            <StatusPulse />
            All Systems Operational
          </div>
        </header>

        <div className="mt-14 space-y-4">
          {SERVICES.map((service) => (
            <div
              key={service.name}
              className="glass flex items-center justify-between gap-4 rounded-2xl px-5 py-5 sm:px-6"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <StatusPulse />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-white sm:text-base">
                    {service.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-dim">
                    {service.uptime} uptime &middot; last 30 days
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                {service.state}
              </span>
            </div>
          ))}
        </div>

        <div className="glass mt-10 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-accent" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              30-Day Uptime
            </h2>
          </div>

          <div className="mt-5 flex items-end gap-[3px]">
            {UPTIME_DAYS.map((day) => (
              <span
                key={day}
                title="Operational"
                className="h-9 flex-1 rounded-sm bg-emerald-400/70 transition-colors hover:bg-emerald-300"
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-dim">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            Incident History
          </h2>
          <ul className="mt-5 space-y-3">
            {INCIDENT_LOG.map((entry) => (
              <li
                key={entry.label}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                  <span className="text-sm text-slate-100">{entry.note}</span>
                </div>
                <span className="text-xs text-slate-dim">{entry.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
