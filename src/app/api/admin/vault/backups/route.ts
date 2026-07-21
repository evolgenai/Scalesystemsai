/**
 * GET /api/admin/vault/backups
 * Super-Admin: list encrypted vault backup history + signed download links.
 */

import { resolveRequestUser } from "@/lib/auth/requestUser";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { listWorkspaceVaultBackups } from "@/lib/vault/snapshotVault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const cursor = url.searchParams.get("cursor")?.trim() || null;

  try {
    const { backups, nextCursor } = await listWorkspaceVaultBackups({
      workspaceId: gate.workspaceId,
      limit: Number.isFinite(limit) ? limit : 20,
      cursor,
    });

    return apiSuccess(
      {
        data: backups,
        meta: {
          workspaceId: gate.workspaceId,
          count: backups.length,
          nextCursor,
          adminId: guard.profile.id,
        },
      },
      200,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    console.error("[api/admin/vault/backups] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list vault backups.",
      "VAULT_BACKUPS_LIST_FAILED",
      503
    );
  }
}
