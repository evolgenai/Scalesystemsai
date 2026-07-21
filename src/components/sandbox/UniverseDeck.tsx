"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import VirtualTerminal from "@/components/terminal/VirtualTerminal";
import type { MatrixTelemetryLine } from "@/components/spatial/HackerMatrixCanvas";

const HackerMatrixCanvas = dynamic(
  () => import("@/components/spatial/HackerMatrixCanvas"),
  {
    ssr: false,
    loading: () => (
      <div
        className="glass-panel flex min-h-[420px] animate-pulse items-center justify-center sm:min-h-[480px] lg:min-h-[560px]"
        aria-busy
        aria-label="Loading cyber-hacker matrix"
      >
        <span className="font-mono text-xs text-slate-dim">
          booting cyber-hacker matrix…
        </span>
      </div>
    ),
  }
);

export default function UniverseDeck() {
  const [terminalPulse, setTerminalPulse] = useState(0);
  const [matrixLines, setMatrixLines] = useState<string[]>([]);

  const liveLines = useMemo(() => matrixLines, [matrixLines]);

  const handleNodeTelemetry = useCallback(
    (_node: unknown, line: MatrixTelemetryLine) => {
      setMatrixLines((prev) => {
        const next = [...prev, line.text];
        return next.length > 80 ? next.slice(next.length - 80) : next;
      });
      setTerminalPulse((n) => n + 1);
    },
    []
  );

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-1 px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
          sandbox · ?view=universe · cyber-hacker matrix
        </p>
        <h1 className="text-lg font-semibold text-white sm:text-xl">
          Cyber-Hacker Runtime Deck
        </h1>
        <p className="max-w-2xl text-sm text-slate-muted">
          Select VPN/TOR orbs, router racks, or the GitHub workspace node to
          pulse live network telemetry into the E2B Virtual Terminal.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-stretch">
        <HackerMatrixCanvas onNodeSelect={handleNodeTelemetry} />
        <div
          id="sandbox-virtual-terminal"
          className={
            terminalPulse > 0
              ? "rounded-2xl shadow-[0_0_32px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/40 transition-[box-shadow,ring-color] duration-500"
              : "transition-[box-shadow] duration-500"
          }
        >
          <VirtualTerminal liveLines={liveLines} />
        </div>
      </div>
    </div>
  );
}
