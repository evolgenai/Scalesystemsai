/**
 * POST /api/workflows/[id]/execute
 *
 * Asynchronous workflow execution engine:
 * - Tenant-bound via x-workspace-key
 * - Parses blueprint node/edge graph
 * - Runs sequence through SwarmOrchestrator (scraper → SRE/AI → Discord, …)
 * - Streams execution logs as SSE (or JSON when stream=false)
 * - Sandbox nodes execute inside the sealed code sandbox
 */

import { NextResponse } from "next/server";
import {
  assertResourceWorkspace,
  resolveWorkspaceGate,
} from "@/lib/auth/workspaceGate";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";
import {
  ExecuteWorkflowSchema,
  runWorkflowBlueprint,
} from "@/lib/swarm/workflowRunner";
import type { WorkflowLogEntry } from "@/lib/swarm/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Content-Encoding": "none",
} as const;

type RouteCtx = { params: Promise<{ id: string }> };

function encodeFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function parseExecuteBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  let parsed: unknown = JSON.parse(text);
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  return parsed;
}

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
    raw = await parseExecuteBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = ExecuteWorkflowSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid execute payload.",
      "INVALID_BODY",
      400
    );
  }

  const blueprintId = id.trim();
  let blueprintTitle = "workflow-run";

  try {
    const existing = await withPrisma(
      (db) =>
        db.workflowBlueprint.findUnique({
          where: { id: blueprintId },
          select: { id: true, workspaceId: true, status: true, title: true },
        }),
      "workflows.execute.load"
    );

    if (!existing) {
      return apiError("Workflow blueprint not found.", "WORKFLOW_NOT_FOUND", 404);
    }

    const boundary = assertResourceWorkspace(gate, existing.workspaceId);
    if (!boundary.ok) {
      return apiError(boundary.message, boundary.code, boundary.status);
    }

    if (existing.status === "ARCHIVED") {
      return apiError(
        "Archived workflows cannot be executed.",
        "WORKFLOW_ARCHIVED",
        409
      );
    }

    blueprintTitle = existing.title;
  } catch (err) {
    console.error("[api/workflows/execute] preload failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to load workflow.",
      "WORKFLOW_EXECUTE_PRELOAD_FAILED",
      503
    );
  }

  const { triggerPayload, stream, maxParallel } = parsed.data;

  if (!stream) {
    try {
      const summary = await runWorkflowBlueprint({
        workspaceId: gate.workspaceId,
        blueprintId,
        triggerPayload,
        maxParallel,
        signal: request.signal,
      });

      return apiSuccess(
        {
          data: summary,
          meta: {
            workspaceId: gate.workspaceId,
            blueprintId,
            executionId: summary.executionId,
          },
        },
        summary.status === "COMPLETED" ? 200 : 207,
        {
          "x-workspace-bound": gate.workspaceId,
          "x-execution-id": summary.executionId,
        }
      );
    } catch (err) {
      console.error("[api/workflows/execute] JSON run failed:", err);
      return apiError(
        err instanceof Error ? err.message : "Workflow execution failed.",
        "WORKFLOW_EXECUTE_FAILED",
        500
      );
    }
  }

  const encoder = new TextEncoder();
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeFrame(event, data)));
        } catch {
          closed = true;
        }
      };

      push("start", {
        blueprintId,
        workspaceId: gate.workspaceId,
        title: blueprintTitle,
        at: new Date().toISOString(),
      });

      const onLog = (entry: WorkflowLogEntry) => {
        push("log", entry);
      };

      const onStatus = (event: {
        status: string;
        nodeId?: string;
        approvalId?: string;
        data?: unknown;
      }) => {
        push("status", {
          ...event,
          at: new Date().toISOString(),
        });
        if (event.status === "PAUSED_HITL") {
          const data =
            event.data && typeof event.data === "object"
              ? (event.data as Record<string, unknown>)
              : {};
          push("PAUSED_HITL", {
            executionId: data.executionId ?? null,
            blueprintId: data.blueprintId ?? blueprintId,
            nodeId: event.nodeId,
            approvalId: event.approvalId,
            status: "PAUSED_HITL",
            at: new Date().toISOString(),
          });
        }
      };

      try {
        const summary = await runWorkflowBlueprint({
          workspaceId: gate.workspaceId,
          blueprintId,
          triggerPayload,
          maxParallel,
          signal: request.signal,
          onLog,
          onStatus,
        });

        if (summary.status === "PAUSED_HITL") {
          push("PAUSED_HITL", {
            executionId: summary.executionId,
            status: summary.status,
            pendingApprovalId: summary.pendingApprovalId,
            pausedNodeId: summary.pausedNodeId,
            logCount: summary.logs.length,
            startedAt: summary.startedAt,
            at: new Date().toISOString(),
          });
        }

        push("complete", {
          executionId: summary.executionId,
          status: summary.status,
          results: summary.results,
          contextKeys: Object.keys(summary.context),
          logCount: summary.logs.length,
          startedAt: summary.startedAt,
          completedAt: summary.completedAt,
          pendingApprovalId: summary.pendingApprovalId,
          pausedNodeId: summary.pausedNodeId,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Workflow execution failed.";
        push("error", {
          message,
          code:
            err instanceof DOMException && err.name === "AbortError"
              ? "ABORTED"
              : "WORKFLOW_EXECUTE_FAILED",
        });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          closed = true;
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new NextResponse(readable, {
    status: 200,
    headers: {
      ...SSE_HEADERS,
      "x-workspace-bound": gate.workspaceId,
      "x-workflow-id": blueprintId,
    },
  });
}
