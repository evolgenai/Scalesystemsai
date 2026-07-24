"use client";

import { formatPredictiveRisk } from "@/lib/spatial/predictiveTune";

type PredictiveHealthChipProps = {
  riskPct: number;
  className?: string;
  compact?: boolean;
};

/**
 * Sleek predictive risk chip for node selection cards.
 */
export default function PredictiveHealthChip({
  riskPct,
  className = "",
  compact = false,
}: PredictiveHealthChipProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(riskPct)));
  const { label, tone } = formatPredictiveRisk(clamped);

  const toneClass =
    tone === "optimal"
      ? "border-[#00ffaa]/35 bg-[#00ffaa]/10 text-[#00ffaa]"
      : tone === "elevated"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
        : "border-red-500/40 bg-red-500/10 text-red-300";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 font-mono shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ${toneClass} ${className}`}
      title={label}
      role="status"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          tone === "optimal"
            ? "bg-[#00ffaa]"
            : tone === "elevated"
              ? "bg-amber-300"
              : "bg-red-400"
        }`}
        aria-hidden
      />
      <span className={compact ? "text-[9px]" : "text-[10px]"}>
        {compact ? `${clamped}% risk · ${tone}` : label}
      </span>
    </div>
  );
}
