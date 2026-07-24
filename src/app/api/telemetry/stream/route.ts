/**
 * GET /api/telemetry/stream
 * Server-Sent Events — agent ticks, token usage, Sentry resolution alerts,
 * gas/incidents, with 15s heartbeats and automatic reconnect (retry + Last-Event-ID).
 *
 * Auth: x-workspace-key + RBAC `telemetry.read`
 * Query: pollMs (2000–15000, default 4000), sessionId (optional)
 */

import { enforcePermission } from "@/lib/auth/rbacMiddleware";
import { apiError } from "@/lib/http/apiResponse";
import { getPrisma } from "@/lib/prisma";
import {
  captureStructuredError,
  telemetryContextFromRequest,
} from "@/lib/sentry";
import {
  reportSseConnectionDrop,
  safeSseEnqueue,
} from "@/lib/sse/resiliencyServer";
import { SSE_RECONNECT_DEFAULTS } from "@/lib/sse/resiliency";
import {
  getRecentTelemetryEvents,
  publishTelemetryEvent,
  subscribeTelemetry,
  type TelemetryEvent,
} from "@/lib/telemetry/telemetryBus";
import { collectSwarmStreamTicks } from "@/lib/telemetry/swarmStreamTicks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const HEARTBEAT_MS = 15_000;
const DEFAULT_POLL_MS = 4_000;
/** Advise EventSource clients to reconnect after this many ms. */
const SSE_RETRY_MS = SSE_RECONNECT_DEFAULTS.baseDelayMs * 2;

function encodeFrame(event: string, data: unknown, id?: string): string {
  const lines: string[] = [];
  if (id) lines.push(`id: ${id}`);
  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join("\n")}\n\n`;
}

function clampPollMs(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_POLL_MS;
  return Math.min(15_000, Math.max(2_000, Math.trunc(n)));
}

async function snapshotWorkspaceTelemetry(workspaceId: string): Promise<{
  agents: TelemetryEvent[];
  gas: TelemetryEvent | null;
  incidents: TelemetryEvent[];
}> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const memberIds = await prisma.workspaceMembership.findMany({
    where: { workspaceId },
    select: { userId: true },
    take: 200,
  });
  const ownerIds = memberIds.map((m) => m.userId);

  const [agents, gasRow, incidents] = await Promise.all([
    prisma.agent.findMany({
      where:
        ownerIds.length > 0
          ? { ownerId: { in: ownerIds } }
          : { updatedAt: { gte: since } },
      select: {
        id: true,
        name: true,
        status: true,
        objective: true,
        currentTask: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { gasBalance: true },
    }),
    prisma.systemIncident.findMany({
      where: {
        OR: [{ healed: false }, { createdAt: { gte: since } }],
      },
      select: {
        id: true,
        kind: true,
        severity: true,
        message: true,
        healed: true,
        route: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const at = new Date().toISOString();
  const agentEvents: TelemetryEvent[] = agents.map((a) => ({
    id: `agent-${a.id}-${a.updatedAt.getTime()}`,
    type: "agent_state" as const,
    workspaceId,
    at,
    payload: {
      agentId: a.id,
      agentName: a.name,
      status: a.status,
      objective: a.objective,
      currentTask: a.currentTask,
    },
  }));

  const gasEvent: TelemetryEvent | null = gasRow
    ? {
        id: `gas-bal-${workspaceId}-${gasRow.gasBalance}`,
        type: "gas",
        workspaceId,
        at,
        payload: {
          amount: 0,
          balanceBefore: gasRow.gasBalance,
          balanceAfter: gasRow.gasBalance,
          gasKind: null,
          nodeType: "balance_snapshot",
          ledgerId: null,
          description: "Workspace gas balance snapshot",
        },
      }
    : null;

  const incidentEvents: TelemetryEvent[] = incidents.map((i) => ({
    id: `inc-${i.id}`,
    type: "incident" as const,
    workspaceId,
    at: i.createdAt.toISOString(),
    payload: {
      incidentId: i.id,
      kind: i.kind,
      severity: i.severity,
      message: i.message,
      healed: i.healed,
      route: i.route,
    },
  }));

  return { agents: agentEvents, gas: gasEvent, incidents: incidentEvents };
}

export async function GET(request: Request) {
  const rbac = await enforcePermission(request, "telemetry.read");
  if (!rbac.ok) return rbac.response;

  const { workspaceId } = rbac.ctx;
  const url = new URL(request.url);
  const pollMs = clampPollMs(url.searchParams.get("pollMs"));
  const sessionId = url.searchParams.get("sessionId")?.trim() || null;
  const lastEventId =
    request.headers.get("last-event-id")?.trim() ||
    url.searchParams.get("lastEventId")?.trim() ||
    null;

  const telemetry = telemetryContextFromRequest(request, {
    tenantId: workspaceId,
    source: "sse",
    route: "/api/telemetry/stream",
  });

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastAgentFingerprint = "";
  let lastIncidentFingerprint = "";
  let lastGasBalance: number | null = null;
  let lastSwarmFingerprint = "";
  const seenIds = new Set<string>();

  const markClosed = () => {
    closed = true;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: string, data: unknown, id?: string) => {
        if (closed) return;
        if (id) {
          if (seenIds.has(id)) return;
          seenIds.add(id);
          if (seenIds.size > 500) {
            const drop = [...seenIds].slice(0, 200);
            for (const d of drop) seenIds.delete(d);
          }
        }
        safeSseEnqueue(controller, encoder.encode(encodeFrame(event, data, id)), {
          isClosed: () => closed,
          markClosed,
          telemetry: {
            ...telemetry,
            stream: "telemetry.stream",
            source: "sse",
          },
        });
      };

      const pushTelemetry = (event: TelemetryEvent) => {
        push(
          event.type,
          {
            id: event.id,
            type: event.type,
            workspaceId: event.workspaceId,
            at: event.at,
            ...event.payload,
          },
          event.id
        );
      };

      // Advise clients to auto-reconnect (EventSource honors `retry:`).
      safeSseEnqueue(
        controller,
        encoder.encode(`retry: ${SSE_RETRY_MS}\n\n`),
        {
          isClosed: () => closed,
          markClosed,
          telemetry: {
            ...telemetry,
            stream: "telemetry.stream",
            source: "sse",
          },
        }
      );

      let pastLast = !lastEventId;
      for (const event of getRecentTelemetryEvents({
        workspaceId,
        limit: 30,
      })) {
        if (!pastLast) {
          if (event.id === lastEventId) {
            pastLast = true;
            seenIds.add(event.id);
            continue;
          }
          seenIds.add(event.id);
          continue;
        }
        pushTelemetry(event);
      }

      const connected = publishTelemetryEvent({
        type: "connected",
        workspaceId,
        payload: {
          message: "Telemetry SSE bus connected.",
          pollMs,
          heartbeatMs: HEARTBEAT_MS,
          retryMs: SSE_RETRY_MS,
          resumedFrom: lastEventId,
          sessionId,
        },
      });
      pushTelemetry(connected);

      unsubscribe = subscribeTelemetry((event) => pushTelemetry(event), {
        workspaceId,
      });

      const poll = async () => {
        if (closed) return;
        try {
          const snap = await snapshotWorkspaceTelemetry(workspaceId);

          const agentFp = snap.agents
            .map((e) => `${e.payload.agentId}:${e.payload.status}`)
            .join("|");
          if (agentFp !== lastAgentFingerprint) {
            lastAgentFingerprint = agentFp;
            for (const e of snap.agents) pushTelemetry(e);
          }

          const bal = Number(snap.gas?.payload.balanceAfter ?? NaN);
          if (snap.gas && Number.isFinite(bal) && bal !== lastGasBalance) {
            lastGasBalance = bal;
            pushTelemetry(snap.gas);
          }

          const incFp = snap.incidents
            .map((e) => `${e.payload.incidentId}:${e.payload.healed}`)
            .join("|");
          if (incFp !== lastIncidentFingerprint) {
            lastIncidentFingerprint = incFp;
            for (const e of snap.incidents) pushTelemetry(e);
          }

          // Swarm ticks: agent activity, token increments, Sentry resolution alerts
          const ticks = await collectSwarmStreamTicks({
            workspaceId,
            sessionId,
          });
          if (ticks.fingerprint !== lastSwarmFingerprint) {
            lastSwarmFingerprint = ticks.fingerprint;
            for (const e of ticks.agentTicks) pushTelemetry(e);
            for (const e of ticks.tokenTicks) pushTelemetry(e);
            for (const e of ticks.sentryAlerts) pushTelemetry(e);
          }
        } catch (err) {
          captureStructuredError(err, {
            ...telemetry,
            source: "sse",
            level: "warning",
            extra: { stream: "telemetry.stream", phase: "poll" },
          });
          push("error", {
            message:
              err instanceof Error ? err.message : "Telemetry poll failed.",
            at: new Date().toISOString(),
          });
        }
      };

      void poll();
      pollTimer = setInterval(() => void poll(), pollMs);

      heartbeatTimer = setInterval(() => {
        push("heartbeat", {
          at: new Date().toISOString(),
          workspaceId,
          sessionId,
        });
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        reportSseConnectionDrop(new Error("telemetry SSE client abort"), {
          ...telemetry,
          stream: "telemetry.stream",
          reason: "client_abort",
        });
        closed = true;
        unsubscribe?.();
        unsubscribe = null;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearInterval(pollTimer);
        heartbeatTimer = null;
        pollTimer = null;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearInterval(pollTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...SSE_HEADERS,
      "x-workspace-bound": workspaceId,
      "x-sse-heartbeat-ms": String(HEARTBEAT_MS),
      "x-sse-retry-ms": String(SSE_RETRY_MS),
    },
  });
}

export async function POST() {
  return apiError(
    "Use GET /api/telemetry/stream for the SSE telemetry bus.",
    "METHOD_NOT_ALLOWED",
    405
  );
}
