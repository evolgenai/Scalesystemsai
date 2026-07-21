"use client";

import {
  Bug,
  CheckCircle2,
  Layers,
  Loader2,
  Play,
  Rocket,
  Save,
  X,
} from "lucide-react";
import type { ExecutionLogEntry, RunnerState } from "@/components/builder/types";

type CanvasRunnerProps = {
  runner: RunnerState;
  debuggerOpen: boolean;
  onToggleDebugger: () => void;
  onRunSimulation: () => void;
  onDeploy: () => void;
  onSave: () => void;
  busy: boolean;
  paletteOpen: boolean;
  onTogglePalette: () => void;
};

function statusLabel(status: RunnerState["status"]): string {
  switch (status) {
    case "simulating":
      return "Simulation running";
    case "paused":
      return "Paused · HITL";
    case "deploying":
      return "Deploying workflow";
    case "saved":
      return "Blueprint saved";
    default:
      return "Ready";
  }
}

function LogRow({ entry }: { entry: ExecutionLogEntry }) {
  return (
    <li className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-white">
          {entry.label}
        </p>
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider ${
            entry.status === "running"
              ? "text-emerald-400"
              : entry.status === "paused"
                ? "text-amber-300"
                : entry.status === "error"
                  ? "text-rose-300"
                  : "text-slate-dim"
          }`}
        >
          {entry.status}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-[10px] text-slate-muted">
        {entry.message}
      </p>
    </li>
  );
}

export default function CanvasRunner({
  runner,
  debuggerOpen,
  onToggleDebugger,
  onRunSimulation,
  onDeploy,
  onSave,
  busy,
  paletteOpen,
  onTogglePalette,
}: CanvasRunnerProps) {
  return (
    <>
      <header className="relative z-30 flex flex-wrap items-center gap-2 border-b border-white/5 bg-[#040907]/95 px-3 py-2.5 backdrop-blur-xl sm:px-4">
        <button
          type="button"
          onClick={onTogglePalette}
          aria-expanded={paletteOpen}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
            paletteOpen
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
              : "border-white/10 bg-white/[0.03] text-emerald-400 hover:border-emerald-500/40"
          }`}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          {paletteOpen ? "Palette" : "Palette / Templates"}
        </button>

        <div className="mr-auto min-w-0 pl-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            Execution control
          </p>
          <p className="truncate text-sm font-semibold text-white">
            Runner deck · {statusLabel(runner.status)}
          </p>
        </div>

        <button
          type="button"
          onClick={onRunSimulation}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-40"
        >
          {runner.status === "simulating" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden />
          )}
          Run Simulation
        </button>
        <button
          type="button"
          onClick={onDeploy}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-accent/35 bg-cyan-accent/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-accent transition hover:bg-cyan-accent/20 disabled:opacity-40"
        >
          {runner.status === "deploying" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Rocket className="h-3.5 w-3.5" aria-hidden />
          )}
          Deploy Workflow
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-emerald-500/30 disabled:opacity-40"
        >
          {runner.status === "saved" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden />
          )}
          Save Blueprint
        </button>
        <button
          type="button"
          onClick={onToggleDebugger}
          aria-expanded={debuggerOpen}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
            debuggerOpen
              ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
              : "border-white/10 bg-white/[0.03] text-slate-muted hover:text-white"
          }`}
        >
          <Bug className="h-3.5 w-3.5" aria-hidden />
          Debugger
        </button>
      </header>

      <aside
        className={`absolute inset-y-0 right-0 z-20 flex w-[min(20rem,90vw)] flex-col border-l border-white/5 bg-[#040907]/95 pt-[52px] backdrop-blur-xl transition-transform duration-300 ${
          debuggerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Execution debugger"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
              Live debugger
            </p>
            <p className="text-sm font-semibold text-white">
              Sequential task trace
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleDebugger}
            className="rounded-lg border border-white/10 p-1.5 text-slate-muted hover:text-white"
            aria-label="Close debugger"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-muted">
            <span
              className={`h-2 w-2 rounded-full ${
                runner.activeNodeId
                  ? runner.status === "paused"
                    ? "animate-pulse bg-amber-400"
                    : "animate-pulse bg-emerald-400"
                  : "bg-slate-600"
              }`}
            />
            Active node{" "}
            <span className="font-mono text-emerald-400">
              {runner.activeNodeId ?? "—"}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-dim">
            Completed{" "}
            <span className="font-mono text-cyan-accent">
              {runner.completedNodeIds.length}
            </span>
          </p>
        </div>

        <ul className="terminal-scroll flex-1 space-y-2 overflow-y-auto p-3">
          {runner.logs.length === 0 ? (
            <li className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-slate-dim">
              Run a simulation to stream node execution here.
            </li>
          ) : (
            runner.logs.map((entry) => <LogRow key={entry.id} entry={entry} />)
          )}
        </ul>
      </aside>
    </>
  );
}
