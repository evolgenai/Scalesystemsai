"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Server,
  CircleDot,
  Activity,
} from "lucide-react";
import AgentVisualizerCard from "@/components/dashboard/AgentVisualizerCard";
import AgentSpawnPanel from "@/components/dashboard/AgentSpawnPanel";
import LiveStreamTerminal from "@/components/dashboard/LiveStreamTerminal";
import { useAgentStream } from "@/lib/agents/useAgentStream";
import { trackFunnelEvent } from "@/lib/analytics/funnel";

const DEFAULT_OBJECTIVE =
  "Analyze https://example.com and run a TypeScript lead-scoring script in the sandbox.";

export default function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);

  const {
    lines,
    results,
    agents,
    connection,
    overallProgress,
    paymentRequired,
    start,
    stop,
    clear,
    dismissPaymentRequired,
  } = useAgentStream({
    enabled: false,
    objective,
    loop: false,
  });

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      trackFunnelEvent({
        event: "payment_success_landing",
        provider: searchParams.get("provider") ?? undefined,
        plan: searchParams.get("plan") ?? undefined,
      });
    }
  }, [searchParams]);

  const handleStart = useCallback(() => {
    clear();
    start(objective);
  }, [clear, objective, start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleClear = useCallback(() => {
    clear();
  }, [clear]);

  const activeCount = agents.filter(
    (a) => a.status === "THINKING" || a.status === "EXECUTING"
  ).length;

  return (
    <div className="relative min-h-full bg-obsidian text-white">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-0 top-0 h-[480px] w-[640px] rounded-full bg-cyan-accent/[0.05] blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[360px] w-[520px] rounded-full bg-slate-500/[0.08] blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl py-2 sm:py-4">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-3.5 py-1.5 text-xs font-medium text-cyan-accent">
                <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
                Developer Command Center
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                ScaleSystems{" "}
                <span className="text-gradient">Workforce Console</span>
              </h1>
              <p className="max-w-2xl text-sm text-slate-muted">
                Immersive dual-pane terminal with Gemini swarm orchestration,
                sandbox tools, and live capacity-aware checkout gating.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-slate-muted">
                <Server className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                <span>
                  Engine{" "}
                  <span className="font-mono text-emerald-400">Gemini</span>
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-slate-muted">
                <Activity className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
                <span className="font-mono text-cyan-accent">
                  {overallProgress}%
                </span>
                workflow
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-white/5 bg-black/25 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-muted">
              <CircleDot
                className={`h-3.5 w-3.5 ${
                  activeCount > 0
                    ? "animate-pulse text-emerald-400"
                    : "text-slate-500"
                }`}
                aria-hidden
              />
              {activeCount > 0
                ? `${activeCount} agent${activeCount === 1 ? "" : "s"} active`
                : "Swarm standing by — enter an objective and launch"}
            </div>
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
            <span className="text-xs text-slate-dim">
              Events{" "}
              <span className="font-mono text-cyan-accent">{lines.length}</span>
            </span>
          </div>
        </motion.header>

        <section aria-labelledby="visualizer-heading" className="mb-8">
          <h2 id="visualizer-heading" className="sr-only">
            Agent visualizer cards
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
              >
                <AgentVisualizerCard agent={agent} />
              </motion.div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="split-heading"
          className="grid items-start gap-4 lg:grid-cols-5 lg:gap-6"
        >
          <h2 id="split-heading" className="sr-only">
            Spawn controls and live terminal
          </h2>
          <div className="lg:col-span-2">
            <AgentSpawnPanel
              objective={objective}
              onObjectiveChange={setObjective}
              connection={connection}
              overallProgress={overallProgress}
              onStart={handleStart}
              onStop={handleStop}
              onClear={handleClear}
            />
          </div>
          <div className="lg:col-span-3">
            <LiveStreamTerminal
              lines={lines}
              results={results}
              connection={connection}
              paymentRequired={paymentRequired}
              onDismissPaymentRequired={dismissPaymentRequired}
              onProceedCheckout={() => {
                trackFunnelEvent({ event: "checkout_redirect" });
                router.push("/checkout");
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
