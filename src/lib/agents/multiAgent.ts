import type { AgentStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { executeToolByName } from "@/lib/agents/tools/registry";

export type AgentArchetype = "OpsAgent" | "SecurityAgent";

export type AgentArchetypeDefinition = {
  name: AgentArchetype;
  prismaName: string;
  focus: string;
  objective: string;
  tools: string[];
};

export const AGENT_ARCHETYPE_REGISTRY: Record<
  AgentArchetype,
  AgentArchetypeDefinition
> = {
  OpsAgent: {
    name: "OpsAgent",
    prismaName: "Ops Agent",
    focus: "System quotas and log parsing",
    objective: "Operational quota governance and telemetry log parsing",
    tools: ["readLocalLogs", "optimizeWorkspaceBounds"],
  },
  SecurityAgent: {
    name: "SecurityAgent",
    prismaName: "Security Agent",
    focus: "API token verification and system threat monitoring",
    objective: "Credential audit trails and runtime threat surface monitoring",
    tools: ["readLocalLogs"],
  },
};

export type AgentHandoffResult = {
  from: string;
  to: AgentArchetype;
  targetAgentId: string;
  targetAgentName: string;
  taskContext: string;
  targetToolResults: Array<{ tool: string; result: string }>;
};

export async function ensureArchetypeAgent(
  archetype: AgentArchetype
): Promise<{ id: string; name: string }> {
  const definition = AGENT_ARCHETYPE_REGISTRY[archetype];
  const prisma = getPrisma();

  const existing = await prisma.agent.findFirst({
    where: { name: definition.prismaName },
    select: { id: true, name: true },
  });

  if (existing) return existing;

  const created = await prisma.agent.create({
    data: {
      name: definition.prismaName,
      objective: definition.objective,
      status: "IDLE",
      memoryBank: [],
    },
    select: { id: true, name: true },
  });

  return created;
}

export async function executeAgentHandoff(params: {
  sourceAgentId: string;
  sourceAgentName: string;
  targetAgent: AgentArchetype;
  taskContext: string;
}): Promise<string> {
  const prisma = getPrisma();
  const targetDefinition = AGENT_ARCHETYPE_REGISTRY[params.targetAgent];
  const target = await ensureArchetypeAgent(params.targetAgent);

  await prisma.agent.update({
    where: { id: params.sourceAgentId },
    data: {
      status: "PAUSED" satisfies AgentStatus,
      currentTask: `Handed off operational token to ${params.targetAgent}`,
    },
  });

  await prisma.agent.update({
    where: { id: target.id },
    data: {
      status: "ACTIVE" satisfies AgentStatus,
      objective: params.taskContext,
      currentTask: `Lifecycle matrix booted — assumed control from ${params.sourceAgentName}`,
    },
  });

  const targetToolResults: Array<{ tool: string; result: string }> = [];

  for (const toolName of targetDefinition.tools) {
    const result = await executeToolByName(toolName, {
      objective: params.taskContext,
      handedOffFrom: params.sourceAgentName,
      archetype: params.targetAgent,
      taskContext: params.taskContext,
    });
    targetToolResults.push({ tool: toolName, result });
  }

  const handoffResult: AgentHandoffResult = {
    from: params.sourceAgentName,
    to: params.targetAgent,
    targetAgentId: target.id,
    targetAgentName: target.name,
    taskContext: params.taskContext,
    targetToolResults,
  };

  return JSON.stringify(handoffResult, null, 2);
}

export function requiresCrossoverHandoff(objective: string): boolean {
  const normalized = objective.toLowerCase();
  const wantsSecurity =
    /audit|key|token|security|threat|verify|credential/.test(normalized);
  const wantsOps =
    /quota|optimi|log|metric|workspace|bound|runtime|parse/.test(normalized);
  return wantsSecurity && wantsOps;
}

export function resolveHandoffTarget(objective: string): AgentArchetype {
  const normalized = objective.toLowerCase();
  if (/audit|key|token|security|threat|verify|credential/.test(normalized)) {
    return "SecurityAgent";
  }
  return "OpsAgent";
}

export function resolvePrimaryArchetype(objective: string): AgentArchetype | null {
  const normalized = objective.toLowerCase();
  const wantsSecurity =
    /audit|key|token|security|threat|verify|credential/.test(normalized);
  const wantsOps =
    /quota|optimi|log|metric|workspace|bound|runtime|parse/.test(normalized);

  if (wantsSecurity && !wantsOps) return "SecurityAgent";
  if (wantsOps && !wantsSecurity) return "OpsAgent";
  return null;
}
