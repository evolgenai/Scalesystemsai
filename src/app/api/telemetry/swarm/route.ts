/**
 * GET/POST /api/telemetry/swarm
 * Live swarm telemetry: sub-agent statuses, tokens, latency, hand-off traces.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import {
  getSwarmTelemetry,
  recordHandOffTrace,
  recordSwarmAgentStatus,
  recordTokenUsage,
  RecordHandOffTraceSchema,
  RecordSwarmAgentStatusSchema,
  RecordTokenUsageSchema,
} from "@/lib/telemetry/swarmTelemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const SwarmQuerySchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const SwarmIngestSchema = z.union([
  z
    .object({ type: z.literal("status") })
    .merge(RecordSwarmAgentStatusSchema),
  z.object({ type: z.literal("tokens") }).merge(RecordTokenUsageSchema),
  z.object({ type: z.literal("hand_off") }).merge(RecordHandOffTraceSchema),
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = SwarmQuerySchema.safeParse({
    workspaceId:
      url.searchParams.get("workspaceId") ??
      request.headers.get("x-workspace-id") ??
      undefined,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ??
        "workspaceId and sessionId are required for swarm telemetry.",
      "INVALID_QUERY",
      400
    );
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/telemetry/swarm",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const snapshot = await getSwarmTelemetry(parsed.data);
      return apiSuccess(
        {
          swarm: snapshot,
          agents: snapshot.agents,
          totals: snapshot.totals,
          handOffTraces: snapshot.handOffTraces,
        },
        200,
        {
          "x-swarm-active": String(snapshot.totals.activeAgents),
          "x-swarm-tokens": String(snapshot.totals.tokensConsumed),
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Swarm telemetry failed.",
      "SWARM_TELEMETRY_FAILED",
      500
    );
  }
}

/** Ingest status / token / hand-off events for the live board (tenant-scoped). */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
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

  const parsed = SwarmIngestSchema.safeParse(merged);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid swarm ingest payload.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  const workspaceId =
    "workspaceId" in body
      ? (body as { workspaceId?: string | null }).workspaceId
      : undefined;
  const sessionId =
    "sessionId" in body
      ? (body as { sessionId?: string | null }).sessionId
      : undefined;

  if (body.type === "status" || body.type === "tokens" || body.type === "hand_off") {
    if (!workspaceId?.trim() || !sessionId?.trim()) {
      return apiError(
        "workspaceId and sessionId are required on swarm ingest.",
        "TENANT_REQUIRED",
        400
      );
    }
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/telemetry/swarm",
    source: "api",
    tenantId: workspaceId ?? undefined,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      if (body.type === "status") {
        const agent = recordSwarmAgentStatus(body);
        return apiSuccess({ recorded: "status", agent });
      }
      if (body.type === "tokens") {
        const event = recordTokenUsage(body);
        return apiSuccess({ recorded: "tokens", event });
      }
      const trace = recordHandOffTrace(body);
      return apiSuccess({ recorded: "hand_off", trace });
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Swarm ingest failed.",
      "SWARM_INGEST_FAILED",
      500
    );
  }
}
