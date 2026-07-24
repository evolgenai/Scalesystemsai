/**
 * Client-safe predictive HUD helpers (no Prisma / Node crypto).
 */

export type PredictiveDispatchTarget = {
  nodeId: string;
  label: string;
  riskPct: number;
  state: "warning" | "critical";
  position: [number, number, number];
  reason: string;
  etaMs: number;
  agentId: string;
};

export type PredictiveTuneSnapshot = {
  fetchedAt: string;
  workspaceId: string | null;
  horizonMin: number;
  targets: PredictiveDispatchTarget[];
  summary: {
    atRisk: number;
    dispatchQueued: number;
    avgRiskPct: number;
  };
  source: "health+forecast";
};

export function formatPredictiveRisk(riskPct: number): {
  label: string;
  tone: "optimal" | "elevated" | "critical";
} {
  if (riskPct < 20) {
    return {
      label: `Predictive Risk: ${riskPct}% — Optimal`,
      tone: "optimal",
    };
  }
  if (riskPct < 55) {
    return {
      label: `Predictive Risk: ${riskPct}% — Elevated`,
      tone: "elevated",
    };
  }
  return {
    label: `Predictive Risk: ${riskPct}% — Critical`,
    tone: "critical",
  };
}
