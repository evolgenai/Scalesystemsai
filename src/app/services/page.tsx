import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  MessageSquare,
  Headphones,
  Database,
  Rocket,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "AI Employee Services | Lead Qualification & Enterprise Automation",
  description:
    "Discover what an AI Employee is: 24/7 lead qualification agents, automated customer operations, and data-sync pipelines across legacy tools. Custom build sprints and SaaS licensing from ScaleSystems.",
  keywords: [
    "AI Employee",
    "Lead Qualification Agent",
    "AI Automation Agency",
    "Agentic AI Employees",
    "ScaleSystems Business Automation",
    "enterprise workflow automation",
  ],
  openGraph: {
    title: "ScaleSystems Services | Agentic AI Employees",
    description:
      "Lead qualification, 24/7 customer ops, and legacy data-sync pipelines—built and maintained by ScaleSystems.",
    url: "/services",
  },
};

const focusAreas = [
  {
    icon: MessageSquare,
    title: "Lead Qualification Agents",
    description:
      "Autonomous agents ingest inbound leads from forms, email, and chat. They enrich records, score intent, route hot prospects to sales, and nurture cold leads—without human triage.",
    bullets: [
      "Real-time enrichment via CRM and third-party data",
      "Custom scoring models aligned to your ICP",
      "Automated follow-up sequences and calendar booking",
    ],
  },
  {
    icon: Headphones,
    title: "24/7 Automated Customer Operations",
    description:
      "AI employees handle tier-1 support, order status, account updates, and escalation routing. They operate across channels with brand-consistent tone and full audit trails.",
    bullets: [
      "Omnichannel: email, chat, Slack, and ticketing systems",
      "Human-in-the-loop escalation for complex cases",
      "SLA monitoring and proactive customer outreach",
    ],
  },
  {
    icon: Database,
    title: "Data-Sync Pipelines Across Legacy Tools",
    description:
      "Break down silos between spreadsheets, on-prem databases, and modern SaaS. Our agents reconcile, transform, and sync data on schedules or event triggers—eliminating manual exports.",
    bullets: [
      "Bi-directional sync with conflict resolution",
      "Legacy system adapters (SQL, CSV, custom APIs)",
      "Data quality checks and anomaly alerting",
    ],
  },
];

const pricingModels = [
  {
    icon: Rocket,
    title: "Custom Build Sprints",
    subtitle: "One-time engagement · 4–8 weeks",
    description:
      "A focused delivery cycle: discovery, architecture, agent development, integration, UAT, and production deployment. Ideal for first AI employee or a high-impact workflow.",
    includes: [
      "Operational audit & bottleneck mapping",
      "Multi-agent architecture design",
      "Production deployment & handoff documentation",
      "30-day post-launch optimization window",
    ],
    cta: "Request Sprint Scope",
  },
  {
    icon: RefreshCw,
    title: "SaaS Recurring License",
    subtitle: "Monthly · Managed agent platform",
    description:
      "Ongoing hosting, monitoring, model updates, and feature iterations. Your AI employees evolve as your business scales—without rebuilding from scratch.",
    includes: [
      "Managed infrastructure & 99.9% uptime SLA",
      "Continuous agent tuning and prompt optimization",
      "Priority support and quarterly roadmap reviews",
      "Usage-based scaling for additional agents",
    ],
    cta: "Discuss Licensing",
  },
];

export default function ServicesPage() {
  return (
    <main>
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
            <Bot className="h-3.5 w-3.5" aria-hidden />
            What We Build
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            What Is an <span className="text-gradient">AI Employee?</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-muted">
            An AI Employee is not a chatbot widget—it is a persistent, autonomous
            agent embedded in your operations. It receives tasks, makes decisions
            within defined guardrails, executes across your tools, and reports
            outcomes. It works nights, weekends, and holidays at zero marginal
            labor cost.
          </p>
        </div>
      </section>

      <section
        className="border-y border-white/5 bg-black/20 px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="focus-areas-heading"
      >
        <div className="mx-auto max-w-7xl">
          <h2
            id="focus-areas-heading"
            className="text-center font-display text-3xl font-bold"
          >
            Focus Areas
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-muted">
            Production deployments across revenue, support, and data operations.
          </p>

          <div className="mt-14 grid gap-10 lg:grid-cols-3">
            {focusAreas.map((area) => (
              <article key={area.title} className="glass rounded-2xl p-8">
                <area.icon className="h-8 w-8 text-cyan-accent" aria-hidden />
                <h3 className="mt-5 font-display text-xl font-semibold">
                  {area.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-muted">
                  {area.description}
                </p>
                <ul className="mt-6 space-y-2">
                  {area.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm text-slate-muted"
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-cyan-accent"
                        aria-hidden
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="pricing-heading"
      >
        <div className="mx-auto max-w-7xl">
          <h2
            id="pricing-heading"
            className="text-center font-display text-3xl font-bold"
          >
            Engagement Models
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-muted">
            Flexible paths from proof-of-concept to fully managed autonomous
            operations.
          </p>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            {pricingModels.map((model) => (
              <article
                key={model.title}
                className="glass flex flex-col rounded-2xl p-8 lg:p-10"
              >
                <model.icon className="h-8 w-8 text-cyan-accent" aria-hidden />
                <h3 className="mt-5 font-display text-2xl font-semibold">
                  {model.title}
                </h3>
                <p className="mt-1 text-sm font-medium text-cyan-accent">
                  {model.subtitle}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-slate-muted">
                  {model.description}
                </p>
                <ul className="mt-6 flex-1 space-y-2">
                  {model.includes.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-slate-muted"
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className="mt-8 inline-flex justify-center rounded-lg border border-cyan-accent/50 px-6 py-3 text-sm font-semibold text-cyan-accent transition-colors hover:bg-cyan-accent/10"
                >
                  {model.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
