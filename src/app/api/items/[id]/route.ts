/**
 * GET    /api/items/[id]  — fetch a single catalog item (workspace-scoped)
 * PATCH  /api/items/[id]  — partial update (price, stock, title, status, etc.)
 * DELETE /api/items/[id]  — soft-delete (sets status → DELETED, never hard-removes)
 *
 * Tenant isolation: item's workspaceId is always validated against the gate.
 */

import { z } from "zod";
import { withPrisma } from "@/lib/prisma";
import { resolveWorkspaceGate, assertResourceWorkspace } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import type { CatalogItemStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Shared helpers ───────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ id: string }> };

async function resolveGateAndItem(request: Request, id: string) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });

  if (!gate.ok) return { gate } as const;

  const item = await withPrisma(
    (db) => db.catalogItem.findUnique({ where: { id } }),
    "items.find"
  );

  if (!item) {
    return {
      gate,
      denied: apiError("Catalog item not found.", "ITEM_NOT_FOUND", 404),
    } as const;
  }

  const boundary = assertResourceWorkspace(gate, item.workspaceId);
  if (!boundary.ok) {
    return {
      gate,
      denied: apiError(boundary.message, boundary.code, boundary.status),
    } as const;
  }

  return { gate, item } as const;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  const resolved = await resolveGateAndItem(request, id).catch((err) => ({
    gate: null,
    denied: apiError(
      err instanceof Error ? err.message : "Resolution failed.",
      "RESOLUTION_FAILED",
      503
    ),
  }));

  if ("denied" in resolved && resolved.denied) return resolved.denied;
  if (!("item" in resolved) || !resolved.item) {
    return apiError("Catalog item not found.", "ITEM_NOT_FOUND", 404);
  }

  return apiSuccess({ data: resolved.item });
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

const PatchItemSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5_000).nullable().optional(),
  price: z.number().nonnegative().optional(),
  sku: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  images: z.array(z.string().url()).max(20).optional(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
});

export async function PATCH(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  let resolved: Awaited<ReturnType<typeof resolveGateAndItem>>;
  try {
    resolved = await resolveGateAndItem(request, id);
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Resolution failed.",
      "RESOLUTION_FAILED",
      503
    );
  }

  if ("denied" in resolved && resolved.denied) return resolved.denied;
  if (!("item" in resolved) || !resolved.item) {
    return apiError("Catalog item not found.", "ITEM_NOT_FOUND", 404);
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PatchItemSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid patch body.",
      "INVALID_BODY",
      400
    );
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return apiError("Patch body must contain at least one field.", "EMPTY_PATCH", 400);
  }

  try {
    const updated = await withPrisma(
      (db) =>
        db.catalogItem.update({
          where: { id },
          data: {
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.description !== undefined && { description: patch.description }),
            ...(patch.price !== undefined && { price: patch.price }),
            ...(patch.sku !== undefined && { sku: patch.sku }),
            ...(patch.category !== undefined && { category: patch.category }),
            ...(patch.stockQuantity !== undefined && { stockQuantity: patch.stockQuantity }),
            ...(patch.images !== undefined && { images: patch.images }),
            ...(patch.status !== undefined && { status: patch.status as CatalogItemStatus }),
          },
        }),
      "items.patch"
    );

    return apiSuccess({ data: updated });
  } catch (err) {
    const isDuplicate =
      err instanceof Error && err.message.includes("Unique constraint");
    if (isDuplicate) {
      return apiError(
        `SKU '${patch.sku}' already exists in this workspace.`,
        "SKU_CONFLICT",
        409
      );
    }
    console.error("[api/items/[id]] PATCH failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to update catalog item.",
      "ITEMS_PATCH_FAILED",
      503
    );
  }
}

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

export async function DELETE(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  let resolved: Awaited<ReturnType<typeof resolveGateAndItem>>;
  try {
    resolved = await resolveGateAndItem(request, id);
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Resolution failed.",
      "RESOLUTION_FAILED",
      503
    );
  }

  if ("denied" in resolved && resolved.denied) return resolved.denied;
  if (!("item" in resolved) || !resolved.item) {
    return apiError("Catalog item not found.", "ITEM_NOT_FOUND", 404);
  }

  if (resolved.item.status === "DELETED") {
    return apiError("Item is already deleted.", "ITEM_ALREADY_DELETED", 409);
  }

  try {
    const tombstoned = await withPrisma(
      (db) =>
        db.catalogItem.update({
          where: { id },
          data: { status: "DELETED" },
          select: { id: true, status: true, workspaceId: true },
        }),
      "items.delete"
    );

    return apiSuccess({ data: tombstoned }, 200);
  } catch (err) {
    console.error("[api/items/[id]] DELETE failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to soft-delete catalog item.",
      "ITEMS_DELETE_FAILED",
      503
    );
  }
}
