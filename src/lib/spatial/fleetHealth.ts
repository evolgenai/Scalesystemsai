/**
 * Fleet health for visual spatial universe — orbiting agent nodes over
 * cracked desert / green-planet HUD. Aggregates node health + predictive risk.
 */

import { z } from "zod";
import { analyzeNodeHealth } from "@/lib/spatial/nodeHealth";
import {
  runPredictiveTune,
  type PredictiveNodeForecast,
} from "@/lib/spatial/predictiveTune";
import { getSwarmTelemetry } from "@/lib/telemetry/swarmTelemetry";

export const FleetHealthRequestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
  seed: z.string().trim().min(1).max(128).optional(),
  limit: z.number().int().min(1).max(80).default(24),
  /** Analysis-only by default — set true to also fire preemptive_tune patches. */
  autoPatch: z.boolean().default(false),
});
export type FleetHealthRequest = z.infer<typeof FleetHealthRequestSchema>;

export type FleetOrbitNode = {
  nodeId: string;
  type: string;
  title: string;
  /** Pathfinder / orbit target for visual agent dispatch. */
  coordinates: [number, number, number];
  healthState: "healthy" | "warning" | "critical";
  healthScore: number;
  failureRisk: number;
  orbitRole: "star" | "planet" | "moon";
  requiresPin: boolean;
  preemptivelyTuned: boolean;
  patchId: string | null;
};

export type FleetHealthSnapshot = {
  generatedAt: string;
  workspaceId: string;
  sessionId: string;
  visualContext: "cracked_desert_orbit";
  summary: {
    nodes: number;
    healthy: number;
    warning: number;
    critical: number;
    atRisk: number;
    activeAgents: number;
    tokensConsumed: number;
    currentLatencyMs: number;
  };
  orbitNodes: FleetOrbitNode[];
  forecasts: PredictiveNodeForecast[];
  dispatchTargets: Array<{
    nodeId: string;
    type: string;
    title: string;
    coordinates: [number, number, number];
    failureRisk: number;
    patchId: string | null;
  }>;
};

function orbitRoleFor(
  type: string,
  risk: number
): FleetOrbitNode["orbitRole"] {
  if (risk > 0.8 || type.includes("sentry") || type.includes("meta_sre")) {
    return "star";
  }
  if (type.includes("tor") || type.includes("rover") || type.includes("vault")) {
    return "planet";
  }
  return "moon";
}

/**
 * Fleet health rollup for the photorealistic desert/orbit spatial HUD.
 */
export async function getFleetHealth(
  input: FleetHealthRequest
): Promise<FleetHealthSnapshot> {
  const [health, tune, swarm] = await Promise.all([
    analyzeNodeHealth({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      seed: input.seed,
      limit: input.limit,
    }),
    runPredictiveTune({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      seed: input.seed,
      limit: input.limit,
      autoPatch: input.autoPatch,
      riskThreshold: 0.8,
    }),
    getSwarmTelemetry({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      limit: 12,
    }),
  ]);

  const forecastById = new Map(tune.forecasts.map((f) => [f.nodeId, f]));

  const orbitNodes: FleetOrbitNode[] = health.nodes.map((n) => {
    const forecast = forecastById.get(n.nodeId);
    const failureRisk = forecast?.failureRisk ?? (100 - n.score) / 100;
    return {
      nodeId: n.nodeId,
      type: n.type,
      title: n.title,
      coordinates: n.coordinates,
      healthState: n.state,
      healthScore: n.score,
      failureRisk: Number(failureRisk.toFixed(4)),
      orbitRole: orbitRoleFor(n.type, failureRisk),
      requiresPin: n.requiresPin,
      preemptivelyTuned: Boolean(forecast?.triggered),
      patchId: forecast?.patch?.patchId ?? null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    visualContext: "cracked_desert_orbit",
    summary: {
      nodes: orbitNodes.length,
      healthy: health.summary.healthy,
      warning: health.summary.warning,
      critical: health.summary.critical,
      atRisk: tune.atRisk,
      activeAgents: swarm.totals.activeAgents,
      tokensConsumed: swarm.totals.tokensConsumed,
      currentLatencyMs: swarm.totals.currentLatencyMs,
    },
    orbitNodes,
    forecasts: tune.forecasts,
    dispatchTargets: tune.dispatchTargets,
  };
}
