"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import VirtualTerminal from "@/components/terminal/VirtualTerminal";

const SpatialUniverse = dynamic(
  () => import("@/components/sandbox/SpatialUniverse"),
  {
    ssr: false,
    loading: () => (
      <div
        className="glass-panel flex min-h-[420px] animate-pulse items-center justify-center sm:min-h-[480px] lg:min-h-[560px]"
        aria-busy
        aria-label="Loading spatial universe"
      >
        <span className="font-mono text-xs text-slate-dim">
          booting mass WebGL world…
        </span>
      </div>
    ),
  }
);

export default function UniverseDeck() {
  const [terminalPulse, setTerminalPulse] = useState(0);
  const [matrixLines, setMatrixLines] = useState<string[]>([]);

  const liveLines = useMemo(() => matrixLines, [matrixLines]);

  const handleOpenTerminal = useCallback((towerId: string) => {
    setMatrixLines((prev) => {
      const next = [
        ...prev,
        `[spatial] interact · ${towerId} · uplink open`,
      ];
      return next.length > 80 ? next.slice(next.length - 80) : next;
    });
    setTerminalPulse((n) => n + 1);
  }, []);

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-1 px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
          sandbox · ?view=universe · mass webgl world
        </p>
        <h1 className="text-lg font-semibold text-white sm:text-xl">
          Spatial Runtime Deck
        </h1>
        <p className="max-w-2xl text-sm text-slate-muted">
          Pilot the alien through 160 GPU-instanced hardware nodes (80%+
        interactive). [E] opens unique tool overlays, [Z] unlocks PIN-gated
        nodes via /api/spatial/verify-pin, [F] mounts CyberRover, Tor Node
        cloaks your proxy IP.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-stretch">
        <SpatialUniverse onOpenTerminal={handleOpenTerminal} />
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
