export type EngineTelemetryStatus =
  | "IDLE"
  | "PLANNING"
  | "EXECUTING"
  | "REFLECTING";

export type OrchestratorNarrative = {
  message: string;
  agent: string;
  phase: "initialize" | "plan" | "execute" | "reflect" | "system";
  engineStatus?: EngineTelemetryStatus;
  timestamp: string;
};

const MAX_BUFFER = 100;

const narrativeBuffer: OrchestratorNarrative[] = [];
const listeners = new Set<(event: OrchestratorNarrative) => void>();

export function publishOrchestratorNarrative(
  event: Omit<OrchestratorNarrative, "timestamp"> & { timestamp?: string }
): OrchestratorNarrative {
  const narrative: OrchestratorNarrative = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  narrativeBuffer.push(narrative);
  if (narrativeBuffer.length > MAX_BUFFER) {
    narrativeBuffer.shift();
  }

  listeners.forEach((listener) => listener(narrative));
  return narrative;
}

export function getRecentOrchestratorNarratives(): OrchestratorNarrative[] {
  return [...narrativeBuffer];
}

export function subscribeOrchestratorNarratives(
  listener: (event: OrchestratorNarrative) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatOrchestratorSseLine(event: OrchestratorNarrative): string {
  const stamp = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${stamp} [${event.agent}] ${event.message}`;
}
