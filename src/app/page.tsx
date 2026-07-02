import AgentTerminal from '@/components/AgentTerminal';
import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import {
  Bot,
  Layers,
  Plug,
  Workflow,
  Shield,
  Clock,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Hire an AI Employee for $0/Hour | Agentic Business Automation",
  description:
    "ScaleSystems deploys autonomous AI employees that eliminate admin overhead, automate CRM workflows, and scale operations 24/7. AI Automation Agency for enterprise teams.",
  keywords: [
    "AI Automation Agency",
    "Agentic AI Employees",
    "ScaleSystems Business Automation",
    "hire AI employee",
    "autonomous workflows",
  ],
  openGraph: {
    title: "ScaleSystems | Hire an AI Employee for $0/Hour",
    description:
      "Eliminate administrative overhead with custom multi-agent frameworks and enterprise workflow optimization.",
    url: "/",
  },
};

const pillars = [
  {
    icon: Layers,
    title: "Custom Multi-Agent Frameworks",
    description:
      "Orchestrated agent networks that collaborate across tasks—lead routing, document processing, approval chains, and executive reporting—built for your exact operating model.",
  },
  {
    icon: Plug,
    title: "SaaS Automation Integrations",
    description:
      "Native connectors and API pipelines across Salesforce, HubSpot, Slack, Notion, legacy ERPs, and custom internal tools. Your stack stays; the manual work disappears.",
  },
  {
    icon: Workflow,
    title: "Enterprise Workflow Optimization",
    description:
      "We map bottlenecks, redesign processes, and deploy agents that enforce SLAs, reduce error rates, and deliver measurable ROI within the first sprint cycle.",
  },
];

const stats = [
  { icon: Clock, value: "24/7", label: "Always-on operations" },
  { icon: TrendingUp, value: "73%", label: "Avg. admin time saved" },
  { icon: Shield, value: "SOC 2", label: "Security-first architecture" },
];

function PillarCard({
  icon: Icon,
  title,
  description,
}: (typeof pillars)[number]) {
  return (
    <article className="glass group rounded-2xl p-8 transition-all hover:border-cyan-accent/30 hover:shadow-glow-sm">
      <div className="mb-5 inline-flex rounded-xl bg-cyan-accent/10 p-3">
        <Icon className="h-6 w-6 text-cyan-accent" aria-hidden />
      </div>
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-muted">
        {description}
      </p>
    </article>
  );
}

export default function HomePage() {
  return (
    <main>
      <Hero />
      <AgentTerminal />

      <section
        className="border-y border-white/5 bg-black/20 px-4 py-12 sm:px-6 lg:px-8"
        aria-labelledby="stats-heading"
      >
        <h2 id="stats-heading" className="sr-only">
          Key performance metrics
        </h2>
        <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-4">
              <stat.icon className="h-8 w-8 text-cyan-accent" aria-hidden />
              <div>
                <p className="font-display text-2xl font-bold text-white">
                  {stat.value}
                </p>
                <p className="text-sm text-slate-muted">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="pillars-heading"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="pillars-heading"
              className="font-display text-3xl font-bold sm:text-4xl"
            >
              Core Capabilities
            </h2>
            <p className="mt-4 text-slate-muted">
              Three pillars that power every ScaleSystems deployment—from
              prototype to production-grade autonomous operations.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {pillars.map((pillar) => (
              <PillarCard key={pillar.title} {...pillar} />
            ))}
          </div>
        </div>
      </section>

      <section
        className="px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="cta-heading"
      >
        <div className="glass mx-auto max-w-4xl rounded-3xl p-10 text-center sm:p-14">
          <Bot className="mx-auto h-12 w-12 text-cyan-accent" aria-hidden />
          <h2
            id="cta-heading"
            className="mt-6 font-display text-3xl font-bold sm:text-4xl"
          >
            Ready to deploy your first AI employee?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-muted">
            Book a strategy session. We&apos;ll audit your operational
            bottlenecks and scope a custom build sprint with clear deliverables
            and ROI targets.
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex rounded-lg bg-cyan-accent px-8 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow"
          >
            Schedule a Consultation
          </Link>
        </div>
      </section>
    </main>
  );
}
