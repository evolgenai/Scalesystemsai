"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Terminal } from "lucide-react";
import type { SelfRefiningLoopPhase } from "@/lib/agents/streamProtocol";

export type SandboxTerminalProps = {
  active: boolean;
  attempt: number;
  maxAttempts: number;
  phase: SelfRefiningLoopPhase;
};

type TerminalLine = {
  id: string;
  text: string;
  tone: "default" | "error" | "success" | "dim";
};

function scriptForAttempt(
  attempt: number,
  maxAttempts: number,
  phase: SelfRefiningLoopPhase
): TerminalLine[] {
  const capped = Math.min(Math.max(attempt, 1), maxAttempts);
  const lines: TerminalLine[] = [
    {
      id: "boot",
      text: "[Sandbox] MicroVM booting isolated compiler partition…",
      tone: "dim",
    },
    {
      id: "tsc",
      text: `[Sandbox] Running npx tsc --noEmit (attempt ${capped}/${maxAttempts})…`,
      tone: "default",
    },
  ];

  if (phase === "passed") {
    lines.push({
      id: "pass",
      text: "[Sandbox] ✅ Compilation passed — 0 errors",
      tone: "success",
    });
    lines.push({
      id: "heal-done",
      text: "[Healer] Auto-heal cycle complete — promoting artifact to swarm.",
      tone: "success",
    });
    return lines;
  }

  if (capped === 1) {
    lines.push({
      id: "fail",
      text: "[Sandbox] ❌ Compilation Failed: SyntaxError near line 14",
      tone: "error",
    });
  } else if (capped === 2) {
    lines.push({
      id: "fail",
      text: "[Sandbox] ❌ Compilation Failed: Type 'string' is not assignable to type 'number' (line 22)",
      tone: "error",
    });
  } else {
    lines.push({
      id: "fail",
      text: "[Sandbox] ❌ Compilation Failed: Cannot find name 'payloadSchema' (line 8)",
      tone: "error",
    });
  }

  lines.push({
    id: "heal",
    text: "[Healer] Scheduling Writer patch and re-running sandbox gate…",
    tone: "dim",
  });

  return lines;
}

function toneClass(tone: TerminalLine["tone"]): string {
  switch (tone) {
    case "error":
      return "text-rose-300";
    case "success":
      return "text-emerald-300";
    case "dim":
      return "text-emerald-500/55";
    default:
      return "text-emerald-200/90";
  }
}

export default function SandboxTerminal({
  active,
  attempt,
  maxAttempts,
  phase,
}: SandboxTerminalProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const script = useMemo(
    () => scriptForAttempt(attempt, maxAttempts, phase),
    [attempt, maxAttempts, phase]
  );

  useEffect(() => {
    if (!active) {
      setVisibleCount(0);
      return;
    }

    setVisibleCount(0);
    let index = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const revealNext = () => {
      index += 1;
      setVisibleCount(index);
      if (index < script.length) {
        timers.push(setTimeout(revealNext, index === 1 ? 420 : 680));
      }
    };

    timers.push(setTimeout(revealNext, 280));
    return () => timers.forEach(clearTimeout);
  }, [active, script]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [visibleCount]);

  const isStreaming = active && visibleCount < script.length;
  const visibleLines = script.slice(0, visibleCount);

  return (
    <div
      className="overflow-hidden rounded-xl border border-emerald-400/20 bg-[#040806]"
      role="log"
      aria-live="polite"
      aria-label="Sandbox compilation terminal"
    >
      <div className="flex items-center justify-between gap-2 border-b border-emerald-400/15 bg-black/45 px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300/90">
            MicroVM Sandbox
          </span>
        </div>
        {isStreaming ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-cyan-accent">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            streaming
          </span>
        ) : phase === "passed" ? (
          <span className="font-mono text-[10px] uppercase text-emerald-300">
            verified
          </span>
        ) : active ? (
          <span className="font-mono text-[10px] uppercase text-amber-300">
            compiling
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase text-slate-dim">
            standby
          </span>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="terminal-scroll max-h-44 space-y-1 overflow-y-auto px-3 py-2.5"
      >
        {!active && visibleLines.length === 0 ? (
          <p className="font-mono text-[11px] text-emerald-500/45">
            $ awaiting auto-heal cycle…
          </p>
        ) : null}
        {visibleLines.map((line) => (
          <p
            key={line.id}
            className={`whitespace-pre-wrap font-mono text-[11px] leading-relaxed ${toneClass(line.tone)}`}
          >
            {line.text}
          </p>
        ))}
        {isStreaming ? (
          <p className="animate-pulse font-mono text-[11px] text-emerald-400/70">
            ▌
          </p>
        ) : null}
      </div>
    </div>
  );
}
