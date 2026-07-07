export type AgentId =
  | "lead-sentinel"
  | "ops-orchestrator"
  | "support-specialist";

export type FeedTone = "cyan" | "purple" | "emerald" | "amber" | "system";

export type FeedEntry = {
  id: string;
  agent: string;
  message: string;
  timestamp: string;
  tone: FeedTone;
};

export type AgentStates = Record<AgentId, boolean>;
