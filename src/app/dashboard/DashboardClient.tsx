"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Server,
  CircleDot,
  Activity,
  PanelsTopLeft,
  X,
} from "lucide-react";
import AgentVisualizerCard from "@/components/dashboard/AgentVisualizerCard";
import AgentSpawnPanel from "@/components/dashboard/AgentSpawnPanel";
import AgentPersonaSelector from "@/components/dashboard/AgentPersonaSelector";
import LiveStreamTerminal from "@/components/dashboard/LiveStreamTerminal";
import WorkspaceHistorySidebar from "@/components/dashboard/WorkspaceHistorySidebar";
import McpManager from "@/components/dashboard/McpManager";
import HealerConsole from "@/components/dashboard/HealerConsole";

const AgentCardStack3D = dynamic(
  () => import("@/components/dashboard/AgentCardStack3D"),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-white/5 bg-[#121212]"
          />
        ))}
      </div>
    ),
  }
);
import { useAuth } from "@/components/auth/AuthProvider";
import { useAgentStream } from "@/lib/agents/useAgentStream";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import { DEFAULT_PERSONA_ID } from "@/lib/agents/personaPresets";
import { reportWorkspaceActivity } from "@/lib/org/useWorkspacePresence";

const DEFAULT_OBJECTIVE =
  "Analyze https://example.com and run a TypeScript lead-scoring script in the sandbox.";

type DashboardClientProps = {
  /** Server-derived env bypass: DEV_USER_ROLE + DEV_USER_TIER. */
  isSuperAdmin?: boolean;
};

export default function DashboardClient({
  isSuperAdmin = false,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready: authReady } = useAuth();
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [mountedPluginIds, setMountedPluginIds] = useState<string[]>([]);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [troubleshootActive, setTroubleshootActive] = useState(false);
  const [crashAlert, setCrashAlert] = useState<string | null>(null);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  /**
   * Hydration-stable lock: SSR + first client paint use only the server-passed
   * isSuperAdmin flag. Auth (localStorage) is applied after `authReady` so
   * guest Vercel views never mismatch / unmount the selector.
   */
  const [personasLocked, setPersonasLocked] = useState(!isSuperAdmin);

  useEffect(() => {
    if (!authReady) return;
    setPersonasLocked(!(isSuperAdmin || Boolean(user)));
  }, [authReady, isSuperAdmin, user]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setWorkspaceOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-0 py-2 sm:py-4 lg:flex-row lg:gap-4">
        <WorkspaceHistorySidebar
          selectedId={selectedSessionId}
          refreshToken={historyRefreshToken}
          onSelectSession={handleSelectSession}
          onRerun={handleRerun}
        />

        <div className="min-w-0 w-full flex-1">
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

          {crashAlert ? (
            <div
              role="alert"
              className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-400/30 border-l-2 border-l-rose-400 bg-[#121212] px-3.5 py-2.5"
            >
              <p className="min-w-0 break-words text-xs font-medium text-amber-200">
                {crashAlert}
              </p>
              <button
                type="button"
                onClick={() => setCrashAlert(null)}
                className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <section aria-labelledby="visualizer-heading" className="mb-8">
            <h2 id="visualizer-heading" className="sr-only">
              Agent visualizer cards
            </h2>
            <AgentCardStack3D
              agents={agents}
              troubleshootActive={troubleshootActive}
            />
            {agents.length > 4 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {agents.slice(4).map((agent) => (
                  <AgentVisualizerCard key={agent.id} agent={agent} />
                ))}
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby="persona-heading"
            className="mb-6 w-full rounded-lg border border-white/5 bg-[#121212] p-3.5 sm:p-4"
          >
            <h2 id="persona-heading" className="sr-only">
              Agent personality templates
            </h2>
            <AgentPersonaSelector
              personaId={personaId}
              onPersonaChange={setPersonaId}
              customSystemPrompt={customSystemPrompt}
              onCustomSystemPromptChange={setCustomSystemPrompt}
              locked={personasLocked}
              isSuperAdmin={isSuperAdmin}
            />
          </section>

          <section
            aria-labelledby="split-heading"
            className="grid w-full items-start gap-4 lg:grid-cols-5 lg:gap-6"
          >
            <h2 id="split-heading" className="sr-only">
              Spawn controls and live terminal
            </h2>

            {/* Mobile/tablet: middle workspace behind a drawer trigger */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setWorkspaceOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/5 bg-[#121212] px-3 py-2.5 text-xs font-semibold text-emerald-400 transition hover:border-emerald-500/30"
                aria-expanded={workspaceOpen}
              >
                <PanelsTopLeft className="h-4 w-4" aria-hidden />
                Open workspace controls
              </button>
            </div>

            {workspaceOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
                aria-label="Close workspace overlay"
                onClick={() => setWorkspaceOpen(false)}
              />
            ) : null}

            <div
              className={`lg:col-span-2 ${
                workspaceOpen
                  ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-white/5 bg-[#121212] p-4 shadow-2xl lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
                  : "hidden lg:block"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
                <p className="font-display text-sm font-semibold text-white">
                  Workspace controls
                </p>
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen(false)}
                  className="rounded-lg border border-white/5 p-1.5 text-slate-muted hover:text-white"
                  aria-label="Close workspace controls"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <AgentSpawnPanel
                objective={objective}
                onObjectiveChange={handleObjectiveChange}
                connection={connection}
                overallProgress={overallProgress}
                onStart={handleStart}
                onStop={handleStop}
                onClear={handleClear}
                mountedPluginIds={mountedPluginIds}
                onMountedPluginIdsChange={setMountedPluginIds}
              />
              <McpManager />
              <HealerConsole
                onTroubleshootChange={setTroubleshootActive}
                onCrashAlert={setCrashAlert}
              />
            </div>
            <div className="w-full min-w-0 lg:col-span-3">
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
