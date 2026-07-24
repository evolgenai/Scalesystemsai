/**
 * GET /api/spatial/node-health
 * Classify spatial nodes as healthy | warning | critical from Sentry + exec errors.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import {
  NodeHealthQuerySchema,
  analyzeNodeHealth,
} from "@/lib/spatial/nodeHealth";
import { textureCacheHeaders } from "@/lib/theme/textureMatrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = NodeHealthQuerySchema.safeParse({
    workspaceId:
      url.searchParams.get("workspaceId") ??
      request.headers.get("x-workspace-id") ??
      undefined,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    seed: url.searchParams.get("seed") ?? undefined,
    nodeId: url.searchParams.get("nodeId") ?? undefined,
    nodeType: url.searchParams.get("nodeType") ?? undefined,
    limit: url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 40,
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid node-health query.",
      "INVALID_QUERY",
      400,
      textureCacheHeaders()
    );
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/node-health",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const health = await analyzeNodeHealth(parsed.data);
      return apiSuccess(
        {
          health,
          summary: health.summary,
          nodes: health.nodes,
        },
        200,
        {
          ...textureCacheHeaders(),
          "x-node-critical": String(health.summary.critical),
          "x-node-warning": String(health.summary.warning),
          ...(parsed.data.workspaceId
            ? { "x-workspace-bound": parsed.data.workspaceId }
            : {}),
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Node health analysis failed.",
      "NODE_HEALTH_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
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

  const parsed = NodeHealthQuerySchema.safeParse(merged);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid node-health payload.",
      "INVALID_BODY",
      400,
      textureCacheHeaders()
    );
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/node-health",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const health = await analyzeNodeHealth(parsed.data);
      return apiSuccess({ health, summary: health.summary, nodes: health.nodes });
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Node health analysis failed.",
      "NODE_HEALTH_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}
