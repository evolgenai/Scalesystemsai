/**
 * Swarm Telemetry & Token Engine — live sub-agent statuses, token/cost
 * accounting, latency, and multi-agent hand-off traces.
 */

import { z } from "zod";
import { createTraceId } from "@/lib/sentry/telemetry";
import { recallAgentMemory } from "@/lib/agents/agentMemoryStore";

export const SwarmAgentIdSchema = z.enum([
  "security-sentinel",
  "meta-sre-engine",
  "sandbox-executor",
  "database-auditor",
]);
export type SwarmAgentId = z.infer<typeof SwarmAgentIdSchema>;

export const SwarmAgentStatusSchema = z.enum([
  "idle",
  "running",
  "waiting",
  "handing_off",
  "error",
  "offline",
]);
export type SwarmAgentStatus = z.infer<typeof SwarmAgentStatusSchema>;

export const SwarmAgentSnapshotSchema = z.object({
  id: SwarmAgentIdSchema,
  name: z.string().min(1),
  role: z.string().min(1),
  status: SwarmAgentStatusSchema,
  currentTask: z.string().nullable(),
  lastActiveAt: z.string().datetime(),
  tokensConsumed: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  successRate: z.number().min(0).max(1),
});
export type SwarmAgentSnapshot = z.infer<typeof SwarmAgentSnapshotSchema>;

export const SwarmHandOffTraceSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  sentryErrorId: z.string().nullable(),
  summary: z.string().min(1),
  status: z.enum(["started", "completed", "failed"]),
  latencyMs: z.number().nonnegative(),
  tokensUsed: z.number().nonnegative(),
  workspaceId: z.string().nullable(),
  sessionId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type SwarmHandOffTrace = z.infer<typeof SwarmHandOffTraceSchema>;

export const TokenUsageEventSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  model: z.string().default("unknown"),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
  workspaceId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  traceId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type TokenUsageEvent = z.infer<typeof TokenUsageEventSchema>;

/** Rough USD / 1M tokens (input+output blended) for cost estimates. */
const MODEL_COST_PER_1M: Record<string, number> = {
  "gpt-4o": 5.0,
  "gpt-4o-mini": 0.4,
  "claude-sonnet": 6.0,
  "claude-haiku": 0.8,
  "gemini-flash": 0.3,
  unknown: 2.0,
};

export function estimateTokenCostUsd(
  totalTokens: number,
  model = "unknown"
): number {
  const rate = MODEL_COST_PER_1M[model] ?? MODEL_COST_PER_1M.unknown;
  return Math.round((totalTokens / 1_000_000) * rate * 1_000_000) / 1_000_000;
}

const AGENT_CATALOG: ReadonlyArray<{
  id: SwarmAgentId;
  name: string;
  role: string;
}> = [
  {
    id: "security-sentinel",
    name: "Security Sentinel",
    role: "Threat scanning, auth boundaries, vulnerability triage",
  },
  {
    id: "meta-sre-engine",
    name: "Meta-SRE Engine",
    role: "Sentry recall, auto-patch synthesis, self-heal orchestration",
  },
  {
    id: "sandbox-executor",
    name: "Sandbox Executor",
    role: "Virtual sandbox deploy, patch verification, rollback gates",
  },
  {
    id: "database-auditor",
    name: "Database Auditor",
    role: "Query egress, tenant isolation, schema drift checks",
  },
];

type SwarmGlobals = {
  /** Per-tenant agent boards keyed by workspaceId::sessionId */
  __ssSwarmAgentStateByTenant?: Map<string, Map<SwarmAgentId, SwarmAgentSnapshot>>;
  /** Legacy global board — only used when no tenant scope is provided (internal). */
  __ssSwarmAgentState?: Map<SwarmAgentId, SwarmAgentSnapshot>;
  __ssSwarmHandOffTraces?: SwarmHandOffTrace[];
  __ssSwarmTokenEvents?: TokenUsageEvent[];
};

const MAX_TRACES = 200;
const MAX_TOKEN_EVENTS = 400;

function globals(): SwarmGlobals {
  return globalThis as unknown as SwarmGlobals;
}

function tenantKey(
  workspaceId?: string | null,
  sessionId?: string | null
): string | null {
  const ws = workspaceId?.trim();
  const sid = sessionId?.trim();
  if (!ws || !sid) return null;
  return `${ws}::${sid}`;
}

function seedAgentBoard(): Map<SwarmAgentId, SwarmAgentSnapshot> {
  const now = new Date().toISOString();
  return new Map(
    AGENT_CATALOG.map((a) => [
      a.id,
      {
        id: a.id,
        name: a.name,
        role: a.role,
        status: "idle" as const,
        currentTask: null,
        lastActiveAt: now,
        tokensConsumed: 0,
        latencyMs: 0,
        successRate: 1,
      },
    ])
  );
}

function agentState(
  workspaceId?: string | null,
  sessionId?: string | null
): Map<SwarmAgentId, SwarmAgentSnapshot> {
  const g = globals();
  const key = tenantKey(workspaceId, sessionId);
  if (key) {
    if (!g.__ssSwarmAgentStateByTenant) {
      g.__ssSwarmAgentStateByTenant = new Map();
    }
    let board = g.__ssSwarmAgentStateByTenant.get(key);
    if (!board) {
      board = seedAgentBoard();
      g.__ssSwarmAgentStateByTenant.set(key, board);
    }
    return board;
  }
  if (!g.__ssSwarmAgentState) {
    g.__ssSwarmAgentState = seedAgentBoard();
  }
  return g.__ssSwarmAgentState;
}

function traces(): SwarmHandOffTrace[] {
  const g = globals();
  if (!g.__ssSwarmHandOffTraces) g.__ssSwarmHandOffTraces = [];
  return g.__ssSwarmHandOffTraces;
}

function tokenEvents(): TokenUsageEvent[] {
  const g = globals();
  if (!g.__ssSwarmTokenEvents) g.__ssSwarmTokenEvents = [];
  return g.__ssSwarmTokenEvents;
}

export const RecordSwarmAgentStatusSchema = z.object({
  agentId: SwarmAgentIdSchema,
  status: SwarmAgentStatusSchema,
  currentTask: z.string().max(500).nullable().optional(),
  latencyMs: z.number().nonnegative().optional(),
  success: z.boolean().optional(),
  workspaceId: z.string().trim().min(1).max(128).nullable().optional(),
  sessionId: z.string().trim().min(1).max(128).nullable().optional(),
});
export type RecordSwarmAgentStatusInput = z.infer<
  typeof RecordSwarmAgentStatusSchema
>;

export function recordSwarmAgentStatus(
  input: RecordSwarmAgentStatusInput
): SwarmAgentSnapshot {
  const map = agentState(input.workspaceId, input.sessionId);
  const prev = map.get(input.agentId);
  if (!prev) {
    throw new Error(`Unknown swarm agent: ${input.agentId}`);
  }
  const runs = Math.max(1, Math.round(1 / Math.max(prev.successRate, 0.01)));
  const successes = Math.round(prev.successRate * runs);
  const nextRuns = runs + 1;
  const nextSuccesses =
    input.success === undefined
      ? successes
      : successes + (input.success ? 1 : 0);

  const next: SwarmAgentSnapshot = {
    ...prev,
    status: input.status,
    currentTask:
      input.currentTask === undefined
        ? prev.currentTask
        : input.currentTask,
    lastActiveAt: new Date().toISOString(),
    latencyMs: input.latencyMs ?? prev.latencyMs,
    successRate: Math.min(1, Math.max(0, nextSuccesses / nextRuns)),
  };
  map.set(input.agentId, next);
  return next;
}

export const RecordTokenUsageSchema = z.object({
  agentId: z.string().trim().min(1).max(128),
  model: z.string().trim().min(1).max(64).optional(),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  latencyMs: z.number().nonnegative().default(0),
  workspaceId: z.string().trim().min(1).max(128).nullable().optional(),
  sessionId: z.string().trim().min(1).max(128).nullable().optional(),
  traceId: z.string().trim().min(1).max(128).nullable().optional(),
});
export type RecordTokenUsageInput = z.infer<typeof RecordTokenUsageSchema>;

export function recordTokenUsage(
  input: RecordTokenUsageInput
): TokenUsageEvent {
  const model = input.model ?? "unknown";
  const totalTokens = input.promptTokens + input.completionTokens;
  const event: TokenUsageEvent = {
    id: `tok_${createTraceId().replace(/-/g, "").slice(0, 16)}`,
    agentId: input.agentId,
    model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens,
    latencyMs: input.latencyMs,
    costUsd: estimateTokenCostUsd(totalTokens, model),
    workspaceId: input.workspaceId ?? null,
    sessionId: input.sessionId ?? null,
    traceId: input.traceId ?? null,
    createdAt: new Date().toISOString(),
  };

  const ring = tokenEvents();
  ring.push(event);
  if (ring.length > MAX_TOKEN_EVENTS) {
    ring.splice(0, ring.length - MAX_TOKEN_EVENTS);
  }

  // Mirror into known catalog agents when id matches (tenant-scoped board).
  if (SwarmAgentIdSchema.safeParse(input.agentId).success) {
    const id = input.agentId as SwarmAgentId;
    const map = agentState(input.workspaceId, input.sessionId);
    const prev = map.get(id);
    if (prev) {
      map.set(id, {
        ...prev,
        tokensConsumed: prev.tokensConsumed + totalTokens,
        latencyMs: input.latencyMs || prev.latencyMs,
        lastActiveAt: event.createdAt,
        status: prev.status === "idle" ? "running" : prev.status,
      });
    }
  }

  return event;
}

export const RecordHandOffTraceSchema = z.object({
  fromAgentId: z.string().trim().min(1).max(128),
  toAgentId: z.string().trim().min(1).max(128),
  sentryErrorId: z.string().trim().min(1).max(128).nullable().optional(),
  summary: z.string().trim().min(1).max(1000),
  status: z.enum(["started", "completed", "failed"]).default("completed"),
  latencyMs: z.number().nonnegative().default(0),
  tokensUsed: z.number().nonnegative().default(0),
  workspaceId: z.string().trim().min(1).max(128).nullable().optional(),
  sessionId: z.string().trim().min(1).max(128).nullable().optional(),
  traceId: z.string().trim().min(1).max(128).optional(),
});
export type RecordHandOffTraceInput = z.infer<typeof RecordHandOffTraceSchema>;

export function recordHandOffTrace(
  input: RecordHandOffTraceInput
): SwarmHandOffTrace {
  const traceId = input.traceId ?? createTraceId();
  const entry: SwarmHandOffTrace = {
    id: `trace_${traceId.replace(/-/g, "").slice(0, 16)}`,
    traceId,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    sentryErrorId: input.sentryErrorId ?? null,
    summary: input.summary,
    status: input.status,
    latencyMs: input.latencyMs,
    tokensUsed: input.tokensUsed,
    workspaceId: input.workspaceId ?? null,
    sessionId: input.sessionId ?? null,
    createdAt: new Date().toISOString(),
  };

  const ring = traces();
  ring.push(entry);
  if (ring.length > MAX_TRACES) {
    ring.splice(0, ring.length - MAX_TRACES);
  }

  // Reflect hand-off on catalog agents when possible (tenant-scoped).
  for (const [id, status] of [
    [input.fromAgentId, "handing_off"],
    [input.toAgentId, input.status === "failed" ? "error" : "running"],
  ] as const) {
    if (SwarmAgentIdSchema.safeParse(id).success) {
      recordSwarmAgentStatus({
        agentId: id as SwarmAgentId,
        status: status as SwarmAgentStatus,
        currentTask: input.summary.slice(0, 200),
        latencyMs: input.latencyMs,
        success: input.status !== "failed",
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
      });
    }
  }

  if (input.tokensUsed > 0) {
    recordTokenUsage({
      agentId: input.toAgentId,
      promptTokens: Math.floor(input.tokensUsed * 0.6),
      completionTokens: Math.ceil(input.tokensUsed * 0.4),
      latencyMs: input.latencyMs,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      traceId,
    });
  }

  return entry;
}

export type SwarmTelemetrySnapshot = {
  generatedAt: string;
  workspaceId: string;
  sessionId: string;
  agents: SwarmAgentSnapshot[];
  totals: {
    tokensConsumed: number;
    promptTokens: number;
    completionTokens: number;
    costUsdEstimate: number;
    currentLatencyMs: number;
    activeAgents: number;
    handOffsLastHour: number;
  };
  handOffTraces: SwarmHandOffTrace[];
  recentTokenEvents: TokenUsageEvent[];
  source: "live" | "live+memory";
};

/**
 * Strict enterprise filter — both workspaceId and sessionId must match.
 * Unscoped (null) events never leak into a tenant query.
 */
function filterByTenantStrict<
  T extends { workspaceId?: string | null; sessionId?: string | null },
>(items: T[], workspaceId: string, sessionId: string): T[] {
  return items.filter(
    (item) =>
      item.workspaceId === workspaceId && item.sessionId === sessionId
  );
}

/**
 * Build a live swarm telemetry snapshot for the HUD / API.
 * Requires workspaceId + sessionId — prevents cross-tenant data leaks.
 */
export async function getSwarmTelemetry(options: {
  workspaceId: string;
  sessionId: string;
  limit?: number;
}): Promise<SwarmTelemetrySnapshot> {
  const workspaceId = options.workspaceId?.trim();
  const sessionId = options.sessionId?.trim();
  if (!workspaceId || !sessionId) {
    throw new Error(
      "getSwarmTelemetry requires workspaceId and sessionId for multi-tenant isolation."
    );
  }

  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const agents = [...agentState(workspaceId, sessionId).values()];

  let handOffTraces = filterByTenantStrict(
    [...traces()].reverse(),
    workspaceId,
    sessionId
  ).slice(0, limit);

  let recentTokenEvents = filterByTenantStrict(
    [...tokenEvents()].reverse(),
    workspaceId,
    sessionId
  ).slice(0, limit);

  let source: SwarmTelemetrySnapshot["source"] = "live";

  if (handOffTraces.length < 5) {
    try {
      const recalled = await recallAgentMemory({
        workspaceId,
        sessionId,
        kinds: ["execution_step", "auto_patch", "preemptive_tune"],
        tags: ["hand-off", "swarm", "execute-patch", "preemptive_tune"],
        limit: 10,
        strictTenant: true,
      });

      const fromMemory: SwarmHandOffTrace[] = recalled.entries
        .filter(
          (e) => e.workspaceId === workspaceId && e.sessionId === sessionId
        )
        .map((e) => {
          const payload = e.payload as Record<string, unknown>;
          return {
            id: `mem_${e.id}`,
            traceId: e.traceId ?? e.id,
            fromAgentId:
              typeof payload.fromAgentId === "string"
                ? payload.fromAgentId
                : "agent-a",
            toAgentId: e.agentId,
            sentryErrorId: e.sentryIssueId ?? null,
            summary: e.summary.slice(0, 240),
            status: "completed" as const,
            latencyMs:
              typeof payload.durationMs === "number" ? payload.durationMs : 0,
            tokensUsed:
              typeof payload.tokensUsed === "number" ? payload.tokensUsed : 0,
            workspaceId: e.workspaceId,
            sessionId: e.sessionId,
            createdAt: e.createdAt,
          };
        });

      const seen = new Set(handOffTraces.map((t) => t.id));
      for (const t of fromMemory) {
        if (!seen.has(t.id)) handOffTraces.push(t);
      }
      handOffTraces = handOffTraces
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, limit);
      if (fromMemory.length > 0) source = "live+memory";
    } catch {
      // Memory enrichment is best-effort.
    }
  }

  const promptTokens = recentTokenEvents.reduce(
    (s, e) => s + e.promptTokens,
    0
  );
  const completionTokens = recentTokenEvents.reduce(
    (s, e) => s + e.completionTokens,
    0
  );
  const tokensConsumed =
    recentTokenEvents.reduce((s, e) => s + e.totalTokens, 0) ||
    agents.reduce((s, a) => s + a.tokensConsumed, 0);
  const costUsdEstimate =
    recentTokenEvents.reduce((s, e) => s + e.costUsd, 0) ||
    estimateTokenCostUsd(tokensConsumed);
  const currentLatencyMs =
    recentTokenEvents[0]?.latencyMs ??
    Math.max(0, ...agents.map((a) => a.latencyMs));

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const handOffsLastHour = handOffTraces.filter(
    (t) => Date.parse(t.createdAt) >= hourAgo
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    sessionId,
    agents,
    totals: {
      tokensConsumed,
      promptTokens,
      completionTokens,
      costUsdEstimate:
        Math.round(costUsdEstimate * 1_000_000) / 1_000_000,
      currentLatencyMs,
      activeAgents: agents.filter(
        (a) => a.status === "running" || a.status === "handing_off"
      ).length,
      handOffsLastHour,
    },
    handOffTraces,
    recentTokenEvents,
    source,
  };
}

/** Map common agent aliases onto catalog ids for instrumentation. */
export function resolveSwarmAgentId(agentId: string): SwarmAgentId | null {
  const n = agentId.toLowerCase().replace(/_/g, "-");
  if (n.includes("security") || n.includes("sentinel")) {
    return "security-sentinel";
  }
  if (n.includes("meta-sre") || n.includes("metasre") || n === "meta-sre") {
    return "meta-sre-engine";
  }
  if (n.includes("sandbox") || n.includes("executor")) {
    return "sandbox-executor";
  }
  if (n.includes("database") || n.includes("auditor") || n.includes("db")) {
    return "database-auditor";
  }
  return SwarmAgentIdSchema.safeParse(n).success
    ? (n as SwarmAgentId)
    : null;
}
