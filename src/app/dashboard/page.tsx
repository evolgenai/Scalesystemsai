"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Bell,
  UserCircle,
  Server,
  CircleDot,
  Terminal,
  Radio,
} from "lucide-react";
import MetricsOverview from "@/components/dashboard/MetricsOverview";
import AgentWorkforceGrid from "@/components/dashboard/AgentWorkforceGrid";
import ApiKeyPortal from "@/components/dashboard/ApiKeyPortal";
import ApiKeyManagementPanel from "@/components/dashboard/ApiKeyManagementPanel";
import QuotaManager from "@/components/dashboard/QuotaManager";
import AgentCommandController from "@/components/dashboard/AgentCommandController";
import AgentInteractiveChat from "@/components/dashboard/AgentInteractiveChat";
import FleetController from "@/components/dashboard/FleetController";
import type { EngineTelemetryStatus } from "@/lib/agents/orchestratorEvents";
import { AGENTS, INITIAL_AGENT_STATES } from "@/components/dashboard/agentConfig";
import type { AgentId, AgentStates } from "@/components/dashboard/types";

const QUOTA_REFUSED_MESSAGE =
  "🛑 [CRITICAL] Connection Refused: HTTP 429 — System Quota Exhausted.";

function parseStreamPayload(raw: string): {
  text: string;
  engineStatus?: EngineTelemetryStatus;
} {
  try {
    const payload = JSON.parse(raw) as {
      message?: string;
      narrative?: string;
      engineStatus?: EngineTelemetryStatus;
    };
    const text =
      typeof payload.narrative === "string" && payload.narrative.trim()
        ? payload.narrative
        : typeof payload.message === "string" && payload.message.trim()
          ? payload.message
          : raw;
    return { text, engineStatus: payload.engineStatus };
  } catch {
    return { text: raw };
  }
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [agentStates, setAgentStates] = useState<AgentStates>(INITIAL_AGENT_STATES);
  const [events, setEvents] = useState<string[]>([]);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [streamBlocked, setStreamBlocked] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineTelemetryStatus>("IDLE");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    void fetch("/api/v1/user/profile")
      .then((response) => response.json())
      .then((data: { isSuperAdmin?: boolean }) =>
        setIsSuperAdmin(data.isSuperAdmin === true)
      )
      .catch(() => setIsSuperAdmin(false));
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let eventSource: EventSource | null = null;
    let cancelled = false;

    const streamUrl = quotaExhausted
      ? "/api/v1/agents/stream?quotaExceeded=1"
      : "/api/v1/agents/stream";

    const connectStream = async () => {
      if (quotaExhausted && !isSuperAdmin) {
        const response = await fetch(streamUrl);

        if (cancelled) return;

        if (response.status === 429) {
          setStreamBlocked(true);
          setEvents((prev) => {
            if (prev.includes(QUOTA_REFUSED_MESSAGE)) return prev;
            return [...prev.slice(-49), QUOTA_REFUSED_MESSAGE];
          });
          return;
        }
      }

      if (cancelled) return;

      setStreamBlocked(false);
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        const { text, engineStatus: status } = parseStreamPayload(event.data);
        if (status) setEngineStatus(status);
        setEvents((prev) => [...prev.slice(-49), text]);
      };

      eventSource.onerror = () => {
        if (quotaExhausted && !isSuperAdmin) {
          setStreamBlocked(true);
          setEvents((prev) => {
            if (prev.includes(QUOTA_REFUSED_MESSAGE)) return prev;
            return [...prev.slice(-49), QUOTA_REFUSED_MESSAGE];
          });
          eventSource?.close();
          return;
        }

        setEvents((prev) => [
          ...prev.slice(-49),
          `${new Date().toLocaleTimeString("en-US", { hour12: false })} [SYSTEM_NODE] Stream reconnecting...`,
        ]);
      };
    };

    void connectStream();

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, [mounted, quotaExhausted, isSuperAdmin]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [events]);

  const handleAgentToggle = useCallback((agentId: AgentId, active: boolean) => {
    const agent = AGENTS.find((a) => a.id === agentId);
    if (!agent) return;

    setAgentStates((prev) => ({ ...prev, [agentId]: active }));
    setEvents((prev) => [
      ...prev.slice(-49),
      `${new Date().toLocaleTimeString("en-US", { hour12: false })} [SYSTEM_NODE] ${
        active
          ? `Initializing LangGraph cluster for ${agent.name}...`
          : `Terminating inference loops for ${agent.name} — State: PAUSED`
      }`,
    ]);
  }, []);

  const activeAgentCount = Object.values(agentStates).filter(Boolean).length;

  return (
    <main className="relative min-h-screen bg-obsidian text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute right-0 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/[0.04] blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[600px] rounded-full bg-purple-500/[0.05] blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
                <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
                Client Agent Dashboard
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Workforce <span className="text-gradient">Command Center</span>
              </h1>
              <p className="max-w-2xl text-sm text-slate-muted sm:text-base">
                Monitor your rented ScaleSystems AI employees and live SSE execution
                streams from a single enterprise control plane.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-muted sm:flex">
                <Server className="h-4 w-4 text-purple-400" aria-hidden />
                <span>
                  Runtime:{" "}
                  <span className="font-mono text-emerald-400">us-east-1</span>
                </span>
              </div>
              <button
                type="button"
                className="relative rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-slate-muted transition-colors hover:border-cyan-accent/30 hover:text-cyan-accent"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cyan-accent" />
              </button>
              <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <UserCircle className="h-8 w-8 text-slate-dim" aria-hidden />
                <div className="hidden sm:block">
                  <p className="text-xs font-medium text-white">Acme Corp</p>
                  <p className="text-[10px] text-slate-dim">Enterprise Plan</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-white/5 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-muted">
              <CircleDot className="h-3.5 w-3.5 animate-pulse text-emerald-400" aria-hidden />
              {activeAgentCount > 0
                ? `${activeAgentCount} agent${activeAgentCount === 1 ? "" : "s"} operational`
                : "All agents paused"}
            </div>
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
            <span className="text-xs text-slate-dim">
              SSE events:{" "}
              <span className="font-mono text-cyan-accent">{events.length}</span>
            </span>
          </div>
        </motion.header>

        <div className="space-y-10">
          <section aria-labelledby="metrics-heading">
            <h2 id="metrics-heading" className="sr-only">
              Metrics Overview
            </h2>
            <MetricsOverview />
          </section>

          <AgentWorkforceGrid
            agentStates={agentStates}
            onAgentToggle={handleAgentToggle}
          />

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">
                  Live Agent Terminal
                </h2>
                <p className="mt-1 text-sm text-slate-muted">
                  Real-time SSE stream from{" "}
                  <span className="font-mono text-cyan-accent/80">
                    /api/v1/agents/stream
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
                <Radio
                  className={`h-3 w-3 ${streamBlocked ? "text-amber-400" : "animate-pulse text-emerald-400"}`}
                  aria-hidden
                />
                <span
                  className={`text-[11px] font-medium ${streamBlocked ? "text-amber-400" : "text-emerald-400"}`}
                >
                  {streamBlocked ? "Blocked" : "Live"}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050507] shadow-[0_0_30px_rgba(0,242,254,0.04)]">
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d0d11] px-4 py-3">
                <Terminal className="h-4 w-4 text-cyan-accent" aria-hidden />
                <span className="font-mono text-xs text-slate-muted">
                  runtime-sse-worker-stream
                </span>
              </div>

              <div
                ref={terminalRef}
                className="h-64 overflow-y-auto p-4 font-mono text-xs sm:h-72 sm:text-sm"
              >
                {!mounted || events.length === 0 ? (
                  <p className="animate-pulse text-slate-dim">
                    {mounted
                      ? "Awaiting SSE worker heartbeat..."
                      : "Loading console node..."}
                  </p>
                ) : (
                  events.map((line, index) => {
                    const isLatest = index === events.length - 1;
                    const isQuotaAlert = line === QUOTA_REFUSED_MESSAGE;
                    return (
                      <div
                        key={`${line}-${index}`}
                        className="mb-2 flex items-start gap-2 leading-relaxed"
                      >
                        {isLatest ? (
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              isQuotaAlert
                                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
                                : "bg-cyan-accent shadow-[0_0_8px_rgba(0,242,254,0.9)]"
                            }`}
                            aria-hidden
                          />
                        ) : (
                          <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden />
                        )}
                        <span
                          className={
                            isQuotaAlert
                              ? "font-semibold text-amber-400"
                              : isLatest
                                ? "text-cyan-accent"
                                : "text-slate-300"
                          }
                        >
                          {line}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <QuotaManager
            quotaExhausted={quotaExhausted}
            onQuotaExhaustedChange={setQuotaExhausted}
          />

          <FleetController
            isSuperAdmin={isSuperAdmin}
            onDeployLog={(message) =>
              setEvents((prev) => [...prev.slice(-49), message])
            }
          />

          <AgentCommandController
            engineStatus={engineStatus}
            onEngineStatusChange={setEngineStatus}
            quotaExhausted={quotaExhausted}
            onLaunchLog={(message) =>
              setEvents((prev) => [...prev.slice(-49), message])
            }
          />

          <AgentInteractiveChat
            engineStatus={engineStatus}
            onEngineStatusChange={setEngineStatus}
            quotaExhausted={quotaExhausted}
            telemetryEvents={events}
          />

          <ApiKeyManagementPanel />
          <ApiKeyPortal />
        </div>
      </div>
    </main>
  );
}
