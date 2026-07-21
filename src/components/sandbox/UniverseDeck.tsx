"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import VirtualTerminal from "@/components/sandbox/VirtualTerminal";

const SpatialUniverse = dynamic(
  () => import("@/components/spatial/SpatialUniverse"),
  {
    ssr: false,
    loading: () => (
      <div
        className="glass-panel flex min-h-[420px] animate-pulse items-center justify-center sm:min-h-[480px] lg:min-h-[560px]"
        aria-busy
        aria-label="Loading spatial universe"
      >
        <span className="font-mono text-xs text-slate-dim">
          booting spatial viewport…
        </span>
      </div>
    ),
  }
);

export default function UniverseDeck() {
  const [terminalPulse, setTerminalPulse] = useState(0);

  const handleOpenTerminal = useCallback((_towerId: string) => {
    setTerminalPulse((n) => n + 1);
    requestAnimationFrame(() => {
      document
        .getElementById("sandbox-virtual-terminal")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-1 px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-blue-400/80">
          sandbox · ?view=universe
        </p>
        <h1 className="text-lg font-semibold text-white sm:text-xl">
          Third-Person Runtime Deck
        </h1>
        <p className="max-w-2xl text-sm text-slate-muted">
          Pilot the robot avatar through the cyber grid, connect to agent
          towers with E, and stage scripts in the virtual terminal.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-stretch">
        <SpatialUniverse onOpenTerminal={handleOpenTerminal} />
        <div
          id="sandbox-virtual-terminal"
          className={
            terminalPulse > 0
              ? "rounded-2xl shadow-[0_0_32px_rgba(59, 130, 246,0.25)] ring-1 ring-blue-400/40 transition-[box-shadow,ring-color] duration-500"
              : "transition-[box-shadow] duration-500"
          }
        >
          <VirtualTerminal />
        </div>
      </div>
    </div>
  );
}
