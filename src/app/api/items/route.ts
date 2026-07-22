/**
 * GET  /api/items  — paginated catalog listing (workspace-scoped, category/status filter)
 * POST /api/items  — create a new CatalogItem for the authenticated workspace
 *
 * Tenant isolation: every request must carry x-workspace-key (API key header).
 * Cross-tenant reads are blocked by resolveWorkspaceGate.
 */

import { z } from "zod";
import { NextResponse } from "next/server";
import { withPrisma } from "@/lib/prisma";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import type { CatalogItemStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Validation ──────────────────────────────────────────────────────────────

const CreateItemSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).optional().nullable(),
  price: z.number().nonnegative(),
  sku: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  stockQuantity: z.number().int().nonnegative().default(0),
  images: z.array(z.string().url()).max(20).default([]),
  status: z
    .enum(["ACTIVE", "DRAFT", "ARCHIVED"])
    .default("ACTIVE"),
});

const PAGE_DEFAULT = 1;
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;

// ─── GET ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/items
 * Query params: page, limit, category, status
 * Requires: x-workspace-key header (workspace API key)
 */
export async function GET(request: Request) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });

  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || PAGE_DEFAULT);
  const limit = Math.min(
    LIMIT_MAX,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || LIMIT_DEFAULT)
  );
  const category = url.searchParams.get("category")?.trim() || undefined;
  const statusParam = url.searchParams.get("status")?.trim().toUpperCase() as CatalogItemStatus | undefined;

  const validStatuses: CatalogItemStatus[] = ["ACTIVE", "DRAFT", "ARCHIVED", "DELETED"];
  const status: CatalogItemStatus | undefined =
    statusParam && validStatuses.includes(statusParam) ? statusParam : undefined;

  const where: Prisma.CatalogItemWhereInput = {
    workspaceId: gate.workspaceId,
    // By default exclude soft-deleted items unless caller explicitly requests DELETED
    ...(status
      ? { status }
      : { status: { not: "DELETED" } }),
    ...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
  };

  try {
    return await withSentryTelemetryAsync(
      telemetryContextFromRequest(request, {
        tenantId: gate.workspaceId,
        source: "api",
        route: "/api/items",
      }),
      async () => {
        const [items, total] = await withPrisma(
          (db) =>
            Promise.all([
              db.catalogItem.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
              }),
              db.catalogItem.count({ where }),
            ]),
          "items.list"
        );

        return apiSuccess({
          data: items,
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            workspaceId: gate.workspaceId,
          },
        });
      }
    );
  } catch (err) {
    captureStructuredError(err, {
      tenantId: gate.workspaceId,
      source: "api",
      route: "/api/items",
      level: "error",
    });
    console.error("[api/items] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list catalog items.",
      "ITEMS_LIST_FAILED",
      503
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/items
 * Body: CreateItemSchema
 * Requires: x-workspace-key header
 */
export async function POST(request: Request) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });

  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = CreateItemSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;

  try {
    const item = await withPrisma(
      (db) =>
        db.catalogItem.create({
          data: {
            workspaceId: gate.workspaceId,
            title: body.title,
            description: body.description ?? null,
            price: body.price,
            sku: body.sku,
            category: body.category,
            stockQuantity: body.stockQuantity,
            images: body.images,
            status: body.status as CatalogItemStatus,
          },
        }),
      "items.create"
    );

    return NextResponse.json(
      { success: true, data: item },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
          "x-item-id": item.id,
          "x-workspace-id": gate.workspaceId,
        },
      }
    );
  } catch (err) {
    const isDuplicate =
      err instanceof Error && err.message.includes("Unique constraint");
    if (isDuplicate) {
      return apiError(
        `SKU '${body.sku}' already exists in this workspace.`,
        "SKU_CONFLICT",
        409
      );
    }
    console.error("[api/items] POST failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to create catalog item.",
      "ITEMS_CREATE_FAILED",
      503
    );
  }
}
