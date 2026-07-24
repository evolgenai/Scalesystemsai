/**
 * Build SSE tick payloads from swarm telemetry + Sentry resolution memory.
 * Returns event objects without publishing (caller pushes onto the SSE stream).
 */

import { recallAgentMemory } from "@/lib/agents/agentMemoryStore";
import { getSwarmTelemetry } from "@/lib/telemetry/swarmTelemetry";
import type { TelemetryEvent } from "@/lib/telemetry/telemetryBus";

export type SwarmTickBundle = {
  agentTicks: TelemetryEvent[];
  tokenTicks: TelemetryEvent[];
  sentryAlerts: TelemetryEvent[];
  fingerprint: string;
};

function event(
  partial: Omit<TelemetryEvent, "at"> & { at?: string }
): TelemetryEvent {
  return {
    ...partial,
    at: partial.at ?? new Date().toISOString(),
  };
}

/**
 * Snapshot swarm activity into bus-compatible telemetry events for SSE.
 */
export async function collectSwarmStreamTicks(options: {
  workspaceId: string;
  sessionId: string;
}): Promise<SwarmTickBundle> {
  const swarm = await getSwarmTelemetry({
    workspaceId: options.workspaceId,
    sessionId: options.sessionId,
    limit: 12,
  });

  const at = swarm.generatedAt;

  const agentTicks: TelemetryEvent[] = swarm.agents.map((agent) =>
    event({
      id: `agent-tick-${agent.id}-${agent.lastActiveAt}`,
      type: "agent_tick",
      workspaceId: options.workspaceId,
      at,
      payload: {
        agentId: agent.id,
        agentName: agent.name,
        status: agent.status,
        currentTask: agent.currentTask,
        tokensConsumed: agent.tokensConsumed,
        latencyMs: agent.latencyMs,
        successRate: agent.successRate,
      },
    })
  );

  const latestToken = swarm.recentTokenEvents[0];
  const tokenTicks: TelemetryEvent[] = [
    event({
      id: latestToken
        ? `tok-tick-${latestToken.id}`
        : `tok-tick-totals-${swarm.totals.tokensConsumed}`,
      type: "token_usage",
      workspaceId: options.workspaceId,
      at: latestToken?.createdAt ?? at,
      payload: {
        eventId: latestToken?.id ?? null,
        agentId: latestToken?.agentId ?? "swarm",
        model: latestToken?.model ?? "aggregate",
        promptTokens:
          latestToken?.promptTokens ?? swarm.totals.promptTokens,
        completionTokens:
          latestToken?.completionTokens ?? swarm.totals.completionTokens,
        totalTokens:
          latestToken?.totalTokens ?? swarm.totals.tokensConsumed,
        costUsd: latestToken?.costUsd ?? swarm.totals.costUsdEstimate,
        latencyMs:
          latestToken?.latencyMs ?? swarm.totals.currentLatencyMs,
        totals: swarm.totals,
      },
    }),
  ];

  let sentryAlerts: TelemetryEvent[] = [];
  try {
    const recalled = await recallAgentMemory({
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
      kinds: ["sentry_resolution", "auto_patch", "preemptive_tune"],
      tags: ["sentry", "resolved", "execute-patch", "preemptive_tune"],
      limit: 8,
      strictTenant: true,
    });

    sentryAlerts = recalled.entries.map((entry) =>
      event({
        id: `sentry-alert-${entry.id}`,
        type: "sentry_resolution",
        workspaceId: options.workspaceId,
        at: entry.createdAt,
        payload: {
          memoryId: entry.id,
          sentryIssueId: entry.sentryIssueId,
          title: entry.title,
          summary: entry.summary,
          agentId: entry.agentId,
          kind: entry.kind,
          alert:
            entry.kind === "sentry_resolution"
              ? "resolution"
              : "auto_patch_activity",
        },
      })
    );
  } catch {
    sentryAlerts = [];
  }

  const fingerprint = [
    swarm.agents
      .map((a) => `${a.id}:${a.status}:${a.tokensConsumed}`)
      .join("|"),
    String(swarm.totals.tokensConsumed),
    sentryAlerts.map((e) => e.id).join("|"),
  ].join("::");

  return { agentTicks, tokenTicks, sentryAlerts, fingerprint };
}
