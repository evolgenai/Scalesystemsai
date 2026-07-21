/**
 * GET /api/admin/security/logs
 * Super-Admin paginated security event feed with threat-level filtering.
 * Tenant isolation: x-workspace-key binds results to a single workspace.
 */

import { z } from "zod";
import type { Prisma, SecurityAuditSeverity } from "@prisma/client";
import { withPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SeveritySchema = z.enum(["INFO", "WARNING", "CRITICAL"]);

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

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const url = new URL(request.url);
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50)
  );
  const severityRaw = url.searchParams.get("severity")?.trim().toUpperCase();
  const eventType = url.searchParams.get("eventType")?.trim() || undefined;
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;

  let severity: SecurityAuditSeverity | undefined;
  if (severityRaw) {
    const sev = SeveritySchema.safeParse(severityRaw);
    if (!sev.success) {
      return apiError(
        "Invalid severity filter. Use INFO | WARNING | CRITICAL.",
        "INVALID_QUERY",
        400
      );
    }
    severity = sev.data;
  }

  const where: Prisma.SecurityAuditLogWhereInput = {
    workspaceId: gate.workspaceId,
    ...(severity ? { severity } : {}),
    ...(eventType ? { eventType } : {}),
  };

  try {
    const [rows, total] = await withPrisma(
      (db) =>
        Promise.all([
          db.securityAuditLog.findMany({
            where,
            orderBy: [{ timestamp: "desc" }, { id: "desc" }],
            take: limit,
            ...(cursor
              ? { cursor: { id: cursor }, skip: 1 }
              : { skip: (page - 1) * limit }),
          }),
          db.securityAuditLog.count({ where }),
        ]),
      "admin.security.logs"
    );

    const data = rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      eventType: row.eventType,
      severity: row.severity,
      details:
        row.details &&
        typeof row.details === "object" &&
        !Array.isArray(row.details)
          ? (row.details as Record<string, unknown>)
          : {},
      timestamp: row.timestamp.toISOString(),
    }));

    const nextCursor =
      rows.length === limit ? rows[rows.length - 1]?.id ?? null : null;

    return apiSuccess(
      {
        data,
        meta: {
          workspaceId: gate.workspaceId,
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          nextCursor,
          severity: severity ?? null,
          eventType: eventType ?? null,
          adminId: guard.profile.id,
        },
      },
      200,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    console.error("[api/admin/security/logs] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list security logs.",
      "SECURITY_LOGS_LIST_FAILED",
      503
    );
  }
}
