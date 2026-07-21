/**
 * In-process telemetry broadcast bus for SSE `/api/telemetry/stream`.
 * Workspace-scoped pub/sub — agent state, gas burns, system incidents.
 */

export type TelemetryEventType =
  | "agent_state"
  | "gas"
  | "incident"
  | "terminal_log"
  | "heartbeat"
  | "connected";

export type TelemetryAgentStatePayload = {
  agentId: string;
  agentName?: string;
  status: string;
  objective?: string | null;
  currentTask?: string | null;
};

export type TelemetryGasPayload = {
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  gasKind?: string | null;
  nodeType?: string;
  ledgerId?: string | null;
  description?: string | null;
};

export type TelemetryIncidentPayload = {
  incidentId: string;
  kind: string;
  severity: string;
  message: string;
  healed: boolean;
  route?: string | null;
};

export type TelemetryTerminalLogPayload = {
  sessionId?: string;
  line: string;
  level?: "info" | "warn" | "error";
};

export type TelemetryEvent = {
  id: string;
  type: TelemetryEventType;
  workspaceId: string | null;
  at: string;
  payload: Record<string, unknown>;
};

type Listener = (event: TelemetryEvent) => void;

const MAX_BUFFER = 200;
const buffer: TelemetryEvent[] = [];
const listeners = new Set<Listener>();

let seq = 0;

function nextId(): string {
  seq = (seq + 1) % 1_000_000_000;
  return `tel-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function publishTelemetryEvent(
  input: Omit<TelemetryEvent, "id" | "at"> & { at?: string; id?: string }
): TelemetryEvent {
  const event: TelemetryEvent = {
    id: input.id ?? nextId(),
    type: input.type,
    workspaceId: input.workspaceId,
    at: input.at ?? new Date().toISOString(),
    payload: input.payload,
  };

  buffer.push(event);
  if (buffer.length > MAX_BUFFER) {
    buffer.shift();
  }

  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* never break publishers */
    }
  });

  return event;
}

export function publishAgentState(
  workspaceId: string | null,
  payload: TelemetryAgentStatePayload
): TelemetryEvent {
  return publishTelemetryEvent({
    type: "agent_state",
    workspaceId,
    payload: { ...payload },
  });
}

export function publishGasEvent(
  workspaceId: string,
  payload: TelemetryGasPayload
): TelemetryEvent {
  return publishTelemetryEvent({
    type: "gas",
    workspaceId,
    payload: { ...payload },
  });
}

export function publishIncident(
  workspaceId: string | null,
  payload: TelemetryIncidentPayload
): TelemetryEvent {
  return publishTelemetryEvent({
    type: "incident",
    workspaceId,
    payload: { ...payload },
  });
}

export function publishTerminalLog(
  workspaceId: string,
  payload: TelemetryTerminalLogPayload
): TelemetryEvent {
  return publishTelemetryEvent({
    type: "terminal_log",
    workspaceId,
    payload: { ...payload },
  });
}

export function getRecentTelemetryEvents(opts?: {
  workspaceId?: string | null;
  limit?: number;
}): TelemetryEvent[] {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 40));
  const scoped = opts?.workspaceId
    ? buffer.filter(
        (e) => e.workspaceId === opts.workspaceId || e.workspaceId === null
      )
    : [...buffer];
  return scoped.slice(-limit);
}

export function subscribeTelemetry(
  listener: Listener,
  opts?: { workspaceId?: string | null }
): () => void {
  const filtered: Listener = (event) => {
    if (
      opts?.workspaceId &&
      event.workspaceId != null &&
      event.workspaceId !== opts.workspaceId
    ) {
      return;
    }
    listener(event);
  };
  listeners.add(filtered);
  return () => listeners.delete(filtered);
}
