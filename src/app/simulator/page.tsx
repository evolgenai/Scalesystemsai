"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Grape,
  Landmark,
  Play,
  Square,
  Terminal,
} from "lucide-react";

type TemplateId = "wine-estate" | "financial-settlement";

type SimulationTemplate = {
  id: TemplateId;
  label: string;
  icon: typeof Grape;
  description: string;
  steps: string[];
  logs: string[];
};

const TEMPLATES: SimulationTemplate[] = [
  {
    id: "wine-estate",
    label: "Wine Estate Logistics",
    icon: Grape,
    description:
      "Orchestrate cellar-to-channel fulfillment: inventory sync, waybill generation, and distributor outreach.",
    steps: [
      "Syncing Shopify Inventory",
      "Generating Waybills",
      "Emailing Distribution Channels",
    ],
    logs: [
      "[INFO] Initializing agent loop...",
      "[INFO] Binding Shopify Admin API credentials (read_products, read_inventory)",
      "[INFO] Syncing Shopify Inventory — polling variant deltas across 3 warehouses",
      "[SUCCESS] Inventory reconciled: 847 SKUs, 12 low-stock alerts queued",
      "[INFO] Generating Waybills — mapping consignments to carrier manifests",
      "[INFO] Carrier API handshake: DHL Express / FedEx Freight endpoints verified",
      "[SUCCESS] Waybills generated: 34 shipments, tracking refs persisted",
      "[INFO] Emailing Distribution Channels — rendering personalized dispatch notices",
      "[INFO] SMTP relay authenticated; batching 28 distributor inboxes",
      "[SUCCESS] Payload dispatched — all distribution channels notified",
      "[SUCCESS] Agent loop complete — cycle time 4.2s (simulated)",
    ],
  },
  {
    id: "financial-settlement",
    label: "Multi-Rail Financial Settlement",
    icon: Landmark,
    description:
      "Dual-rail pay-in interception, quota enforcement, and fiat settlement routing across crypto and Stripe.",
    steps: [
      "Intercepting BVNK Crypto Pay-in",
      "Verifying Quota",
      "Routing USD Settlement via Stripe",
    ],
    logs: [
      "[INFO] Initializing agent loop...",
      "[INFO] Intercepting BVNK Crypto Pay-in — webhook signature validated",
      "[INFO] Parsing inbound USDC transfer: 12,500.00 USDC on Ethereum mainnet",
      "[SUCCESS] Pay-in confirmed — tx hash anchored to settlement ledger",
      "[INFO] Verifying Quota — resolving tenant entitlement for org_8f2a...",
      "[INFO] Token budget: 412,000 / 500,000 remaining · agent slots: 4 / 5",
      "[SUCCESS] Quota check passed — settlement authorized",
      "[INFO] Routing USD Settlement via Stripe — FX quote locked at 1.0000",
      "[INFO] Stripe Transfer API: creating payout to connected account acct_1Nx...",
      "[SUCCESS] Payload dispatched — $12,500.00 USD settlement initiated",
      "[SUCCESS] Agent loop complete — cycle time 3.8s (simulated)",
    ],
  },
];

const LOG_INTERVAL_MS = 650;

function getLogTone(line: string): string {
  if (line.startsWith("[SUCCESS]")) return "text-emerald-400";
  if (line.startsWith("[WARN]")) return "text-amber-400";
  if (line.startsWith("[ERROR]")) return "text-rose-400";
  return "text-green-400";
}

export default function SimulatorPage() {
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>("wine-estate");
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIndexRef = useRef(0);
  const terminalRef = useRef<HTMLDivElement>(null);

  const template =
    TEMPLATES.find((t) => t.id === activeTemplate) ?? TEMPLATES[0];

  const clearSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    logIndexRef.current = 0;
    setIsRunning(false);
  }, []);

  const launchSimulation = useCallback(() => {
    clearSimulation();
    setTerminalLines([]);
    setIsRunning(true);

    const logs = template.logs;
    logIndexRef.current = 0;

    intervalRef.current = setInterval(() => {
      const index = logIndexRef.current;
      if (index >= logs.length) {
        clearSimulation();
        return;
      }

      setTerminalLines((prev) => [...prev, logs[index]]);
      logIndexRef.current = index + 1;
    }, LOG_INTERVAL_MS);
  }, [clearSimulation, template.logs]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    logIndexRef.current = 0;
    setIsRunning(false);
    setTerminalLines([]);
  }, [activeTemplate]);

  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-0 top-0 h-[480px] w-[640px] rounded-full bg-cyan-accent/[0.04] blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[420px] w-[560px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
      </div>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-sm font-medium text-cyan-accent">
            Agent Workflow Simulator
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Interactive{" "}
            <span className="text-gradient">Playground</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            Select a pre-configured automation template and launch a client-side
            simulation. Watch mock agent logs stream in real time — no backend,
            no webhooks, pure orchestration preview.
          </p>
        </motion.header>

        <div className="mt-12 space-y-6">
          {/* Template selector tabs */}
          <div
            className="glass flex flex-col gap-2 rounded-2xl p-2 sm:flex-row"
            role="tablist"
            aria-label="Automation templates"
          >
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              const isActive = activeTemplate === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  disabled={isRunning}
                  onClick={() => setActiveTemplate(t.id)}
                  className={`flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left transition-all sm:px-5 sm:py-4 ${
                    isActive
                      ? "border border-cyan-accent/30 bg-cyan-accent/10 shadow-glow-sm"
                      : "border border-transparent hover:border-white/10 hover:bg-white/5"
                  } ${isRunning ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${isActive ? "text-cyan-accent" : "text-slate-muted"}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-semibold sm:text-base ${isActive ? "text-white" : "text-slate-300"}`}
                    >
                      {t.label}
                    </span>
                    <span className="mt-0.5 hidden text-xs text-slate-muted sm:block">
                      {t.steps.length} pipeline stages
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Template detail + controls */}
          <div className="glass rounded-2xl p-5 sm:p-8">
            <p className="text-sm leading-relaxed text-slate-muted">
              {template.description}
            </p>

            <ol className="mt-6 space-y-3">
              {template.steps.map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-3 text-sm sm:text-base"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/30 font-mono text-xs text-cyan-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-slate-200">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={launchSimulation}
                disabled={isRunning}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-accent px-5 py-2.5 text-sm font-semibold text-obsidian transition-all hover:shadow-glow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" aria-hidden />
                Launch Simulation
              </button>
              {isRunning && (
                <button
                  type="button"
                  onClick={clearSimulation}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-rose-500/30 hover:text-rose-400"
                >
                  <Square className="h-3.5 w-3.5" aria-hidden />
                  Stop
                </button>
              )}
              {isRunning && (
                <span className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  SIMULATION ACTIVE
                </span>
              )}
            </div>
          </div>

          {/* Live log terminal */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-glow-sm">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" aria-hidden />
                <span className="font-mono text-xs uppercase tracking-wider text-slate-muted">
                  Live Log Terminal
                </span>
              </div>
              <div className="flex gap-1.5" aria-hidden>
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
              </div>
            </div>

            <div
              ref={terminalRef}
              className="h-56 overflow-y-auto p-4 font-mono text-xs leading-relaxed sm:h-72 sm:p-6 sm:text-sm"
              aria-live="polite"
              aria-label="Simulation log output"
            >
              {terminalLines.length === 0 ? (
                <p className="text-slate-dim">
                  <span className="text-emerald-500/50">&gt;</span> Awaiting
                  simulation launch...
                </p>
              ) : (
                <div className="space-y-1.5">
                  {terminalLines.map((line, idx) => (
                    <div key={`${line}-${idx}`} className="flex gap-2">
                      <span className="shrink-0 text-emerald-500/40 select-none">
                        &gt;
                      </span>
                      <span className={getLogTone(line)}>{line}</span>
                    </div>
                  ))}
                  {isRunning && (
                    <div className="flex items-center gap-1 text-green-400">
                      <span className="text-emerald-500/40">&gt;</span>
                      <span className="inline-block h-4 w-2 animate-pulse bg-green-400" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-black/30 px-4 py-2.5 font-mono text-[10px] text-slate-dim sm:px-6 sm:text-xs">
              Template:{" "}
              <span className="text-cyan-accent">{template.label}</span>
              {" · "}
              Lines:{" "}
              <span className="text-emerald-400">{terminalLines.length}</span>
              {" · "}
              Mode:{" "}
              <span className="text-slate-muted">client-side mock</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="glass mt-14 flex flex-col items-center gap-5 rounded-2xl p-8 text-center sm:p-12"
        >
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Need a custom enterprise agent framework?
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-slate-muted sm:text-base">
            This playground runs entirely in your browser. For production-grade
            orchestration — bespoke workflows, live integrations, and
            multi-tenant guardrails — talk to our team about a built-to-order
            deployment.
          </p>
          <Link
            href="/contact?purpose=simulator"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-accent px-6 py-3 text-sm font-semibold text-obsidian transition-all hover:shadow-glow-sm"
          >
            Request Custom Framework
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
