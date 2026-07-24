/**
 * Centralized agent domain types for runtime configuration,
 * execution pipelines, and workspace-scoped context.
 */

export enum AgentStatus {
  IDLE = "IDLE",
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
  TERMINATED = "TERMINATED",
}

export type AgentExecutionStepStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED";

export type AgentWorkspaceEnvironment = "SANDBOX" | "PRODUCTION";

export interface AgentConfig {
  id: string;
  name: string;
  templateId: string;
  tokenLimit: number;
  isEncrypted: boolean;
}

export interface AgentExecutionStep {
  stepId: string;
  stepName: string;
  status: AgentExecutionStepStatus;
  errorMessage?: string;
  startedAt: Date;
}

export interface AgentWorkspaceContext {
  workspaceId: string;
  environment: AgentWorkspaceEnvironment;
  apiEndpointStub: string;
}
