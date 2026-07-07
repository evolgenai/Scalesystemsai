"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Bell,
  UserCircle,
  Server,
  CircleDot,
} from "lucide-react";
import MetricsOverview from "@/components/dashboard/MetricsOverview";
import AgentWorkforceGrid from "@/components/dashboard/AgentWorkforceGrid";
import LiveIntegrationFeed from "@/components/dashboard/LiveIntegrationFeed";
import ApiKeyPortal from "@/components/dashboard/ApiKeyPortal";
import { AGENTS, INITIAL_AGENT_STATES } from "@/components/dashboard/agentConfig";
import type { AgentId, AgentStates, FeedEntry } from "@/components/dashboard/types";

function formatFeedTimestamp(date = new Date()) {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildAgentToggleLog(agentName: string, active: boolean): FeedEntry {
  const message = active
    ? `Initializing LangGraph cluster for ${agentName}...`
    : `Terminating inference loops for ${agentName} - State: PAUSED`;

  return {
    id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agent: "SYSTEM_NODE",
    message,
    timestamp: formatFeedTimestamp(),
    tone: active ? "system" : "amber",
  };
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [agentStates, setAgentStates] = useState<AgentStates>(INITIAL_AGENT_STATES);
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const appendFeedEntry = useCallback((entry: FeedEntry) => {
    setFeedEntries((prev) => [...prev.slice(-24), entry]);
  }, []);

  const handleAgentToggle = useCallback(
    (agentId: AgentId, active: boolean) => {
      const agent = AGENTS.find((a) => a.id === agentId);
      if (!agent) return;

      setAgentStates((prev) => ({ ...prev, [agentId]: active }));
      appendFeedEntry(buildAgentToggleLog(agent.name, active));
    },
    [appendFeedEntry]
  );

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
                Monitor your rented ScaleSystems AI employees, track live
                execution streams, and manage cloud runtime integrations from a
                single enterprise control plane.
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
              <CircleDot className="h-3.5 w-3.5 text-emerald-400 animate-pulse" aria-hidden />
              {activeAgentCount > 0
                ? `${activeAgentCount} agent${activeAgentCount === 1 ? "" : "s"} operational`
                : "All agents paused"}
            </div>
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
            <span className="text-xs text-slate-dim">
              Billing cycle resets in{" "}
              <span className="font-mono text-slate-muted">12d 4h</span>
            </span>
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
            <span className="text-xs text-slate-dim">
              Events logged:{" "}
              <span className="font-mono text-cyan-accent">{feedEntries.length}</span>
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

          <div className="grid gap-10 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <LiveIntegrationFeed
                mounted={mounted}
                entries={feedEntries}
                onAppendEntry={appendFeedEntry}
                agentStates={agentStates}
              />
            </div>
            <div className="xl:col-span-2">
              <ApiKeyPortal />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
