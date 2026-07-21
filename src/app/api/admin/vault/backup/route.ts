/**
 * POST /api/admin/vault/backup
 * Super-Admin: extract workspace blueprints, catalog items, and gas ledgers;
 * gzip + encrypt; upload to @vercel/blob; persist VaultBackup metadata.
 */

import { z } from "zod";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { createWorkspaceVaultBackup } from "@/lib/vault/snapshotVault";
import {
  extractClientIp,
  logSecurityEventAsync,
} from "@/lib/security/auditLogger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BackupBodySchema = z.object({
  workspaceId: z.string().uuid().optional().nullable(),
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
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = BackupBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const gate = await resolveWorkspaceGate(
    request,
    parsed.data.workspaceId ?? null,
    { requireWorkspace: true, requireApiKey: true }
  );
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  try {
    const result = await createWorkspaceVaultBackup({
      workspaceId: gate.workspaceId,
      createdBy: guard.profile.id ?? guard.profile.email,
    });

    logSecurityEventAsync({
      workspaceId: gate.workspaceId,
      eventType: "vault.backup.created",
      severity: "INFO",
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get("user-agent"),
      details: {
        backupId: result.backup.id,
        sizeBytes: result.backup.sizeBytes,
        itemCounts: result.backup.itemCounts,
        actorId: guard.profile.id,
      },
    });

    return apiSuccess(
      {
        data: result.backup,
        meta: {
          workspaceId: gate.workspaceId,
          adminId: guard.profile.id,
        },
      },
      201,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    console.error("[api/admin/vault/backup] POST failed:", err);
    logSecurityEventAsync({
      workspaceId: gate.workspaceId,
      eventType: "vault.backup.failed",
      severity: "CRITICAL",
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get("user-agent"),
      details: {
        error: err instanceof Error ? err.message : "backup_failed",
        actorId: guard.profile.id,
      },
    });
    return apiError(
      err instanceof Error ? err.message : "Vault backup failed.",
      "VAULT_BACKUP_FAILED",
      503
    );
  }
}
