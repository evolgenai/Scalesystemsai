"use client";

import { useEffect, useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import SandboxTerminal from "@/components/dashboard/SandboxTerminal";
import type { SelfRefiningLoopState } from "@/lib/agents/streamProtocol";

export type HealerConsoleProps = {
  selfRefiningLoop: SelfRefiningLoopState;
};

export default function HealerConsole({ selfRefiningLoop }: HealerConsoleProps) {
  const { phase, attempt, maxAttempts } = selfRefiningLoop;
  const healing = phase === "cycling";
  const passed = phase === "passed";
  const active = healing || passed;
  const [visualAttempt, setVisualAttempt] = useState(attempt);

  useEffect(() => {
    if (!healing) {
      setVisualAttempt(Math.max(attempt, passed ? attempt : 0));
      return;
    }

    setVisualAttempt(Math.max(attempt, 1));
    const timer = window.setInterval(() => {
      setVisualAttempt((prev) => (prev >= maxAttempts ? 1 : prev + 1));
    }, 3400);

    return () => window.clearInterval(timer);
  }, [healing, passed, attempt, maxAttempts]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 backdrop-blur-md">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
          <h2 className="font-display text-sm font-semibold text-white">
            Healer Console
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${
            passed
              ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
              : healing
                ? "border-amber-400/35 bg-amber-400/10 text-amber-300"
                : "border-white/10 bg-white/[0.03] text-slate-dim"
          }`}
        >
          <Activity
            className={`h-3 w-3 ${healing ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {passed
            ? "Sandbox verified"
            : healing
              ? `Auto-heal ${visualAttempt}/${maxAttempts}`
              : "Standby"}
        </span>
      </header>

      <div className="space-y-3 p-4">
        <p className="text-[11px] leading-relaxed text-slate-muted">
          Compiler sandbox gate for self-refining swarm patches. Streams
          MicroVM telemetry while the healer re-validates Writer output.
        </p>
        <SandboxTerminal
          active={active}
          attempt={Math.max(visualAttempt, 1)}
          maxAttempts={maxAttempts}
          phase={phase}
        />
      </div>
    </section>
  );
}
