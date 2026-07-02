"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import InteractiveAgentPreview from "./InteractiveAgentPreview";

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pt-24">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-cyan-accent/10 blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Agentic AI Employee & Automation Studio
          </div>

          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Hire an AI Employee for{" "}
            <span className="text-gradient">$0/Hour.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-muted">
            Eliminate administrative overhead. Optimize operational infrastructure.
            Scale your business with autonomous workflows that qualify leads,
            sync data, and run customer operations—without adding headcount.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link href="/contact">
              <motion.span
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-accent px-6 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm hover:shadow-glow"
              >
                Start Your Build Sprint
                <ArrowRight className="h-4 w-4" aria-hidden />
              </motion.span>
            </Link>
            <Link href="/services">
              <motion.span
                whileHover={{ scale: 1.02 }}
                className="inline-flex items-center justify-center rounded-lg border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-cyan-accent/50 hover:text-cyan-accent"
              >
                Explore AI Employees
              </motion.span>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <InteractiveAgentPreview />
        </motion.div>
      </div>
    </section>
  );
}
