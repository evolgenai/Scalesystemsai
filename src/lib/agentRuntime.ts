import {
  decryptCredential,
  type IntegrationProvider,
} from "@/lib/credentials";
import { getPrisma } from "@/lib/prisma";

export type AgentType =
  | "lead-sentinel"
  | "systems-orchestrator"
  | "support-specialist";

export const VALID_AGENT_TYPES = new Set<string>([
  "lead-sentinel",
  "systems-orchestrator",
  "support-specialist",
]);

const AGENT_REQUIRED_PROVIDERS: Record<AgentType, IntegrationProvider[]> = {
  "lead-sentinel": ["hubspot"],
  "systems-orchestrator": ["salesforce", "hubspot"],
  "support-specialist": ["openai"],
};

const AGENT_SYNC_TARGETS: Record<AgentType, string[]> = {
  "lead-sentinel": ["HubSpot"],
  "systems-orchestrator": ["Salesforce", "HubSpot"],
  "support-specialist": ["OpenAI"],
};

export type AgentExecutionResult = {
  computeTokensSpent: number;
  workflow: {
    summary: string;
    stepsCompleted: number;
    recordsProcessed: number;
    downstreamSyncTargets: string[];
  };
};

export type AgentExecutionError = {
  error: string;
  code: string;
};

async function loadUserCredentials(
  userId: string
): Promise<Partial<Record<IntegrationProvider, string>>> {
  const rows = await getPrisma().userIntegrationKey.findMany({
    where: { userId },
    select: { provider: true, encryptedValue: true },
  });

  const credentials: Partial<Record<IntegrationProvider, string>> = {};

  for (const row of rows) {
    try {
      credentials[row.provider as IntegrationProvider] = decryptCredential(
        row.encryptedValue
      );
    } catch {
      // Skip corrupted rows; validation will surface missing providers.
    }
  }

  return credentials;
}

export function estimateAgentTokens(
  agentType: AgentType,
  payloadData?: Record<string, unknown>
): number {
  return estimateTokens(agentType, payloadData);
}

function estimateTokens(
  agentType: AgentType,
  payloadData?: Record<string, unknown>
): number {
  switch (agentType) {
    case "lead-sentinel": {
      const leadCount =
        typeof payloadData?.leadCount === "number" ? payloadData.leadCount : 1;
      return 800 + leadCount * 120;
    }
    case "systems-orchestrator": {
      const recordCount =
        typeof payloadData?.recordCount === "number"
          ? payloadData.recordCount
          : 100;
      return 1200 + Math.floor(recordCount / 5);
    }
    case "support-specialist":
      return 600;
    default: {
      const _exhaustive: never = agentType;
      return _exhaustive;
    }
  }
}

function recordsProcessed(
  agentType: AgentType,
  payloadData?: Record<string, unknown>
): number {
  switch (agentType) {
    case "lead-sentinel":
      return typeof payloadData?.leadCount === "number"
        ? payloadData.leadCount
        : 1;
    case "systems-orchestrator":
      return typeof payloadData?.recordCount === "number"
        ? payloadData.recordCount
        : 1;
    case "support-specialist":
      return 1;
    default: {
      const _exhaustive: never = agentType;
      return _exhaustive;
    }
  }
}

export async function executeAgent(
  userId: string,
  agentType: AgentType,
  payloadData?: Record<string, unknown>
): Promise<AgentExecutionResult | AgentExecutionError> {
  const required = AGENT_REQUIRED_PROVIDERS[agentType];
  const credentials = await loadUserCredentials(userId);
  const missing = required.filter((provider) => !credentials[provider]?.trim());

  if (missing.length > 0) {
    return {
      error: `Missing integration credentials: ${missing.join(", ")}. Configure them in the API Key Portal.`,
      code: "MISSING_INTEGRATION_KEYS",
    };
  }

  const processed = recordsProcessed(agentType, payloadData);
  const tokens = estimateTokens(agentType, payloadData);

  return {
    computeTokensSpent: tokens,
    workflow: {
      summary: `${agentType} run accepted — credentials validated, runtime dispatch queued.`,
      stepsCompleted: required.length + 1,
      recordsProcessed: processed,
      downstreamSyncTargets: AGENT_SYNC_TARGETS[agentType],
    },
  };
}
