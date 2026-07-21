import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Gauge,
  Workflow,
  Wrench,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Enterprise agent orchestration at scale: autonomous AI workflows, dual-rail fiat and crypto billing, multi-tenant quota guardrails, and custom integration tooling.",
};

const FEATURES = [
  {
    icon: Workflow,
    title: "Autonomous AI Workflows",
    description:
      "Deploy long-running agent loops that reason, act, and recover without supervision.",
    points: [
      "Long-running, self-correcting agent execution loops",
      "Multi-tool use across APIs, data stores, and webhooks",
      "Durable state persistence between runs and handoffs",
    ],
  },
  {
    icon: CreditCard,
    title: "Dual-Rail Financial Billing",
    description:
      "Settle in fiat or crypto without changing your entitlement model.",
    points: [
      "Frictionless fiat processing via the Stripe Checkout rail",
      "Secure native crypto settlement through the BVNK gateway",
      "Unified plan tiers applied identically across both rails",
    ],
  },
  {
    icon: Gauge,
    title: "Quota & Multi-Tenant Guardrails",
    description:
      "Native token and deployment guarding enforced per tenant, in real time.",
    points: [
      "Free: 1 active agent / 50,000 tokens per month",
      "Starter: 5 active agents / 500,000 tokens per month",
      "Premium: unlimited deployments and token throughput",
    ],
  },
  {
    icon: Wrench,
    title: "Custom Integrations Systems",
    description:
      "Ship bespoke connectors fast with developer-driven verification tooling.",
    points: [
      "Rapid utility testing scripts for every integration rail",
      "Verify Stripe, BVNK, and database connectivity in one pass",
      "Developer-driven scaling with repeatable health checks",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-1/4 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/5 blur-[150px]" />
        <div className="absolute left-1/4 bottom-1/4 h-[400px] w-[500px] rounded-full bg-emerald-500/5 blur-[130px]" />
      </div>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-cyan-accent">Platform Features</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Enterprise Agent Orchestration{" "}
            <span className="text-gradient">at Scale</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            The infrastructure behind an autonomous AI workforce &mdash;
            production-grade agent runtimes, dual-rail billing, multi-tenant
            guardrails, and the tooling to integrate it all with confidence.
          </p>
        </header>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="glass rounded-2xl p-6 sm:p-8"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                    <Icon className="h-5 w-5 text-cyan-accent" aria-hidden />
                  </span>
                  <h2 className="font-display text-xl font-semibold text-white">
                    {feature.title}
                  </h2>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-slate-muted">
                  {feature.description}
                </p>

                <ul className="mt-5 space-y-2.5">
                  {feature.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2.5 text-sm text-slate-100"
                    >
                      <ArrowRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-cyan-accent"
                        aria-hidden
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="glass mt-16 flex flex-col items-center gap-5 rounded-2xl p-8 text-center sm:p-12">
          <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Designing a custom enterprise architecture?
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-muted sm:text-base">
            Talk to our systems orchestration team about bespoke agent fleets,
            dedicated cluster endpoints, and tailored SLAs for your organization.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-accent px-6 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow"
          >
            Book an architecture consultation
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
