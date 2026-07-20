"use client";

import dynamic from "next/dynamic";
import VirtualTerminal from "@/components/sandbox/VirtualTerminal";

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
          booting spatial viewport…
        </span>
      </div>
    ),
  }
);

export default function UniverseDeck() {
  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-1 px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
          sandbox · ?view=universe
        </p>
        <h1 className="text-lg font-semibold text-white sm:text-xl">
          First-Person Runtime Deck
        </h1>
        <p className="max-w-2xl text-sm text-slate-muted">
          Float through the cyber grid, inspect terminal towers, and stage shell
          scripts for virtual container testing.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-stretch">
        <SpatialUniverse />
        <VirtualTerminal />
      </div>
    </div>
  );
}
