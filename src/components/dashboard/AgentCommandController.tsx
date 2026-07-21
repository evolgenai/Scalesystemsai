"use client";

import { useState } from "react";
import { Bot, Loader2, Zap } from "lucide-react";
import type { EngineTelemetryStatus } from "@/lib/agents/orchestratorEvents";

const DEFAULT_OBJECTIVE =
  "Synchronize enterprise CRM vectors and dispatch quota-aware autonomous agent tasks";

const STATUS_STYLES: Record<
  EngineTelemetryStatus,
  { badge: string; dot: string }
> = {
  IDLE: {
    badge: "border-white/10 bg-white/5 text-slate-muted",
    dot: "bg-slate-500",
  },
  PLANNING: {
    badge: "border-cyan-accent/30 bg-cyan-accent/10 text-cyan-accent",
    dot: "bg-cyan-accent",
  },
  EXECUTING: {
    badge:
      "border-blue-500/40 bg-blue-500/10 text-blue-400 shadow-[0_0_14px_rgba(0, 102, 255,0.35)]",
    dot: "bg-blue-400 shadow-[0_0_8px_rgba(0, 102, 255,0.9)]",
  },
  REFLECTING: {
    badge: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    dot: "bg-purple-400",
  },
};

type AgentCommandControllerProps = {
  engineStatus: EngineTelemetryStatus;
  onEngineStatusChange: (status: EngineTelemetryStatus) => void;
  quotaExhausted: boolean;
  onLaunchLog?: (message: string) => void;
};

export default function AgentCommandController({
  engineStatus,
  onEngineStatusChange,
  quotaExhausted,
  onLaunchLog,
}: AgentCommandControllerProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const statusStyle = STATUS_STYLES[engineStatus];

  const handleInitialize = async () => {
    if (quotaExhausted) {
      setLaunchError("Quota exhaustion active — cannot boot orchestrator loop.");
      return;
    }

    setIsLaunching(true);
    setLaunchError(null);
    onEngineStatusChange("PLANNING");

    try {
      const response = await fetch("/api/v1/agents/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: DEFAULT_OBJECTIVE }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        engineStatus?: EngineTelemetryStatus;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to initialize agent loop.");
      }

      onEngineStatusChange(payload.engineStatus ?? "PLANNING");
      onLaunchLog?.(
        `${new Date().toLocaleTimeString("en-US", { hour12: false })} [SYSTEM_NODE] Autonomous agent loop dispatched — objective pipeline booting.`
      );
    } catch (error) {
      onEngineStatusChange("IDLE");
      setLaunchError(
        error instanceof Error ? error.message : "Launch request failed."
      );
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Agent Command Controller
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Administrative launcher for the ScaleAgentOrchestrator lifecycle
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${statusStyle.badge}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${statusStyle.dot} ${engineStatus === "EXECUTING" ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {engineStatus}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
        <div className="border-b border-white/10 bg-black/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-cyan-accent" aria-hidden />
            <span className="text-sm font-medium text-white">
              Autonomous Loop Control
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-dim">
            Triggers POST → orchestrator initialize → plan → execute → reflect
          </p>
        </div>

        <div className="space-y-4 p-5">
          <button
            type="button"
            onClick={handleInitialize}
            disabled={isLaunching || quotaExhausted}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-accent px-5 py-3 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isLaunching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Booting orchestrator...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" aria-hidden />
                Initialize Autonomous Agent Loop
              </>
            )}
          </button>

          {launchError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {launchError}
            </p>
          )}

          {quotaExhausted && (
            <p className="text-xs text-amber-400">
              Quota simulation is active. Disable it in the Quota Manager to launch
              agents.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
