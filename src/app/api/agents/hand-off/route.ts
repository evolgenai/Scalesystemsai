/**
 * POST /api/agents/hand-off
 * Swarm delegation: Sentry error ID → memory recall → auto-patch payload.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  HandOffRequestSchema,
  runAgentHandOff,
} from "@/lib/agents/handOff";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import { textureCacheHeaders } from "@/lib/theme/textureMatrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError(
      "Invalid JSON body.",
      "INVALID_JSON",
      400,
      textureCacheHeaders()
    );
  }

  const parsed = HandOffRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid hand-off payload.",
      "INVALID_BODY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/agents/hand-off",
    source: "api",
    extra: {
      sentryErrorId: parsed.data.sentryErrorId,
      fromAgentId: parsed.data.fromAgentId,
    },
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await runAgentHandOff({
        ...parsed.data,
        userId: profile.id,
      });

      return apiSuccess(
        {
          handOff: result,
          autoPatch: result.autoPatch,
          steps: result.steps,
          auth: { userId: profile.id },
        },
        200,
        {
          ...textureCacheHeaders(),
          "x-hand-off-id": result.handOffId,
          "x-trace-id": result.traceId,
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Agent hand-off failed.",
      "HAND_OFF_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}

/** Lightweight discovery for Agent B / UE5 HUD tooling. */
export async function GET() {
  return apiSuccess({
    endpoint: "/api/agents/hand-off",
    method: "POST",
    body: {
      sentryErrorId: "string (required)",
      sessionId: "string (required)",
      fromAgentId: "string (default agent-a)",
      toAgentId: "string (default meta-sre)",
      issueTitle: "string (optional)",
    },
    pipeline: [
      "1. Receive Sentry error ID",
      "2. Query persistent memory for prior fix patterns",
      "3. Return structured auto-patch for virtual deploy",
    ],
  });
}
