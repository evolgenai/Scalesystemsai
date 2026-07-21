import type { Edge, Node } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";

export type BlueprintNodeKind = "trigger" | "agent" | "action";

export type TriggerVariant = "webhook" | "schedule" | "event";
export type AgentVariant = "scraper" | "summarizer" | "sre";
export type ActionVariant = "discord" | "inventory" | "api";

export type NodeVariant = TriggerVariant | AgentVariant | ActionVariant;

export type NodeExecStatus =
  | "idle"
  | "running"
  | "paused"
  | "done"
  | "error";

export type BlueprintNodeData = {
  kind: BlueprintNodeKind;
  variant: NodeVariant;
  label: string;
  description: string;
  params: Record<string, string>;
  status?: NodeExecStatus;
  /** Runtime-only HITL / heal handlers — stripped on persist. */
  onApprove?: () => void;
  onRetry?: () => void;
};

export type BlueprintNode = Node<BlueprintNodeData>;
export type BlueprintEdge = Edge;

export type PaletteItem = {
  id: string;
  kind: BlueprintNodeKind;
  variant: NodeVariant;
  label: string;
  description: string;
  defaults: Record<string, string>;
  icon: LucideIcon;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  blurb: string;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
};

export type ExecutionLogEntry = {
  id: string;
  nodeId: string;
  label: string;
  message: string;
  at: number;
  status: "running" | "paused" | "done" | "error";
};

export type RunnerState = {
  status: "idle" | "simulating" | "paused" | "deploying" | "saved";
  activeNodeId: string | null;
  completedNodeIds: string[];
  logs: ExecutionLogEntry[];
};
