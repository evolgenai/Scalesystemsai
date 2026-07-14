"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Network, Sparkles } from "lucide-react";
import InteractiveAgentPreview from "./InteractiveAgentPreview";

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-20 lg:pt-20">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,242,254,0.12),_transparent_55%)]" />
        <div className="absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-accent/10 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[280px] w-[420px] rounded-full bg-slate-600/20 blur-[100px]" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-cyan-accent"
          >
            ScaleSystems
          </motion.p>

          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            The premier{" "}
            <span className="text-gradient">multi-agent orchestration</span>{" "}
            workspace.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-muted">
            Route objectives to specialized workers, run tools in parallel, and
            watch human digests stream beside the live kernel feed — all on the
            Obsidian runtime.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link href="/dashboard">
              <motion.span
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-accent px-6 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm hover:shadow-glow"
              >
                Launch the workspace
                <ArrowRight className="h-4 w-4" aria-hidden />
              </motion.span>
            </Link>
            <Link href="/pricing">
              <motion.span
                whileHover={{ scale: 1.02 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-cyan-accent/50 hover:text-cyan-accent"
              >
                <Network className="h-4 w-4" aria-hidden />
                View swarm plans
              </motion.span>
            </Link>
          </div>

          <p className="mt-6 inline-flex items-center gap-2 text-xs text-slate-dim">
            <Sparkles className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
            Router → Worker architecture with parallel sandbox channels
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.15 }}
        >
          <InteractiveAgentPreview />
        </motion.div>
      </div>
    </section>
  );
}
