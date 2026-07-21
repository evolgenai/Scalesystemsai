/**
 * GET /api/admin/chaos
 * Super-Admin summary of recent chaos runs + circuit breaker health.
 */

import { resolveRequestUser } from "@/lib/auth/requestUser";
import { listRecentChaosRuns } from "@/lib/chaos/runStore";
import { getCircuitBreakerHealth } from "@/lib/db/poolMonitor";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";
import { RATE_LIMIT_PRESETS } from "@/lib/security/rateLimiter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireSuperAdmin(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.isSuperAdmin || profile.role !== "SUPER_ADMIN") {
    return {
      ok: false as const,
      response: apiError(
        "Forbidden. SUPER_ADMIN session required.",
        "SUPER_ADMIN_REQUIRED",
        403
      ),
    };
  }
  return { ok: true as const, profile };
}

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const recentRuns = listRecentChaosRuns(20);
  const circuit = getCircuitBreakerHealth();

  let recentIncidents: Array<{
    id: string;
    kind: string;
    severity: string;
    message: string;
    healed: boolean;
    createdAt: Date;
  }> = [];

  try {
    recentIncidents = await withPrisma(
      (db) =>
        db.systemIncident.findMany({
          where: {
            kind: { in: ["CHAOS_SWARM", "CHAOS_POOL", "POOL_TIMEOUT", "POOL_DISCONNECT"] },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
          select: {
            id: true,
            kind: true,
            severity: true,
            message: true,
            healed: true,
            createdAt: true,
          },
        }),
      "admin.chaos.incidents"
    );
  } catch {
    recentIncidents = [];
  }

  const swarmRuns = recentRuns.filter((r) => r.action === "SWARM_BURST");
  const poolRuns = recentRuns.filter(
    (r) => r.action === "SIMULATE_POOL_EXHAUSTION"
  );

  return apiSuccess({
    data: {
      checkedAt: new Date().toISOString(),
      endpoints: {
        simulate: { method: "POST", path: "/api/admin/chaos/simulate" },
        stress: { method: "GET|POST", path: "/api/admin/chaos/stress" },
        probe: { method: "POST", path: "/api/v1/webhooks/chaos-probe" },
      },
      rateLimitBounds: {
        webhookChaos: {
          limit: 40,
          windowMs: 60_000,
          bucket: "webhook-chaos",
        },
        billingWebhooks: RATE_LIMIT_PRESETS.billing,
        swarmAgents: RATE_LIMIT_PRESETS.swarm,
        maxConcurrentRequests: 1_000,
        minConcurrentRequests: 1,
      },
      circuitBreaker: circuit,
      summary: {
        totalRuns: recentRuns.length,
        swarmBursts: swarmRuns.length,
        poolExhaustionDrills: poolRuns.length,
        lastRunAt: recentRuns[0]?.finishedAt ?? null,
      },
      recentRuns,
      recentIncidents: recentIncidents.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
      })),
      admin: {
        id: guard.profile.id,
        email: guard.profile.email,
      },
    },
  });
}
