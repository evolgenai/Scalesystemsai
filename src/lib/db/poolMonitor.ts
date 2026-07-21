/**
 * Database pool failover + health monitor.
 * Catches connection-pool timeouts, resets the Prisma/pg pool, and dispatches
 * auto-heal payloads to the Meta-SRE evolution engine (dry-run sandbox gate).
 */

import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  executeMetaEvolutionRun,
  type MetaEvolutionResult,
} from "@/lib/sre/metaEvolutionEngine";
import {
  getPrisma,
  getPrismaGeneration,
  isPrismaDisconnectError,
  resetPrismaClient,
} from "@/lib/prisma";

export const POOL_MONITOR_PROTOCOL =
  "scalesystems.sre.pool-autoheal/v1" as const;

const LOG_PREFIX = "[pool-monitor]";
const MAX_FAILOVER_RETRIES = 2 as const;
const HEAL_COOLDOWN_MS = 30_000;

type PoolMonitorGlobals = {
  __ssPoolHealInFlight?: Promise<PoolAutoHealDispatchResult> | null;
  __ssPoolHealLastAt?: number;
};

const globals = globalThis as unknown as PoolMonitorGlobals;

export type PoolTimeoutKind =
  | "connection_timeout"
  | "pool_exhausted"
  | "prisma_timed_out"
  | "pool_ended"
  | "unknown_disconnect";

export type PoolAutoHealPayload = {
  protocol: typeof POOL_MONITOR_PROTOCOL;
  kind: "db.pool_timeout";
  timeoutKind: PoolTimeoutKind;
  label: string;
  message: string;
  code: string | null;
  generation: number | null;
  workspaceId: string | null;
  at: string;
  suggestedRemediation: string[];
};

export type PoolAutoHealDispatchResult = {
  dispatched: boolean;
  skippedReason?: string;
  payload: PoolAutoHealPayload;
  metaSre: MetaEvolutionResult | null;
};

export type PoolHealthSnapshot = {
  ok: boolean;
  latencyMs: number;
  generation: number | null;
  checkedAt: string;
  error?: string;
};

function classifyPoolTimeout(err: unknown): PoolTimeoutKind | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2024: timed out fetching a new connection from the connection pool
    if (err.code === "P2024") return "prisma_timed_out";
    if (err.code === "P1002") return "connection_timeout";
    if (err.code === "P1001" || err.code === "P1017") {
      return "unknown_disconnect";
    }
  }

  if (!(err instanceof Error)) return null;
  const m = err.message.toLowerCase();

  if (
    m.includes("connection timed out") ||
    m.includes("connection timeout") ||
    m.includes("timeout exceeded when trying to connect") ||
    m.includes("connect etimedout")
  ) {
    return "connection_timeout";
  }
  if (
    m.includes("timeout exceeded when trying to get a connection") ||
    m.includes("too many clients") ||
    m.includes("remaining connection slots") ||
    m.includes("connection pool")
  ) {
    return "pool_exhausted";
  }
  if (
    m.includes("timed out fetching a new connection") ||
    m.includes("p2024")
  ) {
    return "prisma_timed_out";
  }
  if (m.includes("cannot use a pool after calling end")) {
    return "pool_ended";
  }
  if (isPrismaDisconnectError(err)) {
    return "unknown_disconnect";
  }
  return null;
}

/**
 * True when the error indicates a pool / connection timeout that warrants
 * failover + Meta-SRE auto-heal dispatch.
 */
export function isPoolTimeoutError(err: unknown): boolean {
  const kind = classifyPoolTimeout(err);
  return (
    kind === "connection_timeout" ||
    kind === "pool_exhausted" ||
    kind === "prisma_timed_out" ||
    kind === "pool_ended"
  );
}

function extractErrorCode(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function buildRemediationHints(kind: PoolTimeoutKind): string[] {
  switch (kind) {
    case "pool_exhausted":
      return [
        "Lower PRISMA_POOL_MAX per isolate (serverless default ≤3).",
        "Prefer DATABASE_POOL_URL (Neon pooled) over direct connections.",
        "Shorten idleTimeoutMillis to recycle stale clients faster.",
      ];
    case "connection_timeout":
      return [
        "Increase PRISMA_POOL_CONNECT_MS carefully (≤15000).",
        "Verify Neon compute is not suspended; warm with SELECT 1.",
        "Confirm egress / SSL params on DATABASE_URL.",
      ];
    case "prisma_timed_out":
      return [
        "Reduce concurrent Prisma queries per request path.",
        "Ensure withPrisma() is used so disconnects trigger reset.",
        "Cap pool max and enable allowExitOnIdle for serverless.",
      ];
    case "pool_ended":
      return [
        "Avoid calling pool.end() mid-request; use resetPrismaClient().",
        "Coalesce concurrent resets via the shared resetInFlight lock.",
      ];
    default:
      return [
        "Reset Prisma client + pg Pool and retry once.",
        "Dispatch Meta-SRE dry-run for pool config review.",
      ];
  }
}

export function buildPoolAutoHealPayload(input: {
  err: unknown;
  label: string;
  workspaceId?: string | null;
  generation?: number | null;
}): PoolAutoHealPayload {
  const timeoutKind = classifyPoolTimeout(input.err) ?? "unknown_disconnect";
  const message =
    input.err instanceof Error ? input.err.message : String(input.err);

  return {
    protocol: POOL_MONITOR_PROTOCOL,
    kind: "db.pool_timeout",
    timeoutKind,
    label: input.label,
    message: message.slice(0, 2_000),
    code: extractErrorCode(input.err),
    generation: input.generation ?? null,
    workspaceId: input.workspaceId ?? null,
    at: new Date().toISOString(),
    suggestedRemediation: buildRemediationHints(timeoutKind),
  };
}

function buildPoolConfigRemediationFile(payload: PoolAutoHealPayload): {
  path: string;
  content: string;
  encoding: "utf-8";
} {
  // Dry-run Meta-SRE patch: document-only remediation note (never live-pushed
  // from this path — executeMetaEvolutionRun commit gate stays closed).
  const content = [
    `# Pool failover auto-heal note`,
    `# Generated by ${POOL_MONITOR_PROTOCOL}`,
    `# kind=${payload.timeoutKind} label=${payload.label}`,
    `# at=${payload.at}`,
    ``,
    `## Incident`,
    ``,
    `- message: ${payload.message.replace(/\n/g, " ").slice(0, 500)}`,
    `- code: ${payload.code ?? "n/a"}`,
    `- generation: ${payload.generation ?? "n/a"}`,
    ``,
    `## Suggested remediation`,
    ``,
    ...payload.suggestedRemediation.map((line) => `- ${line}`),
    ``,
    `## Guardrails`,
    ``,
    `- Keep PRISMA_POOL_MAX ≤ 10 (prod default 3).`,
    `- Prefer DATABASE_POOL_URL for Neon serverless.`,
    `- Never raise connectionTimeoutMillis above 15000 without review.`,
    ``,
  ].join("\n");

  return {
    path: "docs/ops/pool-failover-autoheal.md",
    content,
    encoding: "utf-8",
  };
}

/**
 * Dispatch a dry-run Meta-SRE auto-heal for a pool timeout.
 * Coalesces concurrent dispatches and applies a short cooldown.
 */
export async function dispatchPoolAutoHealToMetaSre(input: {
  err: unknown;
  label: string;
  workspaceId?: string | null;
  generation?: number | null;
}): Promise<PoolAutoHealDispatchResult> {
  const payload = buildPoolAutoHealPayload({
    ...input,
    generation: input.generation ?? getPrismaGeneration(),
  });

  const now = Date.now();
  if (
    globals.__ssPoolHealLastAt &&
    now - globals.__ssPoolHealLastAt < HEAL_COOLDOWN_MS
  ) {
    return {
      dispatched: false,
      skippedReason: "cooldown",
      payload,
      metaSre: null,
    };
  }

  if (globals.__ssPoolHealInFlight) {
    return globals.__ssPoolHealInFlight;
  }

  globals.__ssPoolHealInFlight = (async () => {
    globals.__ssPoolHealLastAt = Date.now();
    const runId = `pool-heal-${randomBytes(8).toString("hex")}`;
    const file = buildPoolConfigRemediationFile(payload);

    try {
      const metaSre = await executeMetaEvolutionRun({
        request: {
          workspaceId: payload.workspaceId,
          runId,
          trigger: "pool_failover",
          severity: "critical",
          title: `DB pool failover: ${payload.timeoutKind}`,
          summary: [
            `Pool monitor detected ${payload.timeoutKind} during ${payload.label}.`,
            payload.message.slice(0, 800),
            `Remediation: ${payload.suggestedRemediation.join("; ")}`,
          ]
            .join("\n")
            .slice(0, 4_000),
          targetFiles: [file],
          dryRun: true,
          forceSandboxFail: false,
        },
      });

      // Best-effort incident ledger — never block failover on write failure.
      try {
        const db = getPrisma();
        await db.systemIncident.create({
          data: {
            workspaceId: payload.workspaceId,
            severity: "CRITICAL",
            status: "MITIGATING",
            title: `DB pool failover: ${payload.timeoutKind}`.slice(0, 255),
            summary: payload.message.slice(0, 4_000),
            source: "pool_monitor",
            correlationId: runId,
            metadataJson: {
              protocol: payload.protocol,
              timeoutKind: payload.timeoutKind,
              label: payload.label,
              code: payload.code,
              generation: payload.generation,
              metaSreOk: metaSre.ok,
              suggestedRemediation: payload.suggestedRemediation,
            },
          },
        });
      } catch (incidentErr) {
        console.warn(`${LOG_PREFIX} system incident write skipped`, {
          message:
            incidentErr instanceof Error
              ? incidentErr.message
              : String(incidentErr),
        });
      }

      console.warn(`${LOG_PREFIX} meta-sre auto-heal dispatched`, {
        runId,
        ok: metaSre.ok,
        timeoutKind: payload.timeoutKind,
        label: payload.label,
      });

      return {
        dispatched: true,
        payload,
        metaSre,
      };
    } catch (dispatchErr) {
      console.error(`${LOG_PREFIX} meta-sre dispatch failed`, {
        message:
          dispatchErr instanceof Error
            ? dispatchErr.message
            : String(dispatchErr),
      });
      return {
        dispatched: false,
        skippedReason:
          dispatchErr instanceof Error
            ? dispatchErr.message
            : "meta_sre_dispatch_failed",
        payload,
        metaSre: null,
      };
    } finally {
      globals.__ssPoolHealInFlight = null;
    }
  })();

  return globals.__ssPoolHealInFlight;
}

/**
 * Lightweight readiness probe used by health / SRE surfaces.
 */
export async function probePoolHealth(): Promise<PoolHealthSnapshot> {
  const checkedAt = new Date().toISOString();
  const start = Date.now();
  try {
    const db = getPrisma();
    await db.$queryRaw`SELECT 1`;
    return {
      ok: true,
      latencyMs: Date.now() - start,
      generation: getPrismaGeneration(),
      checkedAt,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      generation: null,
      checkedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resilient DB wrapper: retries on pool timeouts, resets the pool, and
 * dispatches Meta-SRE auto-heal payloads (fire-and-forget after first hit).
 */
export async function withPoolFailover<T>(
  operation: (db: PrismaClient) => Promise<T>,
  label = "query",
  options?: { workspaceId?: string | null }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_FAILOVER_RETRIES; attempt += 1) {
    const db = getPrisma();
    try {
      return await operation(db);
    } catch (err) {
      lastError = err;
      const poolTimeout = isPoolTimeoutError(err);
      const disconnect = isPrismaDisconnectError(err);

      if ((!poolTimeout && !disconnect) || attempt >= MAX_FAILOVER_RETRIES) {
        throw err;
      }

      console.warn(`${LOG_PREFIX} failover during ${label}`, {
        attempt: attempt + 1,
        poolTimeout,
        message: err instanceof Error ? err.message : String(err),
      });

      if (poolTimeout) {
        // Fire-and-forget — do not block the retry path on Meta-SRE sandbox.
        void dispatchPoolAutoHealToMetaSre({
          err,
          label,
          workspaceId: options?.workspaceId,
        });
      }

      await resetPrismaClient(
        poolTimeout ? `pool_timeout:${label}` : `reconnect:${label}`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${LOG_PREFIX} operation failed: ${label}`);
}
