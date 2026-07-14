"use client";

import { useEffect, useRef, useState } from "react";
import { Brain } from "lucide-react";
import type { RecalledMemory } from "@/lib/agents/useAgentStream";

type RecalledMemoriesIndicatorProps = {
  memories: RecalledMemory[];
};

export default function RecalledMemoriesIndicator({
  memories,
}: RecalledMemoriesIndicatorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = memories.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => {
          if (active) setOpen(true);
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
          active
            ? "border-cyan-accent/50 bg-cyan-accent/10 text-cyan-accent shadow-[0_0_18px_rgba(0,242,254,0.28)]"
            : "border-white/10 bg-black/30 text-slate-500"
        }`}
        aria-expanded={open}
        aria-label="Recalled memories"
      >
        <Brain
          className={`h-3.5 w-3.5 ${active ? "animate-pulse" : ""}`}
          aria-hidden
        />
        {active ? `${memories.length} recalled` : "Memory"}
      </button>

      {open && active ? (
        <div
          role="dialog"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-40 w-72 max-h-56 overflow-y-auto rounded-xl border border-cyan-accent/25 bg-[#0b0f17] p-2 shadow-[0_0_32px_rgba(0,242,254,0.16)]"
        >
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-accent/80">
            Recalled Memories
          </p>
          <ul className="space-y-1.5">
            {memories.map((memory, index) => {
              const pct = Math.round(
                memory.score <= 1 ? memory.score * 100 : memory.score
              );
              return (
                <li
                  key={memory.id}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2"
                >
                  <p className="text-[11px] leading-snug text-slate-100">
                    Memory #{index + 1}: {memory.text}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-cyan-accent/80">
                    {pct}% relevance
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
