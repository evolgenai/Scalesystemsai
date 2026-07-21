/**
 * Human-In-The-Loop approval helpers for workflow pause / resume.
 */

import { withPrisma } from "@/lib/prisma";
import type { ApprovalRequestStatus, Prisma } from "@prisma/client";

export const HITL_POLL_MS = 750;
/** Max wall-clock wait while an SSE execute stream is held open. */
export const HITL_MAX_WAIT_MS = 90_000;

export type CreateHitlApprovalInput = {
  workflowExecutionId: string;
  nodeId: string;
  workspaceId: string;
  actionType: string;
  payload?: Record<string, unknown>;
};

export type HitlWaitResult =
  | { status: "APPROVED"; approvalId: string }
  | { status: "REJECTED"; approvalId: string }
  | { status: "TIMEOUT"; approvalId: string }
  | { status: "ABORTED"; approvalId: string };

export async function createApprovalRequest(
  input: CreateHitlApprovalInput
): Promise<{ id: string }> {
  const row = await withPrisma(
    (db) =>
      db.approvalRequest.create({
        data: {
          workflowExecutionId: input.workflowExecutionId,
          nodeId: input.nodeId,
          workspaceId: input.workspaceId,
          actionType: input.actionType,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          status: "PENDING",
        },
        select: { id: true },
      }),
    "hitl.approval.create"
  );
  return row;
}

export async function markExecutionPausedHitl(
  executionId: string,
  logs: unknown
): Promise<void> {
  await withPrisma(
    (db) =>
      db.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: "PAUSED_HITL",
          logs: logs as Prisma.InputJsonValue,
        },
      }),
    "hitl.execution.pause"
  );
}

export async function getApprovalStatus(
  approvalId: string
): Promise<ApprovalRequestStatus | null> {
  const row = await withPrisma(
    (db) =>
      db.approvalRequest.findUnique({
        where: { id: approvalId },
        select: { status: true },
      }),
    "hitl.approval.status"
  );
  return row?.status ?? null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll ApprovalRequest until APPROVED / REJECTED, abort, or timeout.
 */
export async function waitForApprovalResolution(
  approvalId: string,
  options?: { signal?: AbortSignal; maxWaitMs?: number; pollMs?: number }
): Promise<HitlWaitResult> {
  const maxWaitMs = options?.maxWaitMs ?? HITL_MAX_WAIT_MS;
  const pollMs = options?.pollMs ?? HITL_POLL_MS;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    if (options?.signal?.aborted) {
      return { status: "ABORTED", approvalId };
    }

    const status = await getApprovalStatus(approvalId);
    if (status === "APPROVED" || status === "REJECTED") {
      return { status, approvalId };
    }

    try {
      await sleep(pollMs, options?.signal);
    } catch {
      return { status: "ABORTED", approvalId };
    }
  }

  return { status: "TIMEOUT", approvalId };
}
