"use server";

/**
 * Server Actions — swarm telemetry, skills, workspaces, node health.
 * Tenant-scoped actions require workspaceId (Sprint 53).
 */

import {
  withServerActionTelemetry,
  type ServerActionResult,
} from "@/lib/sentry";
import {
  getSwarmTelemetry,
  recordHandOffTrace,
  recordTokenUsage,
  type SwarmTelemetrySnapshot,
  type RecordHandOffTraceInput,
  type RecordTokenUsageInput,
  type SwarmHandOffTrace,
  type TokenUsageEvent,
} from "@/lib/telemetry/swarmTelemetry";
import {
  querySkillsForPatch,
  synthesizeSkillsFromMemory,
  type QuerySkillsRequest,
  type SynthesizeSkillsRequest,
  type SynthesizeSkillsResult,
} from "@/lib/agents/skillSynthesis";
import type { SkillDocument } from "@/lib/agents/skillDocumentStore";
import {
  listWorkspaces,
  switchActiveWorkspace,
  type WorkspaceSummary,
  type SwitchWorkspaceInput,
} from "@/lib/workspace/workspaceRegistry";
import {
  analyzeNodeHealth,
  type NodeHealthQuery,
  type NodeHealthSnapshot,
} from "@/lib/spatial/nodeHealth";

function requireWorkspaceId(
  workspaceId: string | null | undefined,
  actionName: string
): string {
  const id = workspaceId?.trim();
  if (!id) {
    throw new Error(
      `${actionName} requires workspaceId for multi-tenant isolation.`
    );
  }
  return id;
}

export async function getSwarmTelemetryAction(input: {
  workspaceId: string;
  sessionId: string;
  limit?: number;
}): Promise<ServerActionResult<SwarmTelemetrySnapshot>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "telemetry.swarm"
  );
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    throw new Error(
      "telemetry.swarm requires sessionId for multi-tenant isolation."
    );
  }
  return withServerActionTelemetry(
    {
      actionName: "telemetry.swarm",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: workspaceId,
      extra: { sessionId },
    },
    async () => getSwarmTelemetry({ ...input, workspaceId, sessionId })
  );
}

export async function recordSwarmHandOffAction(
  input: RecordHandOffTraceInput & { workspaceId: string }
): Promise<ServerActionResult<SwarmHandOffTrace>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "telemetry.swarm.handOff"
  );
  return withServerActionTelemetry(
    {
      actionName: "telemetry.swarm.handOff",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: workspaceId,
    },
    async () => recordHandOffTrace({ ...input, workspaceId })
  );
}

export async function recordSwarmTokensAction(
  input: RecordTokenUsageInput & { workspaceId: string }
): Promise<ServerActionResult<TokenUsageEvent>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "telemetry.swarm.tokens"
  );
  return withServerActionTelemetry(
    {
      actionName: "telemetry.swarm.tokens",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: workspaceId,
    },
    async () => recordTokenUsage({ ...input, workspaceId })
  );
}

export async function querySkillsAction(
  input: QuerySkillsRequest
): Promise<
  ServerActionResult<{
    skills: SkillDocument[];
    matched: boolean;
    best: SkillDocument | null;
    skipLlm: boolean;
    reason: string;
  }>
> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "memory.skills.query"
  );
  return withServerActionTelemetry(
    {
      actionName: "memory.skills.query",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: workspaceId,
    },
    async () => querySkillsForPatch({ ...input, workspaceId })
  );
}

export async function synthesizeSkillsAction(
  input: SynthesizeSkillsRequest
): Promise<ServerActionResult<SynthesizeSkillsResult>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "memory.skills.synthesize"
  );
  return withServerActionTelemetry(
    {
      actionName: "memory.skills.synthesize",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: workspaceId,
    },
    async () => synthesizeSkillsFromMemory({ ...input, workspaceId })
  );
}

export async function listWorkspacesAction(input?: {
  includeDemo?: boolean;
}): Promise<ServerActionResult<WorkspaceSummary[]>> {
  return withServerActionTelemetry(
    {
      actionName: "workspaces.list",
      source: "server_action",
      route: "actions/telemetry",
    },
    async () => listWorkspaces(input)
  );
}

export async function switchWorkspaceAction(
  input: SwitchWorkspaceInput
): Promise<
  ServerActionResult<{
    activeWorkspaceId: string;
    workspace: WorkspaceSummary | null;
    sessionKey: string;
  }>
> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "workspaces.switch"
  );
  return withServerActionTelemetry(
    {
      actionName: "workspaces.switch",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: workspaceId,
    },
    async () =>
      switchActiveWorkspace({ ...input, action: "switch", workspaceId })
  );
}

export async function getNodeHealthAction(
  input: NodeHealthQuery & { workspaceId: string }
): Promise<ServerActionResult<NodeHealthSnapshot>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "spatial.nodeHealth"
  );
  return withServerActionTelemetry(
    {
      actionName: "spatial.nodeHealth",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: workspaceId,
    },
    async () => analyzeNodeHealth({ ...input, workspaceId })
  );
}
