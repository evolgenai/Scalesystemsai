import type { AgentStatus } from "@prisma/client";

/** Client-facing visualizer states for dashboard cards. */
export type VisualizerStatus =
  | "IDLE"
  | "THINKING"
  | "EXECUTING"
  | "SUCCESS"
  | "ERROR";

export type AgentStreamEventType =
  | "log"
  | "agent_update"
  | "workflow_complete"
  | "heartbeat"
  | "error"
  | "result"
  | "summary"
  | "command";

export type AgentStreamEvent = {
  type: AgentStreamEventType;
  message: string;
  agentId?: string;
  agentName?: string;
  status?: VisualizerStatus;
  /** 0–100 overall workflow progress */
  progress?: number;
  stage?: string;
  prismaStatus?: AgentStatus;
  /** Linux-style command rendered in the verbose feed */
  command?: string;
  /** Human-friendly markdown for the results pane */
  resultMarkdown?: string;
  timestamp: string;
};

export type AgentCardState = {
  id: string;
  name: string;
  role: string;
  status: VisualizerStatus;
  progress: number;
  currentStage: string;
};

export const VISUALIZER_AGENTS: ReadonlyArray<
  Omit<AgentCardState, "status" | "progress" | "currentStage">
> = [
  {
    id: "lead-sentinel",
    name: "Lead Qualification Sentinel",
    role: "Revenue pipeline optimizer",
  },
  {
    id: "ops-orchestrator",
    name: "Systems Orchestrator",
    role: "Cross-platform workflow sync",
  },
  {
    id: "support-specialist",
    name: "Support Specialist",
    role: "L1/L2 autonomous resolver",
  },
  {
    id: "web-scraper",
    name: "WebScraper Sub-Agent",
    role: "Target extraction swarm node",
  },
  {
    id: "code-architect",
    name: "CodeArchitect Sub-Agent",
    role: "Architecture & codegen swarm node",
  },
] as const;

export function mapPrismaToVisualizer(
  status: AgentStatus
): VisualizerStatus {
  switch (status) {
    case "IDLE":
    case "PAUSED":
      return "IDLE";
    case "PLANNING":
    case "REFLECTING":
      return "THINKING";
    case "EXECUTING":
    case "ACTIVE":
      return "EXECUTING";
    case "ERROR":
      return "ERROR";
    default:
      return "IDLE";
  }
}

export function createStreamEvent(
  partial: Omit<AgentStreamEvent, "timestamp"> & { timestamp?: string }
): AgentStreamEvent {
  return {
    ...partial,
    timestamp: partial.timestamp ?? new Date().toISOString(),
  };
}

/** Encode a single SSE `data:` frame for a typed agent event. */
export function encodeSseData(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
