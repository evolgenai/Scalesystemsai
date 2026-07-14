"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VISUALIZER_AGENTS,
  type AgentCardState,
  type AgentStreamEvent,
  type VisualizerStatus,
} from "@/lib/agents/streamProtocol";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

export type StreamConnectionState =
  | "idle"
  | "connecting"
  | "live"
  | "error"
  | "closed";

export type StreamResultItem = {
  id: string;
  markdown: string;
  agent?: string;
};

export type UseAgentStreamOptions = {
  /** When false, the stream is not opened automatically. */
  enabled?: boolean;
  endpoint?: string;
  maxLines?: number;
  /** Default objective used when start() is called without an override. */
  objective?: string;
  /** When true, stream loops. Dashboard launches should keep this false. */
  loop?: boolean;
};

export type UseAgentStreamResult = {
  lines: AgentStreamEvent[];
  /** Human-readable digests for the left Results Pane. */
  results: StreamResultItem[];
  agents: AgentCardState[];
  connection: StreamConnectionState;
  overallProgress: number;
  paymentRequired: boolean;
  start: (objectiveOverride?: string) => void;
  stop: () => void;
  clear: () => void;
  dismissPaymentRequired: () => void;
  /** Replay a saved SwarmSession into the dual-pane terminal. */
  hydrateFromHistory: (input: {
    lines: AgentStreamEvent[];
    results: StreamResultItem[];
  }) => void;
};

function initialAgents(): AgentCardState[] {
  return VISUALIZER_AGENTS.map((agent) => ({
    ...agent,
    status: "IDLE" as VisualizerStatus,
    progress: 0,
    currentStage: "Standby",
  }));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Extract a Results Pane entry from a stream event, if it carries
 * human-readable narrative content (result / summary / digests).
 */
export function extractResultItem(
  event: AgentStreamEvent,
  index: number
): StreamResultItem | null {
  if (event.resultMarkdown?.trim()) {
    return {
      id: `${event.timestamp}-md-${index}`,
      markdown: event.resultMarkdown.trim(),
      agent: event.agentName,
    };
  }

  if (event.type === "result" || event.type === "summary") {
    const markdown = event.message.trim();
    if (!markdown) return null;
    return {
      id: `${event.timestamp}-${event.type}-${index}`,
      markdown,
      agent: event.agentName,
    };
  }

  if (
    event.message.startsWith("[gemini:digest]") ||
    event.message.startsWith("[webScraper:content]")
  ) {
    return {
      id: `${event.timestamp}-dig-${index}`,
      markdown: event.message
        .replace(/^\[gemini:digest\]\s*/, "")
        .replace(/^\[webScraper:content\]\s*/, ""),
      agent: event.agentName,
    };
  }

  return null;
}

/**
 * Parse SSE frames from a growing text buffer. Returns complete events and
 * residual incomplete chunk text (handles TCP splits mid-JSON).
 */
export function consumeSseBuffer(buffer: string): {
  events: AgentStreamEvent[];
  rest: string;
} {
  const events: AgentStreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const block of parts) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) continue;

    const payload = dataLines.join("\n");
    try {
      const parsed = JSON.parse(payload) as AgentStreamEvent;
      if (parsed && typeof parsed.message === "string") {
        events.push(parsed);
      }
    } catch {
      // Incomplete or malformed JSON — discard this frame only.
    }
  }

  return { events, rest };
}

function applyEventToAgents(
  agents: AgentCardState[],
  event: AgentStreamEvent
): AgentCardState[] {
  if (!event.agentId || event.agentId === "system") return agents;

  const existing = agents.find((agent) => agent.id === event.agentId);
  if (!existing) {
    return [
      ...agents,
      {
        id: event.agentId,
        name: event.agentName ?? event.agentId,
        role: "Dynamic sub-agent",
        status: event.status ?? "EXECUTING",
        progress: typeof event.progress === "number" ? event.progress : 0,
        currentStage: event.stage ?? event.message ?? "Running",
      },
    ];
  }

  return agents.map((agent) => {
    if (agent.id !== event.agentId) return agent;
    return {
      ...agent,
      name: event.agentName ?? agent.name,
      status: event.status ?? agent.status,
      progress:
        typeof event.progress === "number" ? event.progress : agent.progress,
      currentStage: event.stage ?? event.message ?? agent.currentStage,
    };
  });
}

function buildStreamUrl(
  endpoint: string,
  objective: string,
  loop: boolean
): string {
  const url = new URL(
    endpoint,
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost"
  );
  url.searchParams.set("objective", objective);
  url.searchParams.set("loop", loop ? "1" : "0");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function useAgentStream(
  options: UseAgentStreamOptions = {}
): UseAgentStreamResult {
  const {
    enabled = true,
    endpoint = "/api/agents/stream",
    maxLines = 200,
    objective = "Qualify inbound B2B leads, sync CRM vectors, and consolidate schema output.",
    loop = false,
  } = options;

  const [lines, setLines] = useState<AgentStreamEvent[]>([]);
  const [results, setResults] = useState<StreamResultItem[]>([]);
  const [agents, setAgents] = useState<AgentCardState[]>(initialAgents);
  const [connection, setConnection] =
    useState<StreamConnectionState>("idle");
  const [overallProgress, setOverallProgress] = useState(0);
  const [paymentRequired, setPaymentRequired] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const objectiveRef = useRef(objective);
  objectiveRef.current = objective;

  const clear = useCallback(() => {
    setLines([]);
    setResults([]);
    setAgents(initialAgents());
    setOverallProgress(0);
  }, []);

  const hydrateFromHistory = useCallback(
    (input: { lines: AgentStreamEvent[]; results: StreamResultItem[] }) => {
      abortRef.current?.abort();
      abortRef.current = null;
      setPaymentRequired(false);
      setConnection("closed");
      setOverallProgress(100);
      setAgents(initialAgents());
      setLines(input.lines.slice(-maxLines));
      setResults(input.results.slice(-40));
    },
    [maxLines]
  );

  const dismissPaymentRequired = useCallback(() => {
    setPaymentRequired(false);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConnection((prev) =>
      prev === "live" || prev === "connecting" ? "closed" : prev
    );
  }, []);

  const start = useCallback(
    (objectiveOverride?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const activeObjective =
        objectiveOverride?.trim() || objectiveRef.current.trim();
      const streamUrl = buildStreamUrl(endpoint, activeObjective, loop);

      setPaymentRequired(false);
      setConnection("connecting");
      trackFunnelEvent({
        event: "stream_launch",
        metadata: { length: activeObjective.length },
      });

      void (async () => {
        const isActive = () => abortRef.current === controller;

        try {
          const response = await fetch(streamUrl, {
            method: "GET",
            headers: {
              Accept: "text/event-stream",
              ...getClientAuthHeaders(),
            },
            signal: controller.signal,
            cache: "no-store",
          });

          if (!isActive()) return;

          if (!response.ok || !response.body) {
            setConnection("error");

            if (response.status === 402) {
              setPaymentRequired(true);
              trackFunnelEvent({ event: "stream_quota_hit" });
              return;
            }

            let detail = `Stream refused — HTTP ${response.status}`;
            try {
              const payload = (await response.json()) as {
                message?: string;
                code?: string;
              };
              if (payload.message) detail = payload.message;
            } catch {
              // Keep default detail.
            }
            setLines((prev) => [
              ...prev.slice(-(maxLines - 1)),
              {
                type: "error",
                message: detail,
                status: "ERROR",
                timestamp: new Date().toISOString(),
              },
            ]);
            return;
          }

          setConnection("live");

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let resultIndex = 0;

          try {
            while (true) {
              if (!isActive() || controller.signal.aborted) {
                try {
                  await reader.cancel();
                } catch {
                  // Reader may already be closed.
                }
                break;
              }

              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const { events, rest } = consumeSseBuffer(buffer);
              buffer = rest;

              if (events.length === 0 || !isActive()) continue;

              setLines((prev) => [...prev, ...events].slice(-maxLines));
              setAgents((prev) =>
                events.reduce(
                  (acc, event) => applyEventToAgents(acc, event),
                  prev
                )
              );

              const newResults: StreamResultItem[] = [];
              for (const event of events) {
                const item = extractResultItem(event, resultIndex++);
                if (item) newResults.push(item);
              }
              if (newResults.length > 0) {
                setResults((prev) => [...prev, ...newResults].slice(-40));
              }

              const withProgress = [...events]
                .reverse()
                .find((e) => typeof e.progress === "number");
              if (withProgress && typeof withProgress.progress === "number") {
                setOverallProgress(withProgress.progress);
              }
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {
              // Already released.
            }
          }

          if (isActive() && !controller.signal.aborted) {
            setConnection("closed");
          }
        } catch (error) {
          // Rapid page switches / stop() abort the fetch — discard quietly.
          if (
            !isActive() ||
            controller.signal.aborted ||
            isAbortError(error)
          ) {
            if (isActive()) {
              setConnection("closed");
            }
            return;
          }

          setConnection("error");
          setLines((prev) => [
            ...prev.slice(-(maxLines - 1)),
            {
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "ReadableStream connection failed.",
              status: "ERROR",
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      })();
    },
    [endpoint, loop, maxLines]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    start();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, start]);

  return {
    lines,
    results,
    agents,
    connection,
    overallProgress,
    paymentRequired,
    start,
    stop,
    clear,
    dismissPaymentRequired,
    hydrateFromHistory,
  };
}
