"use server";

/**
 * Server Actions — agent memory, spatial HUD feed, and swarm hand-off.
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

export async function storeAgentMemoryAction(
  input: StoreAgentMemoryInput
): Promise<ServerActionResult<AgentMemoryEntry>> {
  return withServerActionTelemetry(
    {
      actionName: "memory.store",
      source: "server_action",
      route: "actions/memory",
      extra: { kind: input.kind },
    },
    async () =>
      storeAgentMemory({ ...input, source: input.source ?? "server_action" })
  );
}

export async function recallAgentMemoryAction(
  query: RecallAgentMemoryQuery
): Promise<
  ServerActionResult<Awaited<ReturnType<typeof recallAgentMemory>>>
> {
  return withServerActionTelemetry(
    {
      actionName: "memory.recall",
      source: "server_action",
      route: "actions/memory",
    },
    async () => recallAgentMemory(query)
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
  workspaceId?: string | null;
  sessionId?: string | null;
  limit?: number;
}): Promise<ServerActionResult<SpatialMemoryFeed>> {
  return withServerActionTelemetry(
    {
      actionName: "spatial.memoryFeed",
      source: "server_action",
      route: "actions/memory",
      extra: { nodeType: input.nodeType ?? null },
    },
    async () => buildSpatialMemoryFeed(input)
  );
}

export async function agentHandOffAction(input: {
  sentryErrorId: string;
  sessionId: string;
  fromAgentId?: string;
  toAgentId?: string;
  workspaceId?: string | null;
  issueTitle?: string;
  userId?: string | null;
}): Promise<ServerActionResult<HandOffResult>> {
  return withServerActionTelemetry(
    {
      actionName: "agents.handOff",
      source: "server_action",
      route: "actions/agents",
      extra: { sentryErrorId: input.sentryErrorId },
    },
    async () =>
      runAgentHandOff({
        sentryErrorId: input.sentryErrorId,
        sessionId: input.sessionId,
        fromAgentId: input.fromAgentId ?? "agent-a",
        toAgentId: input.toAgentId ?? "meta-sre",
        workspaceId: input.workspaceId,
        issueTitle: input.issueTitle,
        userId: input.userId,
      })
  );
}
