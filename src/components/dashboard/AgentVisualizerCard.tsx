"use client";

import type { AgentCardState, VisualizerStatus } from "@/lib/agents/streamProtocol";

const STATUS_STYLES: Record<
  VisualizerStatus,
  { label: string; ring: string; text: string; glow: string }
> = {
  IDLE: {
    label: "Idle",
    ring: "stroke-slate-500",
    text: "text-slate-400",
    glow: "border-white/10",
  },
  THINKING: {
    label: "Thinking",
    ring: "stroke-amber-400",
    text: "text-amber-300",
    glow: "border-amber-400/30",
  },
  EXECUTING: {
    label: "Executing",
    ring: "stroke-cyan-accent",
    text: "text-cyan-accent",
    glow: "border-cyan-accent/40",
  },
  SUCCESS: {
    label: "Success",
    ring: "stroke-emerald-400",
    text: "text-emerald-400",
    glow: "border-emerald-400/30",
  },
  ERROR: {
    label: "Error",
    ring: "stroke-rose-400",
    text: "text-rose-400",
    glow: "border-rose-400/30",
  },
};

function ProgressRing({
  progress,
  status,
}: {
  progress: number;
  status: VisualizerStatus;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, progress));
  const offset = circumference - (clamped / 100) * circumference;
  const style = STATUS_STYLES[status];

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 68 68" aria-hidden>
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-white/10"
        />
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className={`${style.ring} transition-all duration-500 ease-out`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold ${style.text}`}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

export default function AgentVisualizerCard({ agent }: { agent: AgentCardState }) {
  const style = STATUS_STYLES[agent.status];
  const isActive =
    agent.status === "THINKING" || agent.status === "EXECUTING";

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-slate-950/60 p-4 backdrop-blur-md transition-all duration-500 ease-out ${style.glow}`}
    >
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-500 ${
          isActive ? "opacity-40" : "opacity-0"
        } ${
          agent.status === "EXECUTING"
            ? "bg-cyan-accent"
            : agent.status === "THINKING"
              ? "bg-amber-400"
              : "bg-emerald-400"
        }`}
        aria-hidden
      />

      <div className="relative flex items-start gap-4">
        <ProgressRing progress={agent.progress} status={agent.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-white">
              {agent.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.text}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isActive ? "animate-pulse" : ""
                } ${
                  agent.status === "IDLE"
                    ? "bg-slate-500"
                    : agent.status === "THINKING"
                      ? "bg-amber-400"
                      : agent.status === "EXECUTING"
                        ? "bg-cyan-accent"
                        : agent.status === "SUCCESS"
                          ? "bg-emerald-400"
                          : "bg-rose-400"
                }`}
                aria-hidden
              />
              {style.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-dim">{agent.role}</p>
          <p className="mt-3 truncate font-mono text-[11px] text-slate-muted transition-all duration-500 ease-out">
            {agent.currentStage}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                agent.status === "ERROR"
                  ? "bg-rose-400"
                  : agent.status === "SUCCESS"
                    ? "bg-emerald-400"
                    : "bg-gradient-to-r from-cyan-accent to-blue-400"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, agent.progress))}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
