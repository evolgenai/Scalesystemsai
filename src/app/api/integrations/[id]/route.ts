/**
 * GET    /api/integrations/[id] — fetch connector (no secret material)
 * PATCH  /api/integrations/[id] — update status / rotate credentials
 * DELETE /api/integrations/[id] — disconnect (hard delete sealed row)
 *
 * Tenant isolation: integration.workspaceId validated against x-workspace-key.
 */

import {
  assertResourceWorkspace,
  resolveWorkspaceGate,
} from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  sealCredentials,
  toPublicIntegration,
  UpdateIntegrationSchema,
} from "@/lib/integrations/credentials";
import { withPrisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveGateAndIntegration(request: Request, id: string) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) return { gate } as const;

  const row = await withPrisma(
    (db) => db.workspaceIntegration.findUnique({ where: { id } }),
    "integrations.find"
  );

  if (!row) {
    return {
      gate,
      denied: apiError(
        "Integration not found.",
        "INTEGRATION_NOT_FOUND",
        404
      ),
    } as const;
  }

  const boundary = assertResourceWorkspace(gate, row.workspaceId);
  if (!boundary.ok) {
    return {
      gate,
      denied: apiError(boundary.message, boundary.code, boundary.status),
    } as const;
  }

  return { gate, row } as const;
}

export async function GET(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return apiError("Integration id is required.", "INVALID_ID", 400);
  }

  let resolved: Awaited<ReturnType<typeof resolveGateAndIntegration>>;
  try {
    resolved = await resolveGateAndIntegration(request, id.trim());
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Resolution failed.",
      "RESOLUTION_FAILED",
      503
    );
  }

  if ("denied" in resolved && resolved.denied) return resolved.denied;
  if (!("row" in resolved) || !resolved.row) {
    return apiError("Integration not found.", "INTEGRATION_NOT_FOUND", 404);
  }

  return apiSuccess({ data: toPublicIntegration(resolved.row) });
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return apiError("Integration id is required.", "INVALID_ID", 400);
  }

  let resolved: Awaited<ReturnType<typeof resolveGateAndIntegration>>;
  try {
    resolved = await resolveGateAndIntegration(request, id.trim());
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Resolution failed.",
      "RESOLUTION_FAILED",
      503
    );
  }

  if ("denied" in resolved && resolved.denied) return resolved.denied;
  if (!("row" in resolved) || !resolved.row) {
    return apiError("Integration not found.", "INTEGRATION_NOT_FOUND", 404);
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = UpdateIntegrationSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid patch body.",
      "INVALID_BODY",
      400
    );
  }

  const patch = parsed.data;
  if (
    patch.status === undefined &&
    patch.credentials === undefined &&
    patch.markSynced === undefined
  ) {
    return apiError(
      "Patch body must contain at least one field.",
      "EMPTY_PATCH",
      400
    );
  }

  const data: Prisma.WorkspaceIntegrationUpdateInput = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.markSynced === true) data.lastSyncedAt = new Date();
  if (patch.credentials !== undefined) {
    try {
      data.credentialsEncrypted = sealCredentials(patch.credentials);
      data.lastSyncedAt = new Date();
    } catch (err) {
      return apiError(
        err instanceof Error ? err.message : "Unable to encrypt credentials.",
        "CREDENTIALS_ENCRYPT_FAILED",
        500
      );
    }
  }

  try {
    const updated = await withPrisma(
      (db) =>
        db.workspaceIntegration.update({
          where: { id: resolved.row.id },
          data,
        }),
      "integrations.patch"
    );

    return apiSuccess({ data: toPublicIntegration(updated) });
  } catch (err) {
    console.error("[api/integrations/[id]] PATCH failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to update integration.",
      "INTEGRATIONS_PATCH_FAILED",
      503
    );
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return apiError("Integration id is required.", "INVALID_ID", 400);
  }

  let resolved: Awaited<ReturnType<typeof resolveGateAndIntegration>>;
  try {
    resolved = await resolveGateAndIntegration(request, id.trim());
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Resolution failed.",
      "RESOLUTION_FAILED",
      503
    );
  }

  if ("denied" in resolved && resolved.denied) return resolved.denied;
  if (!("row" in resolved) || !resolved.row) {
    return apiError("Integration not found.", "INTEGRATION_NOT_FOUND", 404);
  }

  try {
    await withPrisma(
      (db) => db.workspaceIntegration.delete({ where: { id: resolved.row.id } }),
      "integrations.delete"
    );

    return apiSuccess({
      data: {
        id: resolved.row.id,
        workspaceId: resolved.gate.workspaceId,
        deleted: true,
      },
    });
  } catch (err) {
    console.error("[api/integrations/[id]] DELETE failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to disconnect integration.",
      "INTEGRATIONS_DELETE_FAILED",
      503
    );
  }
}
