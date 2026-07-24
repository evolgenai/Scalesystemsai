"use server";

/**
 * Server Actions — agent memory, spatial HUD feed, and swarm hand-off.
 * All tenant-scoped actions require workspaceId (Sprint 53 multi-tenant).
 */

import {
  storeAgentMemory,
  recallAgentMemory,
  type StoreAgentMemoryInput,
  type RecallAgentMemoryQuery,
  type AgentMemoryEntry,
} from "@/lib/agents/agentMemoryStore";
import {
  buildSpatialMemoryFeed,
  type SpatialMemoryFeed,
} from "@/lib/spatial/memoryFeed";
import {
  runAgentHandOff,
  type HandOffResult,
} from "@/lib/agents/handOff";
import {
  withServerActionTelemetry,
  type ServerActionResult,
} from "@/lib/sentry";
import { getTextureMatrix, type TextureMatrix } from "@/lib/theme/textureMatrix";

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

export async function storeAgentMemoryAction(
  input: StoreAgentMemoryInput & { workspaceId: string }
): Promise<ServerActionResult<AgentMemoryEntry>> {
  const workspaceId = requireWorkspaceId(input.workspaceId, "memory.store");
  return withServerActionTelemetry(
    {
      actionName: "memory.store",
      source: "server_action",
      route: "actions/memory",
      tenantId: workspaceId,
      extra: { kind: input.kind },
    },
    async () =>
      storeAgentMemory({
        ...input,
        workspaceId,
        source: input.source ?? "server_action",
      })
  );
}

export async function recallAgentMemoryAction(
  query: RecallAgentMemoryQuery & { workspaceId: string }
): Promise<
  ServerActionResult<Awaited<ReturnType<typeof recallAgentMemory>>>
> {
  const workspaceId = requireWorkspaceId(query.workspaceId, "memory.recall");
  return withServerActionTelemetry(
    {
      actionName: "memory.recall",
      source: "server_action",
      route: "actions/memory",
      tenantId: workspaceId,
    },
    async () =>
      recallAgentMemory({
        ...query,
        workspaceId,
        strictTenant: query.strictTenant ?? Boolean(query.sessionId),
      })
  );
}

export async function getTextureMatrixAction(): Promise<
  ServerActionResult<TextureMatrix>
> {
  return withServerActionTelemetry(
    {
      actionName: "theme.textureMatrix",
      source: "server_action",
      route: "actions/theme",
    },
    async () => getTextureMatrix()
  );
}

export async function spatialMemoryFeedAction(input: {
  nodeType?: string | null;
  userId?: string | null;
  workspaceId: string;
  sessionId?: string | null;
  limit?: number;
}): Promise<ServerActionResult<SpatialMemoryFeed>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "spatial.memoryFeed"
  );
  return withServerActionTelemetry(
    {
      actionName: "spatial.memoryFeed",
      source: "server_action",
      route: "actions/memory",
      tenantId: workspaceId,
      extra: { nodeType: input.nodeType ?? null },
    },
    async () => buildSpatialMemoryFeed({ ...input, workspaceId })
  );
}

export async function agentHandOffAction(input: {
  sentryErrorId: string;
  sessionId: string;
  fromAgentId?: string;
  toAgentId?: string;
  workspaceId: string;
  issueTitle?: string;
  userId?: string | null;
}): Promise<ServerActionResult<HandOffResult>> {
  const workspaceId = requireWorkspaceId(input.workspaceId, "agents.handOff");
  return withServerActionTelemetry(
    {
      actionName: "agents.handOff",
      source: "server_action",
      route: "actions/agents",
      tenantId: workspaceId,
      extra: { sentryErrorId: input.sentryErrorId },
    },
    async () =>
      runAgentHandOff({
        sentryErrorId: input.sentryErrorId,
        sessionId: input.sessionId,
        fromAgentId: input.fromAgentId ?? "agent-a",
        toAgentId: input.toAgentId ?? "meta-sre",
        workspaceId,
        issueTitle: input.issueTitle,
        userId: input.userId,
      })
  );
}

export async function executePatchAction(input: {
  sentryErrorId: string;
  sessionId: string;
  workspaceId: string;
  autoPatch: import("@/lib/agents/handOff").AutoPatchPayload;
  agentId?: string;
  userId?: string | null;
}): Promise<
  ServerActionResult<import("@/lib/agents/executePatch").ExecutePatchResult>
> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "agents.executePatch"
  );
  const { executeAutoPatch } = await import("@/lib/agents/executePatch");
  return withServerActionTelemetry(
    {
      actionName: "agents.executePatch",
      source: "server_action",
      route: "actions/agents",
      tenantId: workspaceId,
      extra: { sentryErrorId: input.sentryErrorId },
    },
    async () =>
      executeAutoPatch({
        ...input,
        workspaceId,
        mode: "virtual",
      })
  );
}

export async function parseSpatialCommandAction(input: {
  command: string;
  seed?: string;
  sessionId?: string;
  workspaceId?: string;
}): Promise<
  ServerActionResult<
    import("@/lib/spatial/commandParser").ParsedSpatialCommand
  >
> {
  const { parseSpatialCommand } = await import("@/lib/spatial/commandParser");
  return withServerActionTelemetry(
    {
      actionName: "spatial.commandParser",
      source: "server_action",
      route: "actions/spatial",
      tenantId: input.workspaceId?.trim() || undefined,
    },
    async () => parseSpatialCommand(input)
  );
}
