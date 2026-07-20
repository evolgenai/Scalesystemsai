import { z } from "zod";
import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateDenied,
} from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiFail, apiOk } from "@/lib/http/apiEnvelope";
import {
  appendAuditLog,
  appendAuditLogs,
  listAuditLogs,
  serializeAuditLog,
} from "@/lib/telemetry/auditLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ActorTypeSchema = z.enum(["user", "api_key", "system", "agent"]);
const OutcomeSchema = z.enum(["success", "denied", "failed"]);

const AuditEventSchema = z
  .object({
    action: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(
        /^[a-z][a-z0-9_.-]*$/i,
        "action must be a dotted identifier (e.g. auth.api_key.rotate)"
      ),
    actorType: ActorTypeSchema,
    actorId: z.string().trim().min(1).max(256).optional().nullable(),
    resource: z.string().trim().min(1).max(128).optional().nullable(),
    resourceId: z.string().trim().min(1).max(256).optional().nullable(),
    outcome: OutcomeSchema.optional(),
    ip: z.string().trim().max(64).optional().nullable(),
    userAgent: z.string().trim().max(512).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const PostBodySchema = z.union([
  AuditEventSchema.extend({
    workspaceId: z.string().uuid().optional().nullable(),
  }),
  z
    .object({
      workspaceId: z.string().uuid().optional().nullable(),
      events: z.array(AuditEventSchema).min(1).max(100),
    })
    .strict(),
]);

function gateFail(denied: WorkspaceGateDenied) {
  return apiFail(denied.message, denied.code, denied.status, {
    "x-workspace-bound": "denied",
  });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

/**
 * GET /api/telemetry/audit
 * Cursor-paginated tenant compliance audit feed. Requires x-workspace-key.
 */
export async function GET(request: Request) {
  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) return gateFail(gate);

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const sinceRaw = url.searchParams.get("since");
  const untilRaw = url.searchParams.get("until");
  const outcomeRaw = url.searchParams.get("outcome");
  const actorTypeRaw = url.searchParams.get("actorType");

  const outcomeParsed = outcomeRaw
    ? OutcomeSchema.safeParse(outcomeRaw)
    : null;
  if (outcomeParsed && !outcomeParsed.success) {
    return apiFail("Invalid outcome filter.", "INVALID_QUERY", 400);
  }
  const actorParsed = actorTypeRaw
    ? ActorTypeSchema.safeParse(actorTypeRaw)
    : null;
  if (actorParsed && !actorParsed.success) {
    return apiFail("Invalid actorType filter.", "INVALID_QUERY", 400);
  }

  let since: Date | null = null;
  let until: Date | null = null;
  if (sinceRaw) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) {
      return apiFail("Invalid since timestamp.", "INVALID_QUERY", 400);
    }
  }
  if (untilRaw) {
    until = new Date(untilRaw);
    if (Number.isNaN(until.getTime())) {
      return apiFail("Invalid until timestamp.", "INVALID_QUERY", 400);
    }
  }

  try {
    const { rows, nextCursor } = await listAuditLogs({
      workspaceId: gate.workspaceId,
      action: url.searchParams.get("action"),
      outcome: outcomeParsed?.success ? outcomeParsed.data : null,
      actorType: actorParsed?.success ? actorParsed.data : null,
      resource: url.searchParams.get("resource"),
      resourceId: url.searchParams.get("resourceId"),
      since,
      until,
      limit: Number.isFinite(limit) ? limit : 50,
      cursor: url.searchParams.get("cursor"),
    });

    return apiOk(
      {
        workspaceId: gate.workspaceId,
        authMode: gate.authMode,
        count: rows.length,
        nextCursor,
        logs: rows.map(serializeAuditLog),
      },
      {
        headers: { "x-workspace-bound": gate.workspaceId },
      }
    );
  } catch (err) {
    console.error("[telemetry/audit] GET failed:", err);
    return apiFail(
      err instanceof Error ? err.message : "Unable to list audit logs.",
      "TELEMETRY_AUDIT_LIST_FAILED",
      503
    );
  }
}

/**
 * POST /api/telemetry/audit
 * Archive one or many security audit actions for the authenticated workspace.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiFail("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body.",
      "INVALID_BODY",
      400
    );
  }

  const bodyWorkspaceId =
    "workspaceId" in parsed.data ? parsed.data.workspaceId : null;
  const gate = await requireWorkspaceApiKeyGate(request, bodyWorkspaceId);
  if (!gate.ok) return gateFail(gate);

  const fallbackIp = clientIp(request);
  const fallbackUa = request.headers.get("user-agent");

  try {
    if ("events" in parsed.data) {
      const rows = await appendAuditLogs(
        gate.workspaceId,
        parsed.data.events.map((ev) => ({
          ...ev,
          ip: ev.ip ?? fallbackIp,
          userAgent: ev.userAgent ?? fallbackUa,
        }))
      );

      return apiOk(
        {
          workspaceId: gate.workspaceId,
          authMode: gate.authMode,
          count: rows.length,
          logs: rows.map(serializeAuditLog),
        },
        {
          status: 201,
          headers: { "x-workspace-bound": gate.workspaceId },
        }
      );
    }

    const row = await appendAuditLog({
      workspaceId: gate.workspaceId,
      action: parsed.data.action,
      actorType: parsed.data.actorType,
      actorId: parsed.data.actorId,
      resource: parsed.data.resource,
      resourceId: parsed.data.resourceId,
      outcome: parsed.data.outcome,
      ip: parsed.data.ip ?? fallbackIp,
      userAgent: parsed.data.userAgent ?? fallbackUa,
      metadata: parsed.data.metadata,
    });

    return apiOk(
      {
        workspaceId: gate.workspaceId,
        authMode: gate.authMode,
        log: serializeAuditLog(row),
      },
      {
        status: 201,
        headers: { "x-workspace-bound": gate.workspaceId },
      }
    );
  } catch (err) {
    console.error("[telemetry/audit] POST failed:", err);
    return apiFail(
      err instanceof Error ? err.message : "Unable to persist audit log.",
      "TELEMETRY_AUDIT_WRITE_FAILED",
      503
    );
  }
}
