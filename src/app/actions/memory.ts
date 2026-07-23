"use server";

/**
 * Server Actions — agent memory store / recall for Meta-SRE persistence.
 */

import {
  storeAgentMemory,
  recallAgentMemory,
  type StoreAgentMemoryInput,
  type RecallAgentMemoryQuery,
  type AgentMemoryEntry,
} from "@/lib/agents/agentMemoryStore";
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
    async () => storeAgentMemory({ ...input, source: input.source ?? "server_action" })
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
