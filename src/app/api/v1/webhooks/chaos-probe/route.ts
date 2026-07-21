/**
 * Lightweight inbound webhook chaos probe.
 * POST /api/v1/webhooks/chaos-probe
 *
 * Authenticated via short-lived x-chaos-swarm-token issued by /api/admin/chaos/simulate.
 * No gas deduction / workflow dispatch — rate-limit stress surface only.
 */

import { consumeChaosProbeToken } from "@/lib/chaos/runStore";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = request.headers.get("x-chaos-swarm-token")?.trim() ?? "";
  if (!token || !consumeChaosProbeToken(token)) {
    return apiError(
      "Invalid or expired chaos swarm token.",
      "CHAOS_PROBE_UNAUTHORIZED",
      401
    );
  }

  let index: number | null = null;
  let runId: string | null = null;
  try {
    const body = (await request.json()) as {
      index?: number;
      runId?: string;
    };
    index = typeof body.index === "number" ? body.index : null;
    runId = typeof body.runId === "string" ? body.runId : null;
  } catch {
    /* empty body ok */
  }

  return apiSuccess({
    data: {
      probe: true,
      route: "/api/v1/webhooks/chaos-probe",
      index,
      runId,
      receivedAt: new Date().toISOString(),
    },
  });
}
