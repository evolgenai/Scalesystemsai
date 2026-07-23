/**
 * POST /api/memory/store — persist Meta-SRE execution / patch / Sentry memories
 * GET  /api/memory/store — recall across sessions (query filters)
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  MemoryKindSchema,
  recallAgentMemory,
  storeAgentMemory,
} from "@/lib/agents/agentMemoryStore";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import { textureCacheHeaders } from "@/lib/theme/textureMatrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const StoreBodySchema = z
  .object({
    kind: MemoryKindSchema,
    sessionId: z.string().trim().min(1).max(128),
    agentId: z.string().trim().min(1).max(128).optional(),
    workspaceId: z.string().trim().min(1).max(128).optional().nullable(),
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(4000),
    payload: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(32).optional(),
    sentryIssueId: z.string().trim().min(1).max(128).optional().nullable(),
    traceId: z.string().trim().min(1).max(128).optional().nullable(),
    source: z.enum(["api", "server_action", "agent", "system"]).optional(),
  })
  .strict();

const RecallQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(128).optional(),
  agentId: z.string().trim().min(1).max(128).optional(),
  kind: MemoryKindSchema.optional(),
  workspaceId: z.string().trim().min(1).max(128).optional(),
  q: z.string().trim().min(1).max(240).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = RecallQuerySchema.safeParse({
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    agentId: url.searchParams.get("agentId") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    workspaceId: url.searchParams.get("workspaceId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid recall query.",
      "INVALID_QUERY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/memory/store",
    source: "api",
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await recallAgentMemory({
        ...parsed.data,
        userId: profile.id,
      });

      return apiSuccess(
        {
          memories: result.entries,
          recalledContext: result.recalledContext,
          source: result.source,
          count: result.entries.length,
          auth: { userId: profile.id },
        },
        200,
        textureCacheHeaders()
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Memory recall failed.",
      "MEMORY_RECALL_FAILED",
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
    return apiError("Invalid JSON body.", "INVALID_JSON", 400, textureCacheHeaders());
  }

  const parsed = StoreBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid memory payload.",
      "INVALID_BODY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/memory/store",
    source: "api",
    extra: { kind: parsed.data.kind },
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const entry = await storeAgentMemory({
        ...parsed.data,
        userId: profile.id,
        workspaceId: parsed.data.workspaceId ?? null,
      });

      return apiSuccess(
        {
          stored: true,
          memory: entry,
          auth: { userId: profile.id },
        },
        201,
        textureCacheHeaders()
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Memory store failed.",
      "MEMORY_STORE_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}
