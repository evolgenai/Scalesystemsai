"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Settings2,
  Target,
  Workflow,
  Headphones,
  type LucideIcon,
} from "lucide-react";

type AgentStatus = "deployed" | "paused";

type Agent = {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  icon: LucideIcon;
  iconColor: string;
  uptime: string;
  health: "healthy" | "degraded" | "offline";
  tasksToday: number;
  initialStatus: AgentStatus;
};

const AGENTS: Agent[] = [
  {
    id: "lead-sentinel",
    name: "Lead Qualification Sentinel",
    shortName: "Lead Sentinel",
    tagline: "Autonomous inbound revenue pipeline optimizer",
    icon: Target,
    iconColor: "text-cyan-accent",
    uptime: "99.97%",
    health: "healthy",
    tasksToday: 847,
    initialStatus: "deployed",
  },
  {
    id: "ops-orchestrator",
    name: "Enterprise Systems Orchestrator",
    shortName: "Systems Orchestrator",
    tagline: "Cross-platform data sync & workflow automation",
    icon: Workflow,
    iconColor: "text-purple-400",
    uptime: "99.91%",
    health: "healthy",
    tasksToday: 312,
    initialStatus: "deployed",
  },
  {
    id: "support-specialist",
    name: "24/7 Technical Support Specialist",
    shortName: "Support Specialist",
    tagline: "Context-aware L1 & L2 autonomous issue resolver",
    icon: Headphones,
    iconColor: "text-emerald-400",
    uptime: "99.84%",
    health: "degraded",
    tasksToday: 156,
    initialStatus: "paused",
  },
];

function healthStyles(health: Agent["health"], active: boolean) {
  if (!active) {
    return {
      dot: "bg-slate-500",
      text: "text-slate-500",
      label: "Offline",
      pulse: false,
    };
  }
  switch (health) {
    case "healthy":
      return {
        dot: "bg-emerald-400",
        text: "text-emerald-400",
        label: "Healthy",
        pulse: true,
      };
    case "degraded":
      return {
        dot: "bg-amber-400",
        text: "text-amber-400",
        label: "Degraded",
        pulse: true,
      };
    default:
      return {
        dot: "bg-rose-400",
        text: "text-rose-400",
        label: "Offline",
        pulse: false,
      };
  }
}

function AgentToggle({
  active,
  onChange,
  agentName,
}: {
  active: boolean;
  onChange: (value: boolean) => void;
  agentName: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? "Pause" : "Activate"} ${agentName}`}
      onClick={() => onChange(!active)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ${
        active
          ? "border-cyan-accent/50 bg-cyan-accent/20"
          : "border-white/10 bg-white/5"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`absolute top-0.5 h-5 w-5 rounded-full shadow-sm ${
          active ? "bg-cyan-accent" : "bg-slate-500"
        }`}
        style={{ left: active ? "22px" : "2px" }}
      />
    </button>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const [active, setActive] = useState(agent.initialStatus === "deployed");
  const [configOpen, setConfigOpen] = useState(false);
  const Icon = agent.icon;
  const health = healthStyles(agent.health, active);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
        active
          ? "border-cyan-accent/25 bg-white/[0.04] shadow-glow-sm"
          : "border-white/5 bg-black/20"
      }`}
    >
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl ${
          active ? "bg-cyan-accent/10" : "bg-purple-500/5"
        }`}
        aria-hidden
      />

      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-xl border border-white/10 bg-black/40 p-2.5 ${agent.iconColor}`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-white">
                {agent.shortName}
              </h3>
              <p className="mt-0.5 text-xs text-slate-dim line-clamp-1">
                {agent.tagline}
              </p>
            </div>
          </div>
          <AgentToggle
            active={active}
            onChange={setActive}
            agentName={agent.name}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-medium ${health.text}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${health.dot} ${health.pulse ? "animate-pulse" : ""}`}
            />
            {health.label}
          </span>
          <span className="text-[11px] text-slate-dim">
            Uptime:{" "}
            <span className="font-mono text-slate-muted">
              {active ? agent.uptime : "—"}
            </span>
          </span>
          <span className="text-[11px] text-slate-dim">
            Tasks today:{" "}
            <span className="font-mono text-cyan-accent">
              {active ? agent.tasksToday.toLocaleString() : "0"}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              active ? "text-cyan-accent" : "text-slate-dim"
            }`}
          >
            {active ? "Deployed" : "Paused"}
          </span>
          <button
            type="button"
            onClick={() => setConfigOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-muted transition-colors hover:border-cyan-accent/30 hover:text-cyan-accent"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            Configure
          </button>
        </div>

        <AnimatePresence>
          {configOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 rounded-lg border border-white/5 bg-black/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
                  Runtime Configuration
                </p>
                <div className="grid gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-dim">Instance ID</span>
                    <span className="font-mono text-slate-muted">
                      ss-{agent.id}-prod-01
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-dim">Region</span>
                    <span className="font-mono text-slate-muted">us-east-1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-dim">Memory</span>
                    <span className="font-mono text-slate-muted">8 GB</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

export default function AgentWorkforceGrid() {
  const deployedCount = AGENTS.filter(
    (a) => a.initialStatus === "deployed"
  ).length;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Active AI Workforce
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Manage deployed agents across your cloud runtime
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-muted sm:flex">
          <Bot className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
          {deployedCount} of {AGENTS.length} agents active
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}
