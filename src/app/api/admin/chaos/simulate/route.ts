/**
 * POST /api/admin/chaos/simulate
 * Super-Admin chaos simulator — SWARM_BURST | SIMULATE_POOL_EXHAUSTION.
 */

import { z } from "zod";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  clampConcurrent,
  MAX_CONCURRENT_REQUESTS,
  MIN_CONCURRENT_REQUESTS,
  runPoolExhaustionSimulation,
  runSwarmBurst,
} from "@/lib/chaos/swarmHarness";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { enforceRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rateLimiter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SimulateSchema = z.object({
  action: z.enum(["SWARM_BURST", "SIMULATE_POOL_EXHAUSTION"]),
  concurrentRequests: z
    .number()
    .int()
    .min(MIN_CONCURRENT_REQUESTS)
    .max(MAX_CONCURRENT_REQUESTS),
});

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

export async function POST(request: Request) {
  // Bound chaos control-plane abuse (independent of webhook probe bucket).
  const rl = enforceRateLimit(request, {
    ...RATE_LIMIT_PRESETS.swarm,
    bucket: "admin-chaos",
    limit: 10,
    windowMs: 60_000,
  });
  if (rl.blocked) return rl.blocked;

  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = SimulateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ??
        `Invalid body. concurrentRequests must be ${MIN_CONCURRENT_REQUESTS}–${MAX_CONCURRENT_REQUESTS}.`,
      "INVALID_BODY",
      400
    );
  }

  const { action } = parsed.data;
  const concurrentRequests = clampConcurrent(parsed.data.concurrentRequests);

  try {
    if (action === "SWARM_BURST") {
      const result = await runSwarmBurst(request, concurrentRequests);
      return apiSuccess(
        {
          data: result,
          admin: { id: guard.profile.id, email: guard.profile.email },
        },
        200,
        rl.headers
      );
    }

    const result = await runPoolExhaustionSimulation(concurrentRequests);
    return apiSuccess(
      {
        data: result,
        admin: { id: guard.profile.id, email: guard.profile.email },
      },
      200,
      rl.headers
    );
  } catch (err) {
    // Pool recovery harness must never take down the Node isolate.
    console.error("[api/admin/chaos/simulate] failed (process alive):", err);
    return apiError(
      err instanceof Error ? err.message : "Chaos simulation failed.",
      "CHAOS_SIMULATION_FAILED",
      503,
      rl.headers
    );
  }
}
