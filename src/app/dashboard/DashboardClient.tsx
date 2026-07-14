"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import AgentPersonaSelector from "@/components/dashboard/AgentPersonaSelector";
import LiveStreamTerminal from "@/components/dashboard/LiveStreamTerminal";
import WorkspaceHistorySidebar from "@/components/dashboard/WorkspaceHistorySidebar";
import { useAgentStream } from "@/lib/agents/useAgentStream";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import { DEFAULT_PERSONA_ID } from "@/lib/agents/personaPresets";
import { reportWorkspaceActivity } from "@/lib/org/useWorkspacePresence";

const DEFAULT_OBJECTIVE =
  "Analyze https://example.com and run a TypeScript lead-scoring script in the sandbox.";

export default function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const {
    lines,
    results,
    agents,
    connection,
    overallProgress,
    paymentRequired,
    sessionId,
    debateTurns,
    consensusPending,
    debateVote,
    recalledMemories,
    sandboxFrames,
    start,
    stop,
    pause,
    resume,
    clear,
    dismissPaymentRequired,
    registerDebateVote,
    hydrateFromHistory,
  } = useAgentStream({
    enabled: false,
    objective,
    personaId,
    customSystemPrompt,
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

  useEffect(() => {
    if (connection === "closed") {
      setHistoryRefreshToken((token) => token + 1);
    }
  }, [connection]);

  useEffect(() => {
    if (
      connection === "live" ||
      connection === "paused" ||
      connection === "connecting"
    ) {
      reportWorkspaceActivity("spectating");
      return;
    }
    reportWorkspaceActivity("idle");
  }, [connection]);

  const handleObjectiveChange = useCallback((value: string) => {
    setObjective(value);
    if (
      connection === "live" ||
      connection === "paused" ||
      connection === "connecting"
    ) {
      return;
    }
    reportWorkspaceActivity("typing");
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = setTimeout(() => {
      reportWorkspaceActivity("idle");
    }, 2500);
  }, [connection]);

  const handleStart = useCallback(() => {
    setSelectedSessionId(null);
    clear();
    start(objective);
  }, [clear, objective, start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleClear = useCallback(() => {
    setSelectedSessionId(null);
    clear();
  }, [clear]);

  const handleSelectSession = useCallback(
    (session: {
      id: string;
      objective: string;
      lines: Parameters<typeof hydrateFromHistory>[0]["lines"];
      results: Parameters<typeof hydrateFromHistory>[0]["results"];
    }) => {
      setSelectedSessionId(session.id);
      hydrateFromHistory({
        lines: session.lines,
        results: session.results,
      });
    },
    [hydrateFromHistory]
  );

  const handleRerun = useCallback((savedObjective: string) => {
    setSelectedSessionId(null);
    setObjective(savedObjective);
  }, []);

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

      <div className="mx-auto flex max-w-[90rem] gap-4 py-2 sm:py-4">
        <WorkspaceHistorySidebar
          selectedId={selectedSessionId}
          refreshToken={historyRefreshToken}
          onSelectSession={handleSelectSession}
          onRerun={handleRerun}
        />

        <div className="min-w-0 flex-1">
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
                  sandbox tools, and persistent workspace memory.
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
                  <Activity
                    className="h-3.5 w-3.5 text-cyan-accent"
                    aria-hidden
                  />
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
                {selectedSessionId
                  ? "Viewing saved swarm from Workspace History"
                  : activeCount > 0
                    ? `${activeCount} agent${activeCount === 1 ? "" : "s"} active`
                    : "Swarm standing by — enter an objective and launch"}
              </div>
              <span
                className="hidden h-4 w-px bg-white/10 sm:block"
                aria-hidden
              />
              <span className="text-xs text-slate-dim">
                Events{" "}
                <span className="font-mono text-cyan-accent">
                  {lines.length}
                </span>
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
            aria-labelledby="persona-heading"
            className="mb-6 w-full rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
          >
            <h2 id="persona-heading" className="sr-only">
              Agent personality templates
            </h2>
            <AgentPersonaSelector
              personaId={personaId}
              onPersonaChange={setPersonaId}
              customSystemPrompt={customSystemPrompt}
              onCustomSystemPromptChange={setCustomSystemPrompt}
            />
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
                onObjectiveChange={handleObjectiveChange}
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
                sessionId={sessionId}
                debateTurns={debateTurns}
                consensusPending={consensusPending}
                debateVote={debateVote}
                recalledMemories={recalledMemories}
                sandboxFrames={sandboxFrames}
                onDebateVoteRegistered={registerDebateVote}
                paymentRequired={paymentRequired}
                onDismissPaymentRequired={dismissPaymentRequired}
                onPause={pause}
                onResume={resume}
                onProceedCheckout={() => {
                  trackFunnelEvent({ event: "checkout_redirect" });
                  router.push("/checkout");
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
