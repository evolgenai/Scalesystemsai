/**
 * GET    /api/workflows/[id] — fetch a single blueprint (tenant-bound)
 * PATCH  /api/workflows/[id] — update graph / metadata
 * DELETE /api/workflows/[id] — archive+delete blueprint
 */

import { NextResponse } from "next/server";
import {
  assertResourceWorkspace,
  resolveWorkspaceGate,
} from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";
import { UpdateWorkflowSchema } from "@/lib/swarm/workflowRunner";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadBoundBlueprint(request: Request, id: string) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) return { gate, blueprint: null } as const;

  const blueprint = await withPrisma(
    (db) =>
      db.workflowBlueprint.findUnique({
        where: { id },
        include: {
          executions: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              status: true,
              startedAt: true,
              completedAt: true,
              createdAt: true,
            },
          },
        },
      }),
    "workflows.get"
  );

  if (!blueprint) {
    return {
      gate: {
        ok: false as const,
        code: "WORKFLOW_NOT_FOUND" as const,
        message: "Workflow blueprint not found.",
        status: 404 as const,
      },
      blueprint: null,
    };
  }

  const boundary = assertResourceWorkspace(gate, blueprint.workspaceId);
  if (!boundary.ok) return { gate: boundary, blueprint: null } as const;

  return { gate, blueprint } as const;
}

export async function GET(request: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return apiError("Workflow id is required.", "INVALID_ID", 400);
  }

  try {
    const { gate, blueprint } = await loadBoundBlueprint(request, id.trim());
    if (!gate.ok) {
      return apiError(gate.message, gate.code, gate.status);
    }
    return apiSuccess({
      data: blueprint,
      meta: { workspaceId: gate.workspaceId },
    });
  } catch (err) {
    console.error("[api/workflows/[id]] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to load workflow.",
      "WORKFLOW_GET_FAILED",
      503
    );
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return apiError("Workflow id is required.", "INVALID_ID", 400);
  }

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

  const parsed = UpdateWorkflowSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  try {
    const existing = await withPrisma(
      (db) =>
        db.workflowBlueprint.findUnique({
          where: { id: id.trim() },
          select: { id: true, workspaceId: true },
        }),
      "workflows.patch.load"
    );

    if (!existing) {
      return apiError("Workflow blueprint not found.", "WORKFLOW_NOT_FOUND", 404);
    }

    const boundary = assertResourceWorkspace(gate, existing.workspaceId);
    if (!boundary.ok) {
      return apiError(boundary.message, boundary.code, boundary.status);
    }

    const body = parsed.data;
    const data: Prisma.WorkflowBlueprintUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status;
    if (body.nodes !== undefined) {
      data.nodes = body.nodes as unknown as Prisma.InputJsonValue;
    }
    if (body.edges !== undefined) {
      data.edges = body.edges as unknown as Prisma.InputJsonValue;
    }

    const updated = await withPrisma(
      (db) =>
        db.workflowBlueprint.update({
          where: { id: existing.id },
          data,
        }),
      "workflows.patch"
    );

    return apiSuccess(
      { data: updated, meta: { workspaceId: gate.workspaceId } },
      200,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    console.error("[api/workflows/[id]] PATCH failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to update workflow.",
      "WORKFLOW_UPDATE_FAILED",
      503
    );
  }
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return apiError("Workflow id is required.", "INVALID_ID", 400);
  }

  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  try {
    const existing = await withPrisma(
      (db) =>
        db.workflowBlueprint.findUnique({
          where: { id: id.trim() },
          select: { id: true, workspaceId: true },
        }),
      "workflows.delete.load"
    );

    if (!existing) {
      return apiError("Workflow blueprint not found.", "WORKFLOW_NOT_FOUND", 404);
    }

    const boundary = assertResourceWorkspace(gate, existing.workspaceId);
    if (!boundary.ok) {
      return apiError(boundary.message, boundary.code, boundary.status);
    }

    await withPrisma(
      (db) => db.workflowBlueprint.delete({ where: { id: existing.id } }),
      "workflows.delete"
    );

    return NextResponse.json(
      {
        success: true,
        data: { id: existing.id, deleted: true },
        meta: { workspaceId: gate.workspaceId },
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-workspace-bound": gate.workspaceId,
        },
      }
    );
  } catch (err) {
    console.error("[api/workflows/[id]] DELETE failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to delete workflow.",
      "WORKFLOW_DELETE_FAILED",
      503
    );
  }
}
