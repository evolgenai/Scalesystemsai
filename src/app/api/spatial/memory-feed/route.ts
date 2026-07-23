/**
 * GET /api/spatial/memory-feed
 * Spatial HUD diagnostics — top 10 execution steps, auto-patches,
 * and Sentry resolutions (optional node_type filter).
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  DEFAULT_FEED_LIMIT,
  buildSpatialMemoryFeed,
} from "@/lib/spatial/memoryFeed";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import { textureCacheHeaders } from "@/lib/theme/textureMatrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const QuerySchema = z.object({
  node_type: z.string().trim().min(1).max(64).optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  workspaceId: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    node_type:
      url.searchParams.get("node_type") ??
      url.searchParams.get("nodeType") ??
      undefined,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    workspaceId: url.searchParams.get("workspaceId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid memory-feed query.",
      "INVALID_QUERY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/memory-feed",
    source: "api",
    extra: { node_type: parsed.data.node_type ?? null },
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const feed = await buildSpatialMemoryFeed({
        nodeType: parsed.data.node_type,
        userId: profile.id,
        workspaceId: parsed.data.workspaceId,
        sessionId: parsed.data.sessionId,
        limit: parsed.data.limit ?? DEFAULT_FEED_LIMIT,
      });

      return apiSuccess(
        {
          feed,
          auth: { userId: profile.id },
        },
        200,
        textureCacheHeaders()
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Memory feed failed.",
      "MEMORY_FEED_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}
