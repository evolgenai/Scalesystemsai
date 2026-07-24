"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Bot, Layers, Gauge } from "lucide-react";

const BLUEPRINT_TEMPLATES = [
  "Wine Estate Shopify Logistics Hub",
  "Multi-Rail Cross-Border Settlement Platform",
  "Enterprise Procurement Orchestration Mesh",
  "Real-Time Compliance Audit Sentinel",
] as const;

const TOKEN_MIN = 10_000;
const TOKEN_MAX = 5_000_000;
const TOKEN_STEP = 10_000;
const TOKEN_DEFAULT = 500_000;

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function NewAgentPage() {
  const [agentName, setAgentName] = useState("");
  const [blueprint, setBlueprint] = useState<string>(BLUEPRINT_TEMPLATES[0]);
  const [tokenQuota, setTokenQuota] = useState(TOKEN_DEFAULT);

  const quotaPercent =
    ((tokenQuota - TOKEN_MIN) / (TOKEN_MAX - TOKEN_MIN)) * 100;

  return (
    <main className="relative min-h-screen bg-obsidian text-white">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-0 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/[0.04] blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[600px] rounded-full bg-purple-500/[0.05] blur-[120px]" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Link
            href="/dashboard"
            className="group mb-8 inline-flex items-center gap-2 text-sm text-slate-muted transition-colors hover:text-cyan-accent"
          >
            <ArrowLeft
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
              aria-hidden
            />
            Back to Dashboard
          </Link>

          <header className="mb-10 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
              <Bot className="h-3.5 w-3.5" aria-hidden />
              Agent Provisioning
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Configure New{" "}
              <span className="text-gradient">AI Agent</span>
            </h1>
            <p className="max-w-xl text-sm text-slate-muted sm:text-base">
              Define your agent identity, select a system blueprint template,
              and set monthly token quota limits before deployment.
            </p>
          </header>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="glass space-y-8 rounded-2xl p-6 sm:p-8"
          onSubmit={(e) => e.preventDefault()}
        >
          <div>
            <label
              htmlFor="agentName"
              className="flex items-center gap-2 text-sm font-medium text-white"
            >
              <Bot className="h-4 w-4 text-cyan-accent" aria-hidden />
              Agent Identifier Name
            </label>
            <input
              id="agentName"
              name="agentName"
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. logistics-router-alpha"
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim transition-colors focus:border-cyan-accent/60 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40"
            />
            <p className="mt-2 text-xs text-slate-dim">
              A unique slug used to reference this agent across your control
              plane.
            </p>
          </div>

          <div>
            <label
              htmlFor="blueprint"
              className="flex items-center gap-2 text-sm font-medium text-white"
            >
              <Layers className="h-4 w-4 text-purple-400" aria-hidden />
              System Blueprint Template
            </label>
            <select
              id="blueprint"
              name="blueprint"
              value={blueprint}
              onChange={(e) => setBlueprint(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white transition-colors focus:border-cyan-accent/60 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40"
            >
              {BLUEPRINT_TEMPLATES.map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-dim">
              Pre-configured LangGraph topology with domain-specific tool
              bindings and guardrails.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <label
                htmlFor="tokenQuota"
                className="flex items-center gap-2 text-sm font-medium text-white"
              >
                <Gauge className="h-4 w-4 text-emerald-400" aria-hidden />
                Monthly Token Quota Threshold Cap
              </label>
              <span className="font-mono text-lg font-semibold text-cyan-accent">
                {formatTokenCount(tokenQuota)}
                <span className="ml-1 text-xs font-normal text-slate-dim">
                  tokens
                </span>
              </span>
            </div>

            <div className="relative">
              <input
                id="tokenQuota"
                name="tokenQuota"
                type="range"
                min={TOKEN_MIN}
                max={TOKEN_MAX}
                step={TOKEN_STEP}
                value={tokenQuota}
                onChange={(e) => setTokenQuota(Number(e.target.value))}
                className="roi-range h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
                style={{
                  background: `linear-gradient(to right, rgba(0,242,254,0.55) 0%, rgba(0,242,254,0.55) ${quotaPercent}%, rgba(255,255,255,0.08) ${quotaPercent}%, rgba(255,255,255,0.08) 100%)`,
                }}
                aria-valuemin={TOKEN_MIN}
                aria-valuemax={TOKEN_MAX}
                aria-valuenow={tokenQuota}
              />
              <div className="mt-1.5 flex justify-between text-[10px] font-mono text-slate-dim">
                <span>{formatTokenCount(TOKEN_MIN)}</span>
                <span>{formatTokenCount(TOKEN_MAX)}</span>
              </div>
            </div>
            <p className="text-xs text-slate-dim">
              Hard cap on inference tokens billed per calendar month. Agents
              pause automatically when the threshold is reached.
            </p>
          </div>

          <div className="border-t border-white/10 pt-6">
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-accent px-6 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow sm:w-auto"
            >
              Stage Agent Configuration
            </button>
          </div>
        </motion.form>
      </div>
    </main>
  );
}
