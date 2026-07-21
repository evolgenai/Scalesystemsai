import LiveTerminal from "@/components/public/LiveTerminal";
import ROISavingsCalculator from "@/components/ROISavingsCalculator";
import type { Metadata } from "next";
import Link from "next/link";
import LandingHero from "@/components/public/LandingHero";
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
  title: "ScaleSystems | Autonomous Agent Operating System",
  description:
    "The Autonomous Agent Operating System for Modern Teams — Router–Worker swarms, User vs Developer modes, and gas-metered Obsidian workspaces.",
  keywords: [
    "multi-agent orchestration",
    "AI swarm workspace",
    "ScaleSystems",
    "Router Worker agents",
    "agentic automation",
    "agent operating system",
  ],
  openGraph: {
    title: "ScaleSystems | Autonomous Agent Operating System",
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
    <article className="rounded-2xl border border-emerald-900/30 bg-[#050d09]/80 p-6 backdrop-blur-md transition hover:border-emerald-500/40 sm:p-8">
      <div className="mb-5 inline-flex rounded-xl border border-emerald-500/40 bg-emerald-500/20 p-3">
        <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
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
    <main className="relative z-10 w-full max-w-full min-h-screen overflow-x-hidden bg-[#040907]">
      <LandingHero />
      <LiveTerminal />

      <section
        className="w-full max-w-full border-y border-emerald-900/20 px-4 py-12 sm:px-6 lg:px-8"
        aria-labelledby="stats-heading"
      >
        <h2 id="stats-heading" className="sr-only">
          Key runtime signals
        </h2>
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 sm:grid sm:grid-cols-3 sm:gap-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex w-full items-center justify-center gap-4 sm:justify-start"
            >
              <stat.icon
                className="h-8 w-8 shrink-0 text-emerald-400"
                aria-hidden
              />
              <div className="min-w-0">
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
        className="w-full max-w-full px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="pillars-heading"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center">
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

          <div className="mt-14 grid w-full gap-6 md:grid-cols-3 md:gap-8">
            {pillars.map((pillar) => (
              <PillarCard key={pillar.title} {...pillar} />
            ))}
          </div>
        </div>
      </section>

      <ROISavingsCalculator />

      <section
        className="w-full max-w-full px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="cta-heading"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center rounded-3xl border border-emerald-900/30 bg-[#050d09]/80 p-8 text-center backdrop-blur-md sm:p-14">
          <Bot className="mx-auto h-12 w-12 text-emerald-400" aria-hidden />
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
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500 sm:w-auto"
            >
              Open dashboard
            </Link>
            <Link
              href="/pricing"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-900/30 px-8 py-3.5 text-sm font-semibold text-white transition hover:border-emerald-500/50 hover:text-emerald-400 sm:w-auto"
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
