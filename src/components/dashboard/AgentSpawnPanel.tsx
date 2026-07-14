"use client";

import { Play, Square, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { StreamConnectionState } from "@/lib/agents/useAgentStream";

type AgentSpawnPanelProps = {
  objective: string;
  onObjectiveChange: (value: string) => void;
  connection: StreamConnectionState;
  overallProgress: number;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
};

const CONNECTION_LABEL: Record<StreamConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  live: "Live",
  error: "Error",
  closed: "Closed",
};

export default function AgentSpawnPanel({
  objective,
  onObjectiveChange,
  connection,
  overallProgress,
  onStart,
  onStop,
  onClear,
}: AgentSpawnPanelProps) {
  const isLive = connection === "live" || connection === "connecting";

  return (
    <section className="flex h-[500px] max-h-[600px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 backdrop-blur-md">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
        <SlidersHorizontal className="h-4 w-4 text-cyan-accent" aria-hidden />
        <h2 className="font-display text-sm font-semibold text-white">
          Swarm Parameters
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div>
          <label
            htmlFor="swarm-objective"
            className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-dim"
          >
            Objective
          </label>
          <textarea
            id="swarm-objective"
            value={objective}
            onChange={(e) => onObjectiveChange(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-slate-200 outline-none transition-all duration-500 ease-out placeholder:text-slate-600 focus:border-cyan-accent/40 focus:ring-1 focus:ring-cyan-accent/20"
            placeholder="Describe the workforce objective…"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wider text-slate-dim">
              Workflow progress
            </span>
            <span className="font-mono text-cyan-accent">
              {Math.round(overallProgress)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-accent to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-dim">
            Stream status
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-white">
            <span
              className={`h-2 w-2 rounded-full ${
                connection === "live"
                  ? "animate-pulse bg-emerald-400"
                  : connection === "error"
                    ? "bg-rose-400"
                    : connection === "connecting"
                      ? "animate-pulse bg-amber-400"
                      : "bg-slate-500"
              }`}
              aria-hidden
            />
            {CONNECTION_LABEL[connection]}
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-dim">
            GET /api/agents/stream?objective=…
          </p>
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={isLive}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-3 py-2.5 text-xs font-semibold text-cyan-accent transition-all duration-500 ease-out hover:bg-cyan-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Launch swarm
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={!isLive}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-muted transition-all duration-500 ease-out hover:border-rose-400/30 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
            Stop
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-muted transition-all duration-500 ease-out hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
