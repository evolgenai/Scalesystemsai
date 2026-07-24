/**
 * Predictive Self-Tuning Engine — drift analysis + preemptive auto-patches.
 * Server-only (Prisma/memory). Client HUD helpers live in predictiveFormat.ts.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  storeAgentMemory,
  recallAgentMemory,
} from "@/lib/agents/agentMemoryStore";
import type { AutoPatchPayload } from "@/lib/agents/handOff";
import { createTraceId } from "@/lib/sentry/telemetry";
import {
  DEFAULT_WORLD_SEED,
  generateWorldObjectsMatrix,
  type SpatialRegistryNode,
} from "@/lib/spatial/worldObjects";
import {
  analyzeNodeHealth,
  type NodeHealthReport,
} from "@/lib/spatial/nodeHealth";
import {
  recordHandOffTrace,
  recordSwarmAgentStatus,
} from "@/lib/telemetry/swarmTelemetry";
import type {
  PredictiveDispatchTarget,
  PredictiveTuneSnapshot,
} from "@/lib/spatial/predictiveFormat";

export type {
  PredictiveDispatchTarget,
  PredictiveTuneSnapshot,
} from "@/lib/spatial/predictiveFormat";
export { formatPredictiveRisk } from "@/lib/spatial/predictiveFormat";

export const FAILURE_RISK_THRESHOLD = 0.8 as const;

/* ------------------------------------------------------------------ */
/* Sprint 54 — autonomous predictive auto-patch                        */
/* ------------------------------------------------------------------ */

export const PredictiveTuneRequestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
  seed: z.string().trim().min(1).max(128).optional(),
  nodeId: z.string().trim().min(1).max(128).optional(),
  nodeType: z.string().trim().min(1).max(64).optional(),
  riskThreshold: z.number().min(0).max(1).default(FAILURE_RISK_THRESHOLD),
  autoPatch: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(40),
  userId: z.string().trim().min(1).max(128).optional().nullable(),
  agentId: z.string().trim().min(1).max(128).default("meta-sre-engine"),
});
export type PredictiveTuneRequest = z.infer<typeof PredictiveTuneRequestSchema>;

export const DriftSignalSchema = z.object({
  metric: z.enum([
    "memory_pressure",
    "latency_spike",
    "error_rate",
    "cpu_pressure",
    "health_score",
    "status_degraded",
  ]),
  value: z.number(),
  baseline: z.number(),
  delta: z.number(),
  contribution: z.number().min(0).max(1),
});
export type DriftSignal = z.infer<typeof DriftSignalSchema>;

export const PredictiveNodeForecastSchema = z.object({
  nodeId: z.string(),
  type: z.string(),
  title: z.string(),
  coordinates: z.tuple([z.number(), z.number(), z.number()]),
  failureRisk: z.number().min(0).max(1),
  healthScore: z.number().min(0).max(100),
  healthState: z.enum(["healthy", "warning", "critical"]),
  drift: z.array(DriftSignalSchema),
  triggered: z.boolean(),
  patch: z
    .object({
      patchId: z.string(),
      memoryId: z.string().nullable(),
      status: z.string(),
      targetFile: z.string(),
    })
    .nullable(),
});
export type PredictiveNodeForecast = z.infer<
  typeof PredictiveNodeForecastSchema
>;

export const PredictiveTuneResultSchema = z.object({
  tuneId: z.string(),
  traceId: z.string(),
  generatedAt: z.string().datetime(),
  workspaceId: z.string(),
  sessionId: z.string(),
  riskThreshold: z.number(),
  scanned: z.number().int(),
  atRisk: z.number().int(),
  patchesTriggered: z.number().int(),
  forecasts: z.array(PredictiveNodeForecastSchema),
  dispatchTargets: z.array(
    z.object({
      nodeId: z.string(),
      type: z.string(),
      title: z.string(),
      coordinates: z.tuple([z.number(), z.number(), z.number()]),
      failureRisk: z.number(),
      patchId: z.string().nullable(),
    })
  ),
});
export type PredictiveTuneResult = z.infer<typeof PredictiveTuneResultSchema>;

type BaselineGlobals = {
  __ssPredictiveBaselines?: Map<
    string,
    { cpu: number; latency: number; samples: number }
  >;
};

function baselines(): Map<
  string,
  { cpu: number; latency: number; samples: number }
> {
  const g = globalThis as unknown as BaselineGlobals;
  if (!g.__ssPredictiveBaselines) g.__ssPredictiveBaselines = new Map();
  return g.__ssPredictiveBaselines;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function updateBaseline(
  nodeId: string,
  cpu: number,
  latency: number
): { cpu: number; latency: number } {
  const map = baselines();
  const prev = map.get(nodeId);
  if (!prev) {
    map.set(nodeId, { cpu, latency, samples: 1 });
    return { cpu, latency };
  }
  const next = {
    cpu: prev.cpu * 0.85 + cpu * 0.15,
    latency: prev.latency * 0.85 + latency * 0.15,
    samples: prev.samples + 1,
  };
  map.set(nodeId, next);
  return next;
}

function computeDrift(
  node: SpatialRegistryNode,
  healthScore: number
): { risk: number; drift: DriftSignal[] } {
  const tel = node.telemetry;
  const base = updateBaseline(node.id, tel.cpuLoad, tel.latencyMs);
  const drift: DriftSignal[] = [];
  const stressBias =
    (createHash("sha256").update(node.id).digest()[0]! % 40) / 100;

  const memoryPressure = Math.min(
    1,
    tel.cpuLoad * 1.05 +
      (tel.status === "degraded" ? 0.35 : 0) +
      (tel.status === "locked" ? 0.2 : 0) +
      stressBias * 0.35
  );
  const memContribution = clamp01((memoryPressure - 0.4) / 0.5);
  if (memContribution > 0) {
    drift.push({
      metric: "memory_pressure",
      value: memoryPressure,
      baseline: 0.4,
      delta: memoryPressure - 0.4,
      contribution: memContribution * 0.32,
    });
  }

  const effectiveLatency = tel.latencyMs + stressBias * 1800;
  const latencyDelta = effectiveLatency - Math.max(40, base.latency);
  const latencySpike = clamp01(latencyDelta / 1200);
  if (latencySpike > 0.04) {
    drift.push({
      metric: "latency_spike",
      value: effectiveLatency,
      baseline: base.latency,
      delta: latencyDelta,
      contribution: latencySpike * 0.34,
    });
  }

  const cpuDelta = tel.cpuLoad - base.cpu;
  const cpuPressure = clamp01(tel.cpuLoad + stressBias * 0.25);
  if (cpuPressure > 0.55 || cpuDelta > 0.05) {
    drift.push({
      metric: "cpu_pressure",
      value: tel.cpuLoad,
      baseline: base.cpu,
      delta: cpuDelta,
      contribution: clamp01((cpuPressure - 0.5) / 0.45) * 0.28,
    });
  }

  const errorProxy = clamp01(
    (tel.status === "degraded" ? 0.45 : 0) +
      (tel.status === "locked" ? 0.22 : 0) +
      (100 - healthScore) / 120 +
      stressBias * 0.4
  );
  if (errorProxy > 0.06) {
    drift.push({
      metric: "error_rate",
      value: errorProxy,
      baseline: 0.05,
      delta: errorProxy - 0.05,
      contribution: clamp01(errorProxy) * 0.3,
    });
  }

  if (healthScore < 80) {
    drift.push({
      metric: "health_score",
      value: healthScore,
      baseline: 92,
      delta: healthScore - 92,
      contribution: clamp01((80 - healthScore) / 80) * 0.28,
    });
  }

  if (tel.status === "degraded" || tel.status === "locked") {
    drift.push({
      metric: "status_degraded",
      value: 1,
      baseline: 0,
      delta: 1,
      contribution: tel.status === "degraded" ? 0.22 : 0.14,
    });
  }

  const risk = clamp01(
    drift.reduce((s, d) => s + d.contribution, 0) +
      (healthScore <= 40 ? 0.15 : 0) +
      stressBias * 0.2
  );

  return { risk, drift };
}

function buildPredictivePatch(
  node: SpatialRegistryNode,
  failureRisk: number,
  tuneId: string
): AutoPatchPayload {
  const short = createHash("sha256")
    .update(`${node.id}:${tuneId}`)
    .digest("hex")
    .slice(0, 12);
  const targetFile = `src/lib/spatial/guards/${node.type.replace(/[^a-z0-9_]/gi, "_")}.ts`;
  const patch = [
    `// Predictive auto-patch · ${node.type} · risk=${failureRisk.toFixed(3)}`,
    `// Node: ${node.id} @ [${node.coordinates.x}, ${node.coordinates.y}, ${node.coordinates.z}]`,
    `export const PREDICTIVE_GUARD_${short.toUpperCase()} = {`,
    `  nodeId: ${JSON.stringify(node.id)},`,
    `  type: ${JSON.stringify(node.type)},`,
    `  maxLatencyMs: ${Math.max(200, Math.round(node.telemetry.latencyMs * 0.7))},`,
    `  maxCpuLoad: ${Math.min(0.85, Number((node.telemetry.cpuLoad * 0.9).toFixed(3)))},`,
    `  enabled: true,`,
    `};`,
    ``,
    `export function applyPredictiveGuard_${short}() {`,
    `  if (typeof globalThis !== "undefined") {`,
    `    (globalThis as Record<string, unknown>).__ssPredictiveGuard = PREDICTIVE_GUARD_${short.toUpperCase()};`,
    `  }`,
    `  return PREDICTIVE_GUARD_${short.toUpperCase()};`,
    `}`,
  ].join("\n");

  return {
    patchId: `pred-patch-${short}`,
    status: "ready_for_virtual_deploy",
    confidence: Math.min(0.95, 0.55 + failureRisk * 0.4),
    targetFile,
    patch,
    explanation: `Preemptive self-tune for ${node.title}: failure risk ${failureRisk.toFixed(2)} exceeded threshold. Injecting latency/CPU guard near spatial node ${node.id}.`,
    risk: failureRisk >= 0.92 ? "high" : failureRisk >= 0.85 ? "medium" : "low",
    sentryErrorId: `predictive:${node.id}`,
    basedOnMemoryIds: [],
    deploy: {
      mode: "virtual",
      dryRun: true,
      estimatedSteps: [
        "analyze_drift",
        "synthesize_guard",
        "record_memory",
        "dispatch_visual_agent",
      ],
    },
  };
}

export async function runPredictiveTune(
  input: PredictiveTuneRequest
): Promise<PredictiveTuneResult> {
  const traceId = createTraceId();
  const tuneId = `tune_${traceId.replace(/-/g, "").slice(0, 16)}`;
  const seed = input.seed?.trim() || DEFAULT_WORLD_SEED;
  const threshold = input.riskThreshold ?? FAILURE_RISK_THRESHOLD;

  const matrix = generateWorldObjectsMatrix({ seed });
  let nodes = matrix.objects.filter((n) => n.category === "interactive");
  if (input.nodeId) nodes = nodes.filter((n) => n.id === input.nodeId);
  if (input.nodeType) nodes = nodes.filter((n) => n.type === input.nodeType);
  nodes = nodes.slice(0, input.limit);

  const health = await analyzeNodeHealth({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    seed,
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    limit: input.limit,
  });
  const healthById = new Map(health.nodes.map((n) => [n.nodeId, n]));

  let recentPatchKeys = new Set<string>();
  try {
    const prior = await recallAgentMemory({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      kinds: ["preemptive_tune", "auto_patch"],
      tags: ["predictive", "self-tune", "preemptive_tune"],
      limit: 30,
      strictTenant: true,
    });
    recentPatchKeys = new Set(
      prior.entries
        .map((e) => {
          const payload = e.payload as { nodeId?: string };
          return payload.nodeId ? String(payload.nodeId) : "";
        })
        .filter(Boolean)
    );
  } catch {
    recentPatchKeys = new Set();
  }

  const forecasts: PredictiveNodeForecast[] = [];
  let patchesTriggered = 0;

  for (const node of nodes) {
    const report = healthById.get(node.id);
    const healthScore = report?.score ?? 80;
    const healthState = report?.state ?? "healthy";
    const { risk, drift } = computeDrift(node, healthScore);

    let patchMeta: PredictiveNodeForecast["patch"] = null;
    const shouldTrigger =
      input.autoPatch && risk > threshold && !recentPatchKeys.has(node.id);

    if (shouldTrigger) {
      const autoPatch = buildPredictivePatch(node, risk, tuneId);
      let memoryId: string | null = null;
      try {
        const memory = await storeAgentMemory({
          kind: "preemptive_tune",
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          agentId: input.agentId,
          title: `preemptive_tune · ${node.type}`,
          summary: autoPatch.explanation,
          tags: [
            "predictive",
            "self-tune",
            "preemptive_tune",
            "preemptive",
            "visual_dispatch",
            node.type.slice(0, 48),
          ],
          sentryIssueId: autoPatch.sentryErrorId,
          traceId,
          payload: {
            tuneId,
            patchKind: "preemptive_tune",
            nodeId: node.id,
            nodeType: node.type,
            failureRisk: risk,
            /** Orbit / desert-terrain pathfinder target for visual agent dispatch. */
            coordinates: [
              node.coordinates.x,
              node.coordinates.y,
              node.coordinates.z,
            ],
            visualContext: "cracked_desert_orbit",
            drift,
            autoPatch,
            outcome: "preemptive_tune",
          },
          source: "agent",
        });
        memoryId = memory.id;
        recentPatchKeys.add(node.id);
        patchesTriggered += 1;

        try {
          recordSwarmAgentStatus({
            agentId: "meta-sre-engine",
            status: "running",
            currentTask: `preemptive_tune ${autoPatch.patchId}`,
            latencyMs: node.telemetry.latencyMs,
            success: true,
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
          });
          recordHandOffTrace({
            fromAgentId: "database-auditor",
            toAgentId: "meta-sre-engine",
            sentryErrorId: autoPatch.sentryErrorId,
            summary: `preemptive_tune fired for ${node.id} (risk ${risk.toFixed(2)})`,
            status: "completed",
            latencyMs: Math.round(node.telemetry.latencyMs),
            tokensUsed: Math.ceil(autoPatch.patch.length / 4),
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            traceId,
          });
        } catch {
          /* telemetry best-effort */
        }
      } catch {
        memoryId = null;
      }

      patchMeta = {
        patchId: autoPatch.patchId,
        memoryId,
        status: autoPatch.status,
        targetFile: autoPatch.targetFile,
      };
    }

    forecasts.push({
      nodeId: node.id,
      type: node.type,
      title: node.title,
      coordinates: [
        node.coordinates.x,
        node.coordinates.y,
        node.coordinates.z,
      ],
      failureRisk: Number(risk.toFixed(4)),
      healthScore,
      healthState,
      drift,
      triggered: Boolean(patchMeta),
      patch: patchMeta,
    });
  }

  forecasts.sort((a, b) => b.failureRisk - a.failureRisk);

  const dispatchTargets = forecasts
    .filter((f) => f.triggered || f.failureRisk > threshold)
    .slice(0, 8)
    .map((f) => ({
      nodeId: f.nodeId,
      type: f.type,
      title: f.title,
      coordinates: f.coordinates,
      failureRisk: f.failureRisk,
      patchId: f.patch?.patchId ?? null,
    }));

  return {
    tuneId,
    traceId,
    generatedAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    riskThreshold: threshold,
    scanned: forecasts.length,
    atRisk: forecasts.filter((f) => f.failureRisk > threshold).length,
    patchesTriggered,
    forecasts,
    dispatchTargets,
  };
}

/* ------------------------------------------------------------------ */
/* Agent B HUD compat — risk chips / dispatch list                     */
/* ------------------------------------------------------------------ */

export const PredictiveTuneQuerySchema = z.object({
  workspaceId: z.string().trim().min(1).max(128).optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  seed: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(40).optional(),
});
export type PredictiveTuneQuery = z.infer<typeof PredictiveTuneQuerySchema>;

function riskFromReport(n: NodeHealthReport): number {
  const base = Math.max(0, Math.min(100, 100 - n.score));
  const bump = n.state === "critical" ? 18 : n.state === "warning" ? 8 : 0;
  return Math.min(99, Math.round(base + bump));
}

export async function buildPredictiveTune(
  query: PredictiveTuneQuery = {}
): Promise<PredictiveTuneSnapshot> {
  const limit = query.limit ?? 12;
  const health = await analyzeNodeHealth({
    workspaceId: query.workspaceId,
    sessionId: query.sessionId,
    seed: query.seed,
    limit: Math.max(limit * 2, 24),
  });

  const atRisk = health.nodes
    .filter((n) => n.state === "critical" || n.state === "warning")
    .map((n) => {
      const riskPct = riskFromReport(n);
      return {
        nodeId: n.nodeId,
        label: n.title,
        riskPct,
        state: n.state as "warning" | "critical",
        position: n.coordinates,
        reason:
          n.signals[0]?.message ??
          (n.state === "critical"
            ? "Predicted failure window < 15m"
            : "Degraded trajectory"),
        etaMs: n.state === "critical" ? 4200 : 6500,
        agentId: `repair-${n.nodeId.slice(0, 10)}`,
      } satisfies PredictiveDispatchTarget;
    })
    .sort((a, b) => b.riskPct - a.riskPct)
    .slice(0, limit);

  const avgRiskPct =
    atRisk.length === 0
      ? 0
      : Math.round(atRisk.reduce((s, t) => s + t.riskPct, 0) / atRisk.length);

  return {
    fetchedAt: new Date().toISOString(),
    workspaceId: query.workspaceId ?? null,
    horizonMin: 15,
    targets: atRisk,
    summary: {
      atRisk: atRisk.length,
      dispatchQueued: atRisk.filter((t) => t.riskPct >= 35).length,
      avgRiskPct,
    },
    source: "health+forecast",
  };
}
