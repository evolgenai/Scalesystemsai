"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, CheckCircle2, PenLine, Shield } from "lucide-react";
import type { AgentCardState } from "@/lib/agents/streamProtocol";
import type { SelfRefiningLoopState } from "@/lib/agents/streamProtocol";

export type OrchestratorFeedProps = {
  agents: AgentCardState[];
  selfRefiningLoop: SelfRefiningLoopState;
};

const VALIDATOR_ID = "validator-agent";
const WRITER_ID = "writer-agent";

function agentTone(
  id: string,
  agents: AgentCardState[],
  loopActive: boolean,
  passed: boolean
): string {
  const match = agents.find((agent) => agent.id === id);
  const status = match?.status;

  if (passed) return "border-emerald-400/45 bg-emerald-400/10 text-emerald-200";
  if (loopActive) {
    if (id === VALIDATOR_ID || status === "THINKING") {
      return "border-amber-400/40 bg-amber-400/10 text-amber-100";
    }
    if (id === WRITER_ID || status === "EXECUTING") {
      return "border-cyan-accent/35 bg-cyan-accent/10 text-cyan-100";
    }
  }

  if (status === "SUCCESS") {
    return "border-emerald-400/35 bg-emerald-400/8 text-emerald-200";
  }
  if (status === "ERROR") {
    return "border-rose-400/35 bg-rose-400/8 text-rose-200";
  }

  return "border-white/10 bg-white/[0.03] text-slate-200";
}

function AgentNode({
  label,
  subtitle,
  icon: Icon,
  tone,
  pulse,
}: {
  label: string;
  subtitle: string;
  icon: typeof Shield;
  tone: string;
  pulse?: boolean;
}) {
  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col items-center rounded-xl border px-3 py-3 transition-colors duration-500 ${tone}`}
    >
      {pulse ? (
        <span
          className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-amber-400/30 animate-pulse"
          aria-hidden
        />
      ) : null}
      <Icon className="mb-2 h-4 w-4" aria-hidden />
      <p className="text-center text-xs font-semibold">{label}</p>
      <p className="mt-0.5 text-center font-mono text-[10px] opacity-70">
        {subtitle}
      </p>
    </div>
  );
}

export default function OrchestratorFeed({
  agents,
  selfRefiningLoop,
}: OrchestratorFeedProps) {
  const { phase, attempt, maxAttempts } = selfRefiningLoop;
  const cycling = phase === "cycling";
  const passed = phase === "passed";
  const loopActive = cycling || passed;
  const [visualAttempt, setVisualAttempt] = useState(attempt);

  useEffect(() => {
    if (!cycling) {
      setVisualAttempt(attempt);
      return;
    }

    setVisualAttempt(Math.max(attempt, 1));
    const timer = window.setInterval(() => {
      setVisualAttempt((prev) => (prev >= maxAttempts ? 1 : prev + 1));
    }, 3400);

    return () => window.clearInterval(timer);
  }, [cycling, attempt, maxAttempts]);

  const writerAgent = agents.find((agent) => agent.id === "code-architect");
  const orchestrator = agents.find((agent) => agent.id === "ops-orchestrator");

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 backdrop-blur-md">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-cyan-accent" aria-hidden />
          <h2 className="font-display text-sm font-semibold text-white">
            Orchestrator Feed
          </h2>
        </div>
        {orchestrator ? (
          <span className="font-mono text-[10px] text-slate-dim">
            {orchestrator.currentStage}
          </span>
        ) : null}
      </header>

      <div className="space-y-4 p-4">
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <AgentNode
            label="Validator Agent"
            subtitle="tsc gatekeeper"
            icon={Shield}
            tone={agentTone(VALIDATOR_ID, agents, cycling, passed)}
            pulse={cycling}
          />

          <div className="relative flex h-16 w-14 shrink-0 items-center justify-center">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 56 64"
              aria-hidden
            >
              <motion.path
                d="M 6 32 C 18 10, 38 10, 50 32 C 38 54, 18 54, 6 32"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                initial={false}
                animate={{
                  stroke: passed
                    ? "rgba(52, 211, 153, 0.85)"
                    : cycling
                      ? "rgba(251, 191, 36, 0.85)"
                      : "rgba(148, 163, 184, 0.35)",
                  opacity: loopActive ? 1 : 0.55,
                }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
              {cycling ? (
                <motion.circle
                  r="3"
                  fill="rgb(251, 191, 36)"
                  animate={{
                    cx: [6, 28, 50, 28, 6],
                    cy: [32, 14, 32, 50, 32],
                  }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              ) : null}
              {passed ? (
                <circle
                  cx="28"
                  cy="32"
                  r="4"
                  fill="rgb(52, 211, 153)"
                  className="drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                />
              ) : null}
            </svg>
          </div>

          <AgentNode
            label="Writer Agent"
            subtitle={writerAgent?.name ?? "CodeArchitect"}
            icon={PenLine}
            tone={agentTone(WRITER_ID, agents, cycling, passed)}
            pulse={cycling}
          />
        </div>

        <div
          className={`rounded-xl border px-3 py-2.5 text-center transition-colors duration-500 ${
            passed
              ? "border-emerald-400/30 bg-emerald-400/10"
              : cycling
                ? "border-amber-400/30 bg-amber-400/10"
                : "border-white/10 bg-black/25"
          }`}
        >
          {passed ? (
            <p className="inline-flex items-center justify-center gap-2 font-mono text-[11px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Sandbox compilation passed — loop resolved
            </p>
          ) : cycling ? (
            <p className="animate-pulse font-mono text-[11px] text-amber-300">
              Self-Refining Loop (Attempt {visualAttempt}/{maxAttempts})
            </p>
          ) : (
            <p className="font-mono text-[11px] text-slate-dim">
              Awaiting validator ↔ writer refinement cycle
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
