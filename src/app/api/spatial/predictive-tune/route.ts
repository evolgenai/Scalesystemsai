/**
 * GET/POST /api/spatial/predictive-tune
 * Analyze node telemetry drift; auto-patch when failure risk > threshold.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import {
  PredictiveTuneRequestSchema,
  runPredictiveTune,
} from "@/lib/spatial/predictiveTune";
import { textureCacheHeaders } from "@/lib/theme/textureMatrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

function parseQuery(request: Request) {
  const url = new URL(request.url);
  return PredictiveTuneRequestSchema.safeParse({
    workspaceId:
      url.searchParams.get("workspaceId") ??
      request.headers.get("x-workspace-id") ??
      undefined,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    seed: url.searchParams.get("seed") ?? undefined,
    nodeId: url.searchParams.get("nodeId") ?? undefined,
    nodeType: url.searchParams.get("nodeType") ?? undefined,
    riskThreshold: url.searchParams.get("riskThreshold")
      ? Number(url.searchParams.get("riskThreshold"))
      : undefined,
    autoPatch: url.searchParams.get("autoPatch") !== "false",
    limit: url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 40,
  });
}

export async function GET(request: Request) {
  const parsed = parseQuery(request);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ??
        "workspaceId and sessionId are required.",
      "INVALID_QUERY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/predictive-tune",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await runPredictiveTune({
        ...parsed.data,
        userId: profile.id,
        // GET defaults to analysis-only unless autoPatch=true explicitly.
        autoPatch:
          new URL(request.url).searchParams.get("autoPatch") === "true",
      });
      return apiSuccess(
        {
          tune: result,
          dispatchTargets: result.dispatchTargets,
          patchesTriggered: result.patchesTriggered,
        },
        200,
        {
          ...textureCacheHeaders(),
          "x-workspace-bound": result.workspaceId,
          "x-tune-id": result.tuneId,
          "x-patches-triggered": String(result.patchesTriggered),
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Predictive tune failed.",
      "PREDICTIVE_TUNE_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}

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

  const headerWorkspace =
    request.headers.get("x-workspace-id")?.trim() || undefined;
  const merged =
    raw && typeof raw === "object"
      ? {
          ...(raw as Record<string, unknown>),
          workspaceId:
            (raw as { workspaceId?: string }).workspaceId ?? headerWorkspace,
        }
      : raw;

  const parsed = PredictiveTuneRequestSchema.safeParse(merged);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid predictive-tune payload.",
      "INVALID_BODY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/predictive-tune",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await runPredictiveTune({
        ...parsed.data,
        userId: parsed.data.userId ?? profile.id,
      });
      return apiSuccess(
        {
          tune: result,
          dispatchTargets: result.dispatchTargets,
          patchesTriggered: result.patchesTriggered,
          auth: { userId: profile.id },
        },
        200,
        {
          ...textureCacheHeaders(),
          "x-workspace-bound": result.workspaceId,
          "x-tune-id": result.tuneId,
          "x-patches-triggered": String(result.patchesTriggered),
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Predictive tune failed.",
      "PREDICTIVE_TUNE_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}
