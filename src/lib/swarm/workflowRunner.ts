/**
 * Asynchronous workflow runner — parses blueprint graphs and drives the swarm.
 */

import { z } from "zod";
import { deductGasForNodes } from "@/lib/billing/gasMeter";
import { withPrisma } from "@/lib/prisma";
import {
  SwarmOrchestrator,
} from "@/lib/swarm/swarmOrchestrator";
import {
  WorkflowEdgeSchema,
  WorkflowNodeSchema,
  type SwarmRunSummary,
  type WorkflowEdge,
  type WorkflowLogEntry,
  type WorkflowNode,
} from "@/lib/swarm/types";
import type { WorkflowExecutionStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export const CreateWorkflowSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).optional().nullable(),
  nodes: z.array(WorkflowNodeSchema).max(200).default([]),
  edges: z.array(WorkflowEdgeSchema).max(400).default([]),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
});

export const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

export const ExecuteWorkflowSchema = z.object({
  triggerPayload: z.record(z.string(), z.unknown()).default({}),
  /** When false, respond with JSON summary instead of SSE. Default true. */
  stream: z.boolean().default(true),
  maxParallel: z.number().int().min(1).max(8).optional(),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type ExecuteWorkflowInput = z.infer<typeof ExecuteWorkflowSchema>;

export function parseGraphJson(
  nodesRaw: unknown,
  edgesRaw: unknown
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodesParsed = z.array(WorkflowNodeSchema).safeParse(
    Array.isArray(nodesRaw) ? nodesRaw : []
  );
  const edgesParsed = z.array(WorkflowEdgeSchema).safeParse(
    Array.isArray(edgesRaw) ? edgesRaw : []
  );

  if (!nodesParsed.success) {
    throw new Error(
      `Invalid nodes graph: ${nodesParsed.error.issues[0]?.message ?? "parse error"}`
    );
  }
  if (!edgesParsed.success) {
    throw new Error(
      `Invalid edges graph: ${edgesParsed.error.issues[0]?.message ?? "parse error"}`
    );
  }

  return { nodes: nodesParsed.data, edges: edgesParsed.data };
}

export type RunWorkflowOptions = {
  workspaceId: string;
  blueprintId: string;
  triggerPayload?: Record<string, unknown>;
  maxParallel?: number;
  signal?: AbortSignal;
  onLog?: (entry: WorkflowLogEntry) => void;
  onStatus?: (event: {
    status: SwarmRunSummary["status"];
    nodeId?: string;
    approvalId?: string;
    data?: unknown;
  }) => void;
};
/**
 * Persist a PENDING execution, run the swarm, then finalize status + logs.
 */
export async function runWorkflowBlueprint(
  options: RunWorkflowOptions
): Promise<SwarmRunSummary> {
  const blueprint = await withPrisma(
    (db) =>
      db.workflowBlueprint.findFirst({
        where: {
          id: options.blueprintId,
          workspaceId: options.workspaceId,
        },
      }),
    "workflows.blueprint.load"
  );

  if (!blueprint) {
    throw new Error("Workflow blueprint not found in this workspace.");
  }

  const { nodes, edges } = parseGraphJson(blueprint.nodes, blueprint.edges);

  // Gas pre-flight: deduct per-node credits before the swarm starts.
  await deductGasForNodes(
    options.workspaceId,
    nodes.map((n) => n.type)
  );

  const execution = await withPrisma(
    (db) =>
      db.workflowExecution.create({
        data: {
          blueprintId: blueprint.id,
          status: "RUNNING",
          logs: [],
          triggerPayload: (options.triggerPayload ??
            {}) as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      }),
    "workflows.execution.create"
  );

  const orchestrator = new SwarmOrchestrator({
    workspaceId: options.workspaceId,
    blueprintId: blueprint.id,
    executionId: execution.id,
    nodes,
    edges,
    triggerPayload: options.triggerPayload ?? {},
    signal: options.signal,
    maxParallel: options.maxParallel,
    onLog: options.onLog,
    onStatus: options.onStatus,
  });

  let summary: SwarmRunSummary;
  try {
    summary = await orchestrator.run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedLogs = [
      ...orchestrator.getLogs(),
      {
        ts: new Date().toISOString(),
        level: "error" as const,
        message: `Orchestrator crashed: ${message}`,
      },
    ];
    await withPrisma(
      (db) =>
        db.workflowExecution.update({
          where: { id: execution.id },
          data: {
            status: "FAILED",
            logs: failedLogs as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        }),
      "workflows.execution.crash"
    );
    throw err;
  }

  const status = summary.status as WorkflowExecutionStatus;
  const isPaused = status === "PAUSED_HITL";
  await withPrisma(
    (db) =>
      db.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status,
          logs: summary.logs as unknown as Prisma.InputJsonValue,
          ...(isPaused
            ? { completedAt: null }
            : { completedAt: new Date(summary.completedAt) }),
        },
      }),
    "workflows.execution.finalize"
  );

  return summary;
}