import type { AgentId } from "@/components/dashboard/types";

export type AgentRuntimeSuccess = {
  success: true;
  runId: string;
  agentType: string;
  workflow: {
    summary: string;
    stepsCompleted: number;
    recordsProcessed: number;
  };
  computeTokensSpent: number;
};

export type AgentRuntimeFailure = {
  success: false;
  error: string;
  code: string;
};

export type AgentRuntimeResult = AgentRuntimeSuccess | AgentRuntimeFailure;

const AGENT_API_TYPE: Record<AgentId, string> = {
  "lead-sentinel": "lead-sentinel",
  "ops-orchestrator": "systems-orchestrator",
  "support-specialist": "support-specialist",
};

export function resolveAgentApiType(agentId: AgentId): string {
  return AGENT_API_TYPE[agentId];
}

export async function executeAgentRun(params: {
  userId: string;
  clientApiKey: string;
  agentId: AgentId;
  payloadData?: Record<string, unknown>;
}): Promise<AgentRuntimeResult> {
  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: params.userId,
        clientApiKey: params.clientApiKey,
        agentType: resolveAgentApiType(params.agentId),
        payloadData: params.payloadData,
      }),
    });

    const data = (await response.json()) as AgentRuntimeSuccess | AgentRuntimeFailure;

    if (!response.ok || !data.success) {
      return {
        success: false,
        error:
          "error" in data && data.error
            ? data.error
            : "Agent runtime request failed.",
        code: "code" in data && data.code ? data.code : "AGENT_RUN_FAILED",
      };
    }

    return data;
  } catch {
    return {
      success: false,
      error: "Unable to reach the agent runtime router.",
      code: "NETWORK_ERROR",
    };
  }
}
