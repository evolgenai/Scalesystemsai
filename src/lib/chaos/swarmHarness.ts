/**
 * High-concurrency swarm + pool-recovery chaos harness.
 */

import {
  buildLatencyDistribution,
  consumeChaosProbeToken,
  issueChaosProbeToken,
  rememberChaosRun,
  type PoolExhaustionResult,
  type SwarmBurstResult,
} from "@/lib/chaos/runStore";
import {
  createControlledP2024,
  getCircuitBreakerHealth,
  interceptPoolFailure,
} from "@/lib/db/poolMonitor";
import { withPrisma } from "@/lib/prisma";
import {
  checkRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rateLimiter";

export const CHAOS_PROBE_PATH = "/api/v1/webhooks/chaos-probe";
export const MAX_CONCURRENT_REQUESTS = 1_000;
export const MIN_CONCURRENT_REQUESTS = 1;

export function clampConcurrent(n: number): number {
  if (!Number.isFinite(n)) return MIN_CONCURRENT_REQUESTS;
  return Math.min(
    MAX_CONCURRENT_REQUESTS,
    Math.max(MIN_CONCURRENT_REQUESTS, Math.floor(n))
  );
}

/**
 * One inbound-webhook probe hop: middleware rate-limit → probe token gate.
 * In-process to avoid Next.js same-isolate self-fetch deadlocks under burst.
 */
async function dispatchInboundWebhookProbe(input: {
  index: number;
  runId: string;
  token: string;
  workspaceKey: string;
}): Promise<{ status: number; latencyMs: number }> {
  const start = Date.now();
  const req = new Request(`http://chaos.local${CHAOS_PROBE_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-chaos-swarm-token": input.token,
      "x-workspace-key": input.workspaceKey,
      "user-agent": "ScaleSystems-ChaosSwarm/1.0",
    },
    body: JSON.stringify({
      chaos: true,
      runId: input.runId,
      index: input.index,
      ts: Date.now(),
    }),
  });

  const verdict = checkRateLimit(req, RATE_LIMIT_PRESETS.webhookChaos);
  if (!verdict.allowed) {
    return { status: 429, latencyMs: Date.now() - start };
  }

  if (!consumeChaosProbeToken(input.token)) {
    return { status: 401, latencyMs: Date.now() - start };
  }

  // Yield so Promise.allSettled concurrency is real under the event loop.
  await Promise.resolve();
  return { status: 200, latencyMs: Date.now() - start };
}

/**
 * SWARM_BURST — Promise.allSettled across inbound webhook probe routes.
 * Measures 200 vs 429 ratios + latency distribution under webhookChaos bounds.
 */
export async function runSwarmBurst(
  _request: Request,
  concurrentRequests: number
): Promise<SwarmBurstResult> {
  const n = clampConcurrent(concurrentRequests);
  const runId = `swarm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const token = issueChaosProbeToken(runId);
  const workspaceKey = `chaos-swarm:${runId}`;
  const startedAt = new Date();
  const t0 = Date.now();

  const settled = await Promise.allSettled(
    Array.from({ length: n }, (_, i) =>
      dispatchInboundWebhookProbe({
        index: i,
        runId,
        token,
        workspaceKey,
      })
    )
  );

  const finishedAt = new Date();
  const statusCounts: Record<string, number> = {};
  const latencies: number[] = [];
  let ok200 = 0;
  let rateLimited429 = 0;
  let other = 0;

  for (const item of settled) {
    if (item.status !== "fulfilled") {
      other += 1;
      statusCounts.error = (statusCounts.error ?? 0) + 1;
      continue;
    }
    const { status, latencyMs } = item.value;
    latencies.push(latencyMs);
    const key = String(status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    if (status === 200) ok200 += 1;
    else if (status === 429) rateLimited429 += 1;
    else other += 1;
  }

  const total = Math.max(1, n);
  const result: SwarmBurstResult = {
    action: "SWARM_BURST",
    runId,
    concurrentRequests: n,
    targetPath: CHAOS_PROBE_PATH,
    statusCounts,
    ok200,
    rateLimited429,
    other,
    ratio200: Math.round((ok200 / total) * 10_000) / 100,
    ratio429: Math.round((rateLimited429 / total) * 10_000) / 100,
    latency: buildLatencyDistribution(latencies),
    durationMs: Date.now() - t0,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };

  rememberChaosRun({
    runId,
    action: "SWARM_BURST",
    concurrentRequests: n,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    summary: result,
  });

  withPrisma(
    (db) =>
      db.systemIncident.create({
        data: {
          kind: "CHAOS_SWARM",
          severity: "medium",
          message: `SWARM_BURST n=${n} 200=${ok200} 429=${rateLimited429}`,
          route: CHAOS_PROBE_PATH,
          metadata: {
            runId,
            ok200,
            rateLimited429,
            other,
            ratio200: result.ratio200,
            ratio429: result.ratio429,
            latency: result.latency,
          } as import("@prisma/client").Prisma.InputJsonValue,
          healed: true,
          healedAt: new Date(),
        },
      }),
    "chaos.swarm.audit"
  ).catch(() => undefined);

  return result;
}

/**
 * SIMULATE_POOL_EXHAUSTION — controlled P2024 → poolMonitor intercept + heal.
 * Guarantees the Node process does not crash.
 */
export async function runPoolExhaustionSimulation(
  concurrentRequests: number
): Promise<PoolExhaustionResult> {
  const n = clampConcurrent(concurrentRequests);
  const runId = `pool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date();
  const t0 = Date.now();

  const synthetic = createControlledP2024(
    `Timed out fetching a new connection from the connection pool. [chaos runId=${runId}]`
  );

  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(n, 32) }, (_, i) =>
      interceptPoolFailure(synthetic, `chaos.pool_exhaustion[${i}]`, {
        force: true,
        kind: "CHAOS_POOL",
      })
    )
  );

  const firstOk = settled.find(
    (
      s
    ): s is PromiseFulfilledResult<
      Awaited<ReturnType<typeof interceptPoolFailure>>
    > => s.status === "fulfilled"
  );

  const intercept = firstOk?.value ?? {
    intercepted: false,
    healed: false,
    incidentId: null,
    circuitState: getCircuitBreakerHealth().state,
    processAlive: true as const,
  };

  let postHealOk = false;
  try {
    await withPrisma(async (db) => {
      await db.$queryRaw`SELECT 1`;
    }, "chaos.pool_exhaustion.post-heal");
    postHealOk = true;
  } catch {
    postHealOk = false;
  }

  const finishedAt = new Date();
  const circuit = getCircuitBreakerHealth();

  const result: PoolExhaustionResult = {
    action: "SIMULATE_POOL_EXHAUSTION",
    runId,
    concurrentRequests: n,
    intercepted: intercept.intercepted,
    healed: intercept.healed && postHealOk,
    incidentId: intercept.incidentId,
    circuitState: circuit.state,
    processAlive: true,
    durationMs: Date.now() - t0,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    verification: {
      poolMonitorIntercepted: intercept.intercepted,
      systemIncidentLogged: Boolean(intercept.incidentId),
      autoHealed: intercept.healed && postHealOk,
      nodeProcessCrashed: false,
    },
  };

  rememberChaosRun({
    runId,
    action: "SIMULATE_POOL_EXHAUSTION",
    concurrentRequests: n,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    summary: result,
  });

  return result;
}
