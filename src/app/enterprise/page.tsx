import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Headphones,
  Lock,
  Minus,
  Server,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Enterprise",
  description:
    "ScaleSystems Enterprise delivers dedicated agent clusters, custom security SLAs, and white-glove agent engineering for organizations that demand production-grade autonomy at scale.",
};

const PILLARS = [
  {
    icon: Server,
    badge: "Infrastructure",
    title: "Dedicated Agent Clusters",
    description:
      "Isolated container compute resources provisioned exclusively for your organization — no noisy-neighbor contention, no shared runtime pools.",
    highlights: [
      "Single-tenant Kubernetes namespaces with guaranteed CPU and memory floors",
      "Sub-50ms intra-cluster routing for high-frequency agent orchestration",
      "Geo-distributed failover with automatic workload rebalancing",
      "Burst capacity headroom for seasonal throughput spikes without re-provisioning",
    ],
  },
  {
    icon: Shield,
    badge: "Security & Compliance",
    title: "Custom Security SLAs",
    description:
      "Enterprise-grade isolation, observability, and policy enforcement tailored to your regulatory posture and internal security review cycles.",
    highlights: [
      "Private VPC peering with your existing cloud estate — agents never traverse the public internet",
      "Enterprise log routing to Splunk, Datadog, or your SIEM with immutable audit trails",
      "Custom threshold guardrails: token ceilings, egress allowlists, and PII redaction policies",
      "Contractual SLA guarantees with defined incident response and escalation timelines",
    ],
  },
  {
    icon: Users,
    badge: "Engineering",
    title: "White-Glove Agent Engineering",
    description:
      "A dedicated solutions team that designs, builds, and maintains your agent fleet — from integration architecture to production hardening.",
    highlights: [
      "Built-to-order integration design across CRM, ERP, ticketing, and proprietary internal APIs",
      "Priority pipeline support with direct Slack or Teams channel to your assigned engineer",
      "Quarterly architecture reviews and proactive performance optimization sprints",
      "Runbook documentation, handoff training, and on-call escalation playbooks",
    ],
  },
];

type ComparisonRow = {
  metric: string;
  standard: string | boolean;
  enterprise: string | boolean;
  enterpriseHighlight?: boolean;
};

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    metric: "Token Quota Limits",
    standard: "50K – 500K / mo",
    enterprise: "Unlimited, contract-defined",
    enterpriseHighlight: true,
  },
  {
    metric: "Dedicated Clusters",
    standard: false,
    enterprise: true,
    enterpriseHighlight: true,
  },
  {
    metric: "Private VPC Deployment",
    standard: false,
    enterprise: true,
    enterpriseHighlight: true,
  },
  {
    metric: "Enterprise Log Routing",
    standard: "Standard logging only",
    enterprise: "SIEM-native, custom pipelines",
    enterpriseHighlight: true,
  },
  {
    metric: "Custom Threshold Guardrails",
    standard: false,
    enterprise: true,
  },
  {
    metric: "24/7 Priority Support",
    standard: false,
    enterprise: true,
    enterpriseHighlight: true,
  },
  {
    metric: "Integration Engineering",
    standard: "Self-serve connectors",
    enterprise: "White-glove, built-to-order",
    enterpriseHighlight: true,
  },
  {
    metric: "SLA Guarantees",
    standard: "Best-effort uptime",
    enterprise: "99.9% contractual SLA",
    enterpriseHighlight: true,
  },
  {
    metric: "Active Agent Deployments",
    standard: "1 – 5 agents",
    enterprise: "Unlimited fleet scale",
  },
  {
    metric: "Dedicated Solutions Engineer",
    standard: false,
    enterprise: true,
  },
];

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto h-5 w-5 text-cyan-accent" aria-label="Included" />
    ) : (
      <X className="mx-auto h-5 w-5 text-slate-dim" aria-label="Not included" />
    );
  }

  return <span>{value}</span>;
}

export default function EnterprisePage() {
  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-1/4 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/5 blur-[150px]" />
        <div className="absolute left-1/4 bottom-1/4 h-[400px] w-[500px] rounded-full bg-blue-500/5 blur-[130px]" />
      </div>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        {/* Hero */}
        <header className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            ScaleSystems Enterprise
          </span>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Production autonomy{" "}
            <span className="text-gradient">without compromise</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            When shared infrastructure, standard quotas, and self-serve support
            aren&apos;t enough — Enterprise gives your organization dedicated
            compute, contractual SLAs, and a solutions team that ships agents
            built for your exact operating model.
          </p>
        </header>

        {/* Pillars */}
        <div className="mt-20 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <article
                key={pillar.title}
                className="glass group flex flex-col rounded-2xl border border-white/10 p-6 transition-all hover:border-cyan-accent/30 hover:shadow-glow-sm sm:p-8"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                    <Icon className="h-5 w-5 text-cyan-accent" aria-hidden />
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-muted">
                    {pillar.badge}
                  </span>
                </div>

                <h2 className="mt-5 font-display text-xl font-semibold text-white">
                  {pillar.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-muted">
                  {pillar.description}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {pillar.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2.5 text-sm text-slate-100"
                    >
                      <ArrowRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-cyan-accent"
                        aria-hidden
                      />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        {/* Comparison Matrix */}
        <div className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-cyan-accent">
              Feature Comparison
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Standard Automation vs.{" "}
              <span className="text-gradient">ScaleSystems Enterprise</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-muted sm:text-base">
              A side-by-side view of what changes when you graduate from
              self-serve plans to a fully managed enterprise deployment.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th
                      scope="col"
                      className="px-6 py-5 text-sm font-medium text-slate-muted"
                    >
                      Capability
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-5 text-center text-sm font-semibold text-white"
                    >
                      Standard Automation
                    </th>
                    <th
                      scope="col"
                      className="relative px-6 py-5 text-center text-sm font-semibold"
                    >
                      <span className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/40 bg-gradient-to-r from-cyan-accent/20 to-blue-500/20 px-4 py-1.5 text-cyan-accent">
                        <Lock className="h-3.5 w-3.5" aria-hidden />
                        ScaleSystems Enterprise
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, index) => (
                    <tr
                      key={row.metric}
                      className={
                        index < COMPARISON_ROWS.length - 1
                          ? "border-b border-white/10"
                          : undefined
                      }
                    >
                      <td className="px-6 py-4 text-sm font-medium text-white">
                        {row.metric}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-slate-muted">
                        <CellValue value={row.standard} />
                      </td>
                      <td
                        className={`px-6 py-4 text-center text-sm font-medium ${
                          row.enterpriseHighlight
                            ? "text-cyan-accent"
                            : "text-slate-100"
                        }`}
                      >
                        <CellValue value={row.enterprise} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="divide-y divide-white/10 sm:hidden">
              {COMPARISON_ROWS.map((row) => (
                <div key={row.metric} className="p-5">
                  <p className="text-sm font-semibold text-white">
                    {row.metric}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-dim">
                        Standard
                      </p>
                      <div className="mt-2 text-sm text-slate-muted">
                        <CellValue value={row.standard} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-cyan-accent">
                        Enterprise
                      </p>
                      <div
                        className={`mt-2 text-sm font-medium ${
                          row.enterpriseHighlight
                            ? "text-cyan-accent"
                            : "text-slate-100"
                        }`}
                      >
                        <CellValue value={row.enterprise} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trust signals */}
        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              icon: Lock,
              label: "SOC 2 Type II aligned architecture",
            },
            {
              icon: Headphones,
              label: "< 15 min P1 incident response SLA",
            },
            {
              icon: Minus,
              label: "Zero shared-tenant data co-mingling",
            },
          ].map((signal) => {
            const Icon = signal.icon;
            return (
              <div
                key={signal.label}
                className="glass flex items-center gap-3 rounded-xl border border-white/10 px-5 py-4"
              >
                <Icon className="h-5 w-5 shrink-0 text-cyan-accent" aria-hidden />
                <span className="text-sm text-slate-100">{signal.label}</span>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-20 flex flex-col items-center text-center">
          <div className="relative w-full max-w-3xl rounded-2xl p-[1px] bg-gradient-to-r from-cyan-accent via-blue-400 to-cyan-accent">
            <div className="glass rounded-2xl px-8 py-12 sm:px-14 sm:py-16">
              <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Ready to deploy enterprise-grade agent infrastructure?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-muted sm:text-base">
                Speak with our enterprise solutions team about dedicated
                clusters, custom security SLAs, and a white-glove engineering
                engagement tailored to your organization.
              </p>
              <Link
                href="/contact?purpose=enterprise"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-accent px-8 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow"
              >
                Request an Enterprise Consultation
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
