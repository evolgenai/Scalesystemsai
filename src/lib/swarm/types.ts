/**
 * Shared types for visual workflow graphs and swarm orchestration.
 */

import { z } from "zod";

export const WORKFLOW_NODE_TYPES = [
  "trigger",
  "scraper",
  "sre",
  "ai",
  "discord",
  "sandbox",
  "agent",
  "sequence",
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export const WorkflowNodeDataSchema = z
  .object({
    label: z.string().trim().max(256).optional(),
    /** scraper */
    url: z.string().url().optional(),
    /** ai / sre / agent */
    prompt: z.string().trim().max(8_000).optional(),
    objective: z.string().trim().max(4_000).optional(),
    /** discord */
    title: z.string().trim().max(256).optional(),
    message: z.string().trim().max(2_000).optional(),
    /** sandbox */
    code: z.string().max(12_000).optional(),
    language: z.enum(["javascript", "python"]).optional(),
    /** parallel fan-out group id */
    parallelGroup: z.string().trim().max(64).optional(),
    /** agent persona / role */
    persona: z.string().trim().max(64).optional(),
    /** When true, orchestrator pauses and waits for HITL approval. */
    requiresApproval: z.boolean().optional(),
  })
  .passthrough();

export const WorkflowNodeSchema = z.object({
  id: z.string().trim().min(1).max(128),
  type: z.string().trim().min(1).max(64),
  data: WorkflowNodeDataSchema.optional().default({}),
  position: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .optional(),
});

export const WorkflowEdgeSchema = z.object({
  id: z.string().trim().min(1).max(128),
  source: z.string().trim().min(1).max(128),
  target: z.string().trim().min(1).max(128),
  sourceHandle: z.string().optional().nullable(),
  targetHandle: z.string().optional().nullable(),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export type WorkflowLogLevel = "info" | "warn" | "error" | "success" | "debug";

export type WorkflowLogEntry = {
  ts: string;
  level: WorkflowLogLevel;
  nodeId?: string;
  nodeType?: string;
  message: string;
  data?: unknown;
};

export type AgentContextBag = {
  key: string;
  value: unknown;
  fromNodeId: string;
  at: string;
};

export type NodeExecutionResult = {
  ok: boolean;
  nodeId: string;
  nodeType: string;
  output: unknown;
  error?: string;
  durationMs: number;
  healed?: boolean;
  healSummary?: string | null;
};

export type SwarmRunStatus =
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "PAUSED_HITL";

export type SwarmRunSummary = {
  executionId: string;
  blueprintId: string;
  workspaceId: string;
  status: SwarmRunStatus;
  results: NodeExecutionResult[];
  context: Record<string, unknown>;
  logs: WorkflowLogEntry[];
  startedAt: string;
  completedAt: string;
  /** Present when the run halted for Human-In-The-Loop approval. */
  pendingApprovalId?: string;
  pausedNodeId?: string;
};

export function normalizeNodeType(raw: string): WorkflowNodeType | "unknown" {
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (t === "web_scraper" || t === "webscraper" || t === "extract") return "scraper";
  if (t === "meta_sre" || t === "heal" || t === "sre_ai") return "sre";
  if (t === "llm" || t === "gemini" || t === "openai") return "ai";
  if (t === "notify" || t === "notification" || t === "webhook") return "discord";
  if (t === "code" || t === "vm" || t === "sandbox_run") return "sandbox";
  if (t === "swarm_agent" || t === "worker") return "agent";
  if (t === "start" || t === "input") return "trigger";
  if (t === "seq" || t === "step") return "sequence";
  if ((WORKFLOW_NODE_TYPES as readonly string[]).includes(t)) {
    return t as WorkflowNodeType;
  }
  return "unknown";
}
