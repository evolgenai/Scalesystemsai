import type { AgentStatus } from "@prisma/client";

export type { DebateRole } from "@/lib/agents/debateEngine";

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
  | "command"
  | "paused"
  | "resumed"
  | "debate_turn"
  | "consensus_pending"
  | "memory_recalled"
  | "sandbox_execution";

export type RecalledMemoryItem = {
  id: string;
  text: string;
  score: number;
};

export type SandboxLanguage = "python" | "javascript";

export type SandboxExecutionStatus =
  | "idle"
  | "running"
  | "success"
  | "error";

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
  /** Human-friendly markdown for the Results Pane */
  resultMarkdown?: string;
  /** Live SwarmSession id for HITL steering */
  sessionId?: string;
  /** Debate panel role for `debate_turn` events */
  role?: "creator" | "critic";
  /** Debate turn body (mirrors message for FE convenience) */
  text?: string;
  /** Semantic memory hits for `memory_recalled` events */
  memories?: RecalledMemoryItem[];
  /** Sandbox runner fields for `sandbox_execution` events */
  language?: SandboxLanguage | string;
  code?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  sandboxStatus?: SandboxExecutionStatus;
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

/** Tailwind dot class for non-running sandbox status indicators. */
export function sandboxStatusIndicatorClass(
  status: Exclude<SandboxExecutionStatus, "running">
): string {
  if (status === "success") {
    return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]";
  }
  if (status === "error") return "bg-rose-400";
  return "bg-slate-500";
}
