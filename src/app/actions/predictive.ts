"use server";

/**
 * Server Actions — predictive self-tune + fleet health + edge CLI.
 * Fully scoped by workspaceId (+ sessionId) for Sprint 54 visual scoping.
 */

import {
  withServerActionTelemetry,
  type ServerActionResult,
} from "@/lib/sentry";
import {
  runPredictiveTune,
  buildPredictiveTune,
  type PredictiveTuneRequest,
  type PredictiveTuneResult,
  type PredictiveTuneQuery,
  type PredictiveTuneSnapshot,
} from "@/lib/spatial/predictiveTune";
import {
  getFleetHealth,
  type FleetHealthRequest,
  type FleetHealthSnapshot,
} from "@/lib/spatial/fleetHealth";
import {
  executeEdgeCommand,
  type EdgeTerminalRequest,
  type EdgeTerminalResult,
} from "@/lib/edge/edgeTerminal";

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

function requireSessionId(
  sessionId: string | null | undefined,
  actionName: string
): string {
  const id = sessionId?.trim();
  if (!id) {
    throw new Error(
      `${actionName} requires sessionId for multi-tenant isolation.`
    );
  }
  return id;
}

export async function triggerPredictiveTuneAction(
  input: PredictiveTuneRequest
): Promise<ServerActionResult<PredictiveTuneResult>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "spatial.predictiveTune"
  );
  const sessionId = requireSessionId(
    input.sessionId,
    "spatial.predictiveTune"
  );
  return withServerActionTelemetry(
    {
      actionName: "spatial.predictiveTune",
      source: "server_action",
      route: "actions/predictive",
      tenantId: workspaceId,
      extra: {
        sessionId,
        riskThreshold: input.riskThreshold,
      },
    },
    async () =>
      runPredictiveTune({
        ...input,
        workspaceId,
        sessionId,
        autoPatch: input.autoPatch ?? true,
      })
  );
}

export async function buildPredictiveTuneAction(
  input: PredictiveTuneQuery = {}
): Promise<ServerActionResult<PredictiveTuneSnapshot>> {
  return withServerActionTelemetry(
    {
      actionName: "spatial.buildPredictiveTune",
      source: "server_action",
      route: "actions/predictive",
      tenantId: input.workspaceId?.trim() || undefined,
      extra: { sessionId: input.sessionId ?? null },
    },
    async () => buildPredictiveTune(input)
  );
}

export async function getFleetHealthAction(
  input: FleetHealthRequest
): Promise<ServerActionResult<FleetHealthSnapshot>> {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    "spatial.fleetHealth"
  );
  const sessionId = requireSessionId(input.sessionId, "spatial.fleetHealth");
  return withServerActionTelemetry(
    {
      actionName: "spatial.fleetHealth",
      source: "server_action",
      route: "actions/predictive",
      tenantId: workspaceId,
      extra: { sessionId, visualContext: "cracked_desert_orbit" },
    },
    async () =>
      getFleetHealth({
        ...input,
        workspaceId,
        sessionId,
      })
  );
}

export async function executeEdgeCommandAction(
  input: EdgeTerminalRequest
): Promise<ServerActionResult<EdgeTerminalResult>> {
  const workspaceId = requireWorkspaceId(input.workspaceId, "edge.terminal");
  const sessionId = requireSessionId(input.sessionId, "edge.terminal");
  return withServerActionTelemetry(
    {
      actionName: "edge.terminal",
      source: "server_action",
      route: "actions/predictive",
      tenantId: workspaceId,
      extra: { command: input.command, sessionId },
    },
    async () =>
      executeEdgeCommand({
        ...input,
        workspaceId,
        sessionId,
      })
  );
}
