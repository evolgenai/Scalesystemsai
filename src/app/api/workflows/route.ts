/**
 * GET  /api/workflows — list workflow blueprints for the authenticated workspace
 * POST /api/workflows — create a workflow blueprint (node/edge graph JSON)
 *
 * Tenant isolation: requires x-workspace-key. Cross-tenant reads blocked.
 */

import { NextResponse } from "next/server";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";
import { CreateWorkflowSchema } from "@/lib/swarm/workflowRunner";
import type { Prisma, WorkflowBlueprintStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_DEFAULT = 1;
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;

/**
 * GET /api/workflows
 * Query: page, limit, status
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
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || PAGE_DEFAULT
  );
  const limit = Math.min(
    LIMIT_MAX,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || LIMIT_DEFAULT
    )
  );
  const statusParam = url.searchParams
    .get("status")
    ?.trim()
    .toUpperCase() as WorkflowBlueprintStatus | undefined;
  const validStatuses: WorkflowBlueprintStatus[] = [
    "DRAFT",
    "ACTIVE",
    "ARCHIVED",
  ];
  const status =
    statusParam && validStatuses.includes(statusParam) ? statusParam : undefined;

  const where: Prisma.WorkflowBlueprintWhereInput = {
    workspaceId: gate.workspaceId,
    ...(status ? { status } : {}),
  };

  try {
    const [blueprints, total] = await withPrisma(
      (db) =>
        Promise.all([
          db.workflowBlueprint.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            include: {
              _count: { select: { executions: true } },
            },
          }),
          db.workflowBlueprint.count({ where }),
        ]),
      "workflows.list"
    );

    return apiSuccess({
      data: blueprints,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        workspaceId: gate.workspaceId,
      },
    });
  } catch (err) {
    console.error("[api/workflows] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list workflows.",
      "WORKFLOWS_LIST_FAILED",
      503
    );
  }
}

/**
 * POST /api/workflows
 * Body: CreateWorkflowSchema
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

  const parsed = CreateWorkflowSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;

  try {
    const blueprint = await withPrisma(
      (db) =>
        db.workflowBlueprint.create({
          data: {
            workspaceId: gate.workspaceId,
            title: body.title,
            description: body.description ?? null,
            nodes: body.nodes as unknown as Prisma.InputJsonValue,
            edges: body.edges as unknown as Prisma.InputJsonValue,
            status: body.status,
          },
        }),
      "workflows.create"
    );

    return NextResponse.json(
      { success: true, data: blueprint },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
          "x-workflow-id": blueprint.id,
          "x-workspace-id": gate.workspaceId,
          "x-workspace-bound": gate.workspaceId,
        },
      }
    );
  } catch (err) {
    console.error("[api/workflows] POST failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to create workflow.",
      "WORKFLOWS_CREATE_FAILED",
      503
    );
  }
}
