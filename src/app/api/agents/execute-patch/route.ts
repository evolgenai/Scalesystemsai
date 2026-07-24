/**
 * POST /api/agents/execute-patch
 * Virtual sandbox self-heal execution + memory/Sentry success signal.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  ExecutePatchRequestSchema,
  executeAutoPatch,
} from "@/lib/agents/executePatch";
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

  const parsed = ExecutePatchRequestSchema.safeParse(merged);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid execute-patch payload.",
      "INVALID_BODY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/agents/execute-patch",
    source: "api",
    tenantId: parsed.data.workspaceId,
    extra: {
      sentryErrorId: parsed.data.sentryErrorId,
      patchId: parsed.data.autoPatch.patchId,
    },
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await executeAutoPatch({
        ...parsed.data,
        userId: profile.id,
      });

      return apiSuccess(
        {
          execution: result,
          auth: { userId: profile.id },
        },
        200,
        {
          ...textureCacheHeaders(),
          "x-execution-id": result.executionId,
          "x-trace-id": result.traceId,
          "x-patch-status": result.status,
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Patch execution failed.",
      "EXECUTE_PATCH_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}

export async function GET() {
  return apiSuccess({
    endpoint: "/api/agents/execute-patch",
    method: "POST",
    mode: "virtual",
    body: {
      sentryErrorId: "string",
      sessionId: "string",
      workspaceId: "string (or x-workspace-id)",
      autoPatch: "AutoPatchPayload from /api/agents/hand-off",
    },
  });
}
