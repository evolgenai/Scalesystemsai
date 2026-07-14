import AgentTerminal from "@/components/AgentTerminal";
import ROISavingsCalculator from "@/components/ROISavingsCalculator";
import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import {
  Bot,
  Layers,
  Network,
  Plug,
  Route,
  Shield,
  Clock,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "ScaleSystems | Multi-Agent Orchestration Workspace",
  description:
    "ScaleSystems is the premier multi-agent orchestration workspace — Router–Worker swarms, parallel tool channels, and Obsidian/cyan dual-pane control.",
  keywords: [
    "multi-agent orchestration",
    "AI swarm workspace",
    "ScaleSystems",
    "Router Worker agents",
    "agentic automation",
  ],
  openGraph: {
    title: "ScaleSystems | Multi-Agent Orchestration Workspace",
    description:
      "Deploy autonomous worker fleets with parallel execution and live dual-pane telemetry.",
    url: "/",
  },
};

const pillars = [
  {
    icon: Route,
    title: "Router → Worker routing",
    description:
      "A fast orchestrator pass classifies each objective and dispatches Code Sandbox, Web Scraper, and specialist workers — never a single monolithic prompt.",
  },
  {
    icon: Network,
    title: "Parallel execution channels",
    description:
      "Independent tool runs fire concurrently so scrape + sandbox cycles finish in one wave, not a slow serial queue.",
  },
  {
    icon: Layers,
    title: "Human digests + kernel feed",
    description:
      "Operators get markdown-ready results on the left and verbose swarm telemetry on the right — same stream, two minds.",
  },
];

const stats = [
  { icon: Clock, value: "24/7", label: "Always-on swarm runtime" },
  { icon: TrendingUp, value: "Parallel", label: "Tool channel execution" },
  { icon: Shield, value: "Sandbox", label: "Guarded code evaluation" },
];

function PillarCard({
  icon: Icon,
  title,
  description,
}: (typeof pillars)[number]) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 transition-all hover:border-cyan-accent/30 hover:shadow-[0_0_30px_rgba(0,242,254,0.06)]">
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
          Key runtime signals
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
              Built for agentic operators
            </h2>
            <p className="mt-4 text-slate-muted">
              ScaleSystems turns swarm design patterns into a production
              workspace — routing, parallel tools, and dual-pane visibility.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {pillars.map((pillar) => (
              <PillarCard key={pillar.title} {...pillar} />
            ))}
          </div>
        </div>
      </section>

      <ROISavingsCalculator />

      <section
        className="px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="cta-heading"
      >
        <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-accent/20 bg-gradient-to-b from-cyan-accent/[0.08] to-white/[0.02] p-10 text-center sm:p-14">
          <Bot className="mx-auto h-12 w-12 text-cyan-accent" aria-hidden />
          <h2
            id="cta-heading"
            className="mt-6 font-display text-3xl font-bold sm:text-4xl"
          >
            Ready to orchestrate your first swarm?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-muted">
            Open the Workforce Console or compare Starter and Professional
            capacity — Sign Up unlocks checkout with your plan retained.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex rounded-lg bg-cyan-accent px-8 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow"
            >
              Open dashboard
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-8 py-3.5 text-sm font-semibold text-white transition hover:border-cyan-accent/50 hover:text-cyan-accent"
            >
              <Plug className="h-4 w-4" aria-hidden />
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
