"use server";

/**
 * Server Actions — swarm telemetry stats + synthesized skill queries.
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

export async function getSwarmTelemetryAction(input?: {
  workspaceId?: string | null;
  sessionId?: string | null;
  limit?: number;
}): Promise<ServerActionResult<SwarmTelemetrySnapshot>> {
  return withServerActionTelemetry(
    {
      actionName: "telemetry.swarm",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: input?.workspaceId ?? undefined,
    },
    async () => getSwarmTelemetry(input)
  );
}

export async function recordSwarmHandOffAction(
  input: RecordHandOffTraceInput
): Promise<ServerActionResult<SwarmHandOffTrace>> {
  return withServerActionTelemetry(
    {
      actionName: "telemetry.swarm.handOff",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: input.workspaceId ?? undefined,
    },
    async () => recordHandOffTrace(input)
  );
}

export async function recordSwarmTokensAction(
  input: RecordTokenUsageInput
): Promise<ServerActionResult<TokenUsageEvent>> {
  return withServerActionTelemetry(
    {
      actionName: "telemetry.swarm.tokens",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: input.workspaceId ?? undefined,
    },
    async () => recordTokenUsage(input)
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
  return withServerActionTelemetry(
    {
      actionName: "memory.skills.query",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: input.workspaceId,
    },
    async () => querySkillsForPatch(input)
  );
}

export async function synthesizeSkillsAction(
  input: SynthesizeSkillsRequest
): Promise<ServerActionResult<SynthesizeSkillsResult>> {
  return withServerActionTelemetry(
    {
      actionName: "memory.skills.synthesize",
      source: "server_action",
      route: "actions/telemetry",
      tenantId: input.workspaceId,
    },
    async () => synthesizeSkillsFromMemory(input)
  );
}
