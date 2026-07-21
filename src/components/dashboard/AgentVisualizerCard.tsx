"use client";

import type { AgentCardState, VisualizerStatus } from "@/lib/agents/streamProtocol";

const STATUS_STYLES: Record<
  VisualizerStatus,
  { label: string; bar: string; text: string; ring: string }
> = {
  IDLE: {
    label: "Idle",
    bar: "bg-slate-500",
    text: "text-slate-400",
    ring: "stroke-slate-500",
  },
  THINKING: {
    label: "Thinking",
    bar: "bg-amber-400",
    text: "text-amber-300",
    ring: "stroke-amber-400",
  },
  EXECUTING: {
    label: "Executing",
    bar: "bg-blue-400",
    text: "text-blue-400",
    ring: "stroke-blue-400",
  },
  SUCCESS: {
    label: "Success",
    bar: "bg-blue-400",
    text: "text-blue-400",
    ring: "stroke-blue-400",
  },
  ERROR: {
    label: "Error",
    bar: "bg-rose-400",
    text: "text-rose-400",
    ring: "stroke-rose-400",
  },
};

function ProgressRing({
  progress,
  status,
}: {
  progress: number;
  status: VisualizerStatus;
}) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, progress));
  const offset = circumference - (clamped / 100) * circumference;
  const style = STATUS_STYLES[status];

  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg className="h-11 w-11 -rotate-90" viewBox="0 0 52 52" aria-hidden>
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          className="stroke-white/10"
        />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className={`${style.ring} transition-all duration-500 ease-out`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold ${style.text}`}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

export default function AgentVisualizerCard({
  agent,
  compact = false,
}: {
  agent: AgentCardState;
  compact?: boolean;
}) {
  const style = STATUS_STYLES[agent.status];
  const isActive =
    agent.status === "THINKING" || agent.status === "EXECUTING";

  return (
    <article
      className={`relative overflow-hidden rounded-lg border border-white/5 bg-[#121212] transition-colors duration-300 ${
        isActive ? "border-l-2 border-l-blue-400" : ""
      } ${compact ? "p-3" : "p-3.5"}`}
    >
      <div className="relative flex items-start gap-3">
        <ProgressRing progress={agent.progress} status={agent.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="break-words text-sm font-semibold leading-snug text-white">
              {agent.name}
            </h3>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide ${style.text}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isActive ? "animate-pulse" : ""
                } ${style.bar}`}
                aria-hidden
              />
              {style.label}
            </span>
          </div>
          <p className="mt-0.5 break-words text-xs text-slate-dim">{agent.role}</p>
          {!compact ? (
            <>
              <p className="mt-2 truncate font-mono text-[11px] text-slate-muted">
                {agent.currentStage}
              </p>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${style.bar}`}
                  style={{
                    width: `${Math.min(100, Math.max(0, agent.progress))}%`,
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
