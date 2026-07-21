"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Code2,
  Layers,
  Network,
  Shield,
  Store,
  UserRound,
  Zap,
} from "lucide-react";

const AgentNetworkCanvas = dynamic(() => import("./AgentNetworkCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#09090B] sm:min-h-[340px]">
      <div className="h-24 w-24 animate-pulse rounded-full border border-emerald-500/30 bg-emerald-500/10" />
    </div>
  ),
});

type PreviewMode = "USER" | "DEVELOPER";

const MODE_COPY: Record<
  PreviewMode,
  { title: string; body: string; bullets: string[] }
> = {
  USER: {
    title: "User Mode",
    body: "Launch agent fleets with natural-language objectives and live digests — no kernel noise.",
    bullets: [
      "One-click swarm templates",
      "Human-readable result panes",
      "Gas meter + marketplace install",
    ],
  },
  DEVELOPER: {
    title: "Developer Mode",
    body: "Blueprint canvas, CLI deploy, chaos inject, and teletraffic — full Obsidian control plane.",
    bullets: [
      "Workflow builder + simulate",
      "MCP hosts & vault credentials",
      "SRE heal + audit WORM stream",
    ],
  },
};

const FEATURES = [
  {
    icon: Network,
    title: "Autonomous agent mesh",
    description:
      "Router → Worker swarms connect in real time with parallel tool channels.",
  },
  {
    icon: Layers,
    title: "Dual-pane control",
    description:
      "Operator digests beside live kernel telemetry — same stream, two minds.",
  },
  {
    icon: Zap,
    title: "Gas-metered runtime",
    description:
      "Claim free credits, meter every swarm run, recharge without leaving the console.",
  },
  {
    icon: Shield,
    title: "Tenant-grade vault",
    description:
      "Per-workspace credentials, domain branding, and immutable security logs.",
  },
] as const;

export default function LandingHero() {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("USER");
  const mode = MODE_COPY[previewMode];

  return (
    <div className="relative z-10 min-h-screen overflow-hidden bg-[#09090B]">
      <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-20 lg:pt-20">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.14),_transparent_55%)]" />
          <div className="absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
          <div className="absolute bottom-0 right-0 h-[280px] w-[420px] rounded-full bg-cyan-accent/10 blur-[100px]" />
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <p className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">
              ScaleSystems
            </p>

            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.35rem]">
              The Autonomous Agent Operating System for{" "}
              <span className="text-gradient">Modern Teams.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-muted">
              Spawn Router–Worker fleets, compare User vs Developer surfaces, and
              claim free gas credits — all on the Obsidian glass runtime.
            </p>

            <div
              className="mt-8 inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl"
              role="group"
              aria-label="Mode comparison preview"
            >
              <button
                type="button"
                onClick={() => setPreviewMode("USER")}
                aria-pressed={previewMode === "USER"}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  previewMode === "USER"
                    ? "bg-emerald-500 text-[#09090B] shadow-[0_0_24px_rgba(16,185,129,0.35)]"
                    : "text-slate-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                User Mode
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("DEVELOPER")}
                aria-pressed={previewMode === "DEVELOPER"}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  previewMode === "DEVELOPER"
                    ? "bg-emerald-500 text-[#09090B] shadow-[0_0_24px_rgba(16,185,129,0.35)]"
                    : "text-slate-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                <Code2 className="h-3.5 w-3.5" aria-hidden />
                Developer Mode
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={previewMode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="mt-5 max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl"
              >
                <p className="text-sm font-semibold text-white">{mode.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-muted">
                  {mode.body}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {mode.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-center gap-2 text-xs text-emerald-300/90"
                    >
                      <span className="h-1 w-1 rounded-full bg-emerald-400" />
                      {b}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard?onboard=1">
                <motion.span
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-[#09090B] shadow-[0_0_28px_rgba(16,185,129,0.35)] hover:bg-emerald-400 sm:w-auto"
                >
                  Launch Workspace Console
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </motion.span>
              </Link>
              <Link href="/dashboard?view=marketplace">
                <motion.span
                  whileHover={{ scale: 1.02 }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-emerald-500/50 hover:text-emerald-400 sm:w-auto"
                >
                  <Store className="h-4 w-4" aria-hidden />
                  Explore Agent Marketplace
                </motion.span>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="relative z-10 w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#09090B] isolation-isolate"
          >
            <AgentNetworkCanvas className="w-full !rounded-none !border-0" />
          </motion.div>
        </div>
      </section>

      <section
        className="relative z-10 border-y border-white/5 bg-black/20 px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="feature-showcase-heading"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/80">
              Product feature showcase
            </p>
            <h2
              id="feature-showcase-heading"
              className="mt-2 font-display text-3xl font-bold sm:text-4xl"
            >
              Built as an agent operating system
            </h2>
            <p className="mt-3 text-slate-muted">
              Everything teams need to provision, meter, and operate autonomous
              workforces on Obsidian glass.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <motion.article
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.08)]"
              >
                <div className="mb-4 inline-flex rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-2.5">
                  <f.icon className="h-5 w-5 text-emerald-400" aria-hidden />
                </div>
                <h3 className="font-display text-lg font-semibold text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-muted">
                  {f.description}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
