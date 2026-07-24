/**
 * GET /api/governance/breakers
 * Circuit-breaker / pool-governance snapshot (Sprint 56/57).
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import {
  getCircuitBreakerHealth,
  getPoolMonitorSnapshot,
} from "@/lib/db/poolMonitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/governance/breakers",
    source: "api",
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const circuit = getCircuitBreakerHealth();
      const pool = getPoolMonitorSnapshot();

      const breakers = [
        {
          id: "prisma-pool",
          name: "Prisma connection pool",
          state: circuit.state,
          healthy: circuit.state === "CLOSED",
          failureCount: circuit.failureCount,
          successCount: circuit.successCount,
          openedAt: circuit.openedAt,
          lastFailureAt: circuit.lastFailureAt,
          lastHealAt: circuit.lastHealAt,
          halfOpenProbes: circuit.halfOpenProbes,
          totalIntercepts: circuit.totalIntercepts,
          totalHeals: circuit.totalHeals,
        },
      ];

      return apiSuccess({
        breakers,
        pool,
        governance: {
          generatedAt: new Date().toISOString(),
          openCount: breakers.filter((b) => b.state === "OPEN").length,
          halfOpenCount: breakers.filter((b) => b.state === "HALF_OPEN").length,
          closedCount: breakers.filter((b) => b.state === "CLOSED").length,
        },
      });
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Breaker snapshot failed.",
      "BREAKERS_FAILED",
      500
    );
  }
}
