/**
 * POST /api/workflows/[id]/approve
 *
 * Resolve a Human-In-The-Loop ApprovalRequest (APPROVED | REJECTED) for a
 * paused workflow node. Tenant-bound via x-workspace-key.
 *
 * Body: { decision: "APPROVED" | "REJECTED", approvalId?: string, nodeId?: string, executionId?: string }
 * Path `id` is the workflow blueprint id.
 */

import { z } from "zod";
import {
  assertResourceWorkspace,
  resolveWorkspaceGate,
} from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ApproveBodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "approve", "reject"]).transform(
    (v) =>
      v === "approve" || v === "APPROVED"
        ? ("APPROVED" as const)
        : ("REJECTED" as const)
  ),
  approvalId: z.string().trim().min(1).max(128).optional(),
  nodeId: z.string().trim().min(1).max(128).optional(),
  executionId: z.string().trim().min(1).max(128).optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
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

  const parsed = ApproveBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid approve payload.",
      "INVALID_BODY",
      400
    );
  }

  const { decision, approvalId, nodeId, executionId } = parsed.data;
  const blueprintId = id.trim();

  try {
    const blueprint = await withPrisma(
      (db) =>
        db.workflowBlueprint.findUnique({
          where: { id: blueprintId },
          select: { id: true, workspaceId: true },
        }),
      "workflows.approve.load"
    );

    if (!blueprint) {
      return apiError("Workflow blueprint not found.", "WORKFLOW_NOT_FOUND", 404);
    }

    const boundary = assertResourceWorkspace(gate, blueprint.workspaceId);
    if (!boundary.ok) {
      return apiError(boundary.message, boundary.code, boundary.status);
    }

    const approval = await withPrisma(async (db) => {
      if (approvalId) {
        return db.approvalRequest.findFirst({
          where: {
            id: approvalId,
            workspaceId: gate.workspaceId,
            workflowExecution: { blueprintId },
          },
          include: {
            workflowExecution: {
              select: { id: true, status: true, blueprintId: true },
            },
          },
        });
      }

      return db.approvalRequest.findFirst({
        where: {
          workspaceId: gate.workspaceId,
          status: "PENDING",
          ...(nodeId ? { nodeId } : {}),
          workflowExecution: {
            blueprintId,
            ...(executionId ? { id: executionId } : {}),
            status: "PAUSED_HITL",
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          workflowExecution: {
            select: { id: true, status: true, blueprintId: true },
          },
        },
      });
    }, "workflows.approve.find");

    if (!approval) {
      return apiError(
        "No pending approval request found for this workflow.",
        "APPROVAL_NOT_FOUND",
        404
      );
    }

    if (approval.status !== "PENDING") {
      return apiError(
        `Approval already resolved as ${approval.status}.`,
        "APPROVAL_ALREADY_RESOLVED",
        409
      );
    }

    const resolvedAt = new Date();
    const updated = await withPrisma(async (db) => {
      const row = await db.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: decision,
          resolvedAt,
        },
        select: {
          id: true,
          nodeId: true,
          actionType: true,
          status: true,
          workflowExecutionId: true,
          workspaceId: true,
          createdAt: true,
          resolvedAt: true,
        },
      });

      // Rejection permanently fails the paused execution when no in-flight waiter.
      // Approval leaves status RUNNING so an in-flight waiter can resume; if the
      // execute stream already ended, keep PAUSED_HITL → RUNNING for observability.
      if (decision === "REJECTED") {
        await db.workflowExecution.update({
          where: { id: approval.workflowExecutionId },
          data: {
            status: "FAILED",
            completedAt: resolvedAt,
          },
        });
      } else if (approval.workflowExecution.status === "PAUSED_HITL") {
        await db.workflowExecution.update({
          where: { id: approval.workflowExecutionId },
          data: {
            status: "RUNNING",
            completedAt: null,
          },
        });
      }

      return row;
    }, "workflows.approve.resolve");

    return apiSuccess(
      {
        data: updated,
        meta: {
          workspaceId: gate.workspaceId,
          blueprintId,
          executionId: updated.workflowExecutionId,
          decision,
          resumed: decision === "APPROVED",
        },
      },
      200,
      {
        "x-workspace-bound": gate.workspaceId,
        "x-approval-id": updated.id,
        "x-execution-id": updated.workflowExecutionId,
      }
    );
  } catch (err) {
    console.error("[api/workflows/approve] failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to resolve approval.",
      "WORKFLOW_APPROVE_FAILED",
      503
    );
  }
}
