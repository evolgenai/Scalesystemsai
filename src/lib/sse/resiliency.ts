/**
 * SSE stream resiliency — detect connection drops, report to Sentry without
 * tearing down the shared connection pool, and support client reconnect.
 */

import {
  captureStructuredError,
  resolveTelemetryIds,
  type SentryTelemetryContext,
} from "@/lib/sentry/telemetry";

export const SSE_RECONNECT_DEFAULTS = {
  maxAttempts: 5,
  baseDelayMs: 800,
  maxDelayMs: 12_000,
  heartbeatMissMs: 45_000,
} as const;

export type SseDropReason =
  | "client_abort"
  | "enqueue_failed"
  | "reader_error"
  | "network"
  | "timeout"
  | "unknown";

export function isSseAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "AbortError" ||
        /aborted|abortcontroller/i.test(error.message)))
  );
}

export function classifySseDrop(error: unknown): SseDropReason {
  if (isSseAbortError(error)) return "client_abort";
  if (error instanceof Error) {
    const m = error.message.toLowerCase();
    if (m.includes("enqueue") || m.includes("controller is already closed")) {
      return "enqueue_failed";
    }
    if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) {
      return "network";
    }
    if (m.includes("timeout") || m.includes("timed out")) return "timeout";
    if (m.includes("reader") || m.includes("stream")) return "reader_error";
  }
  return "unknown";
}

/**
 * Report an SSE connection drop to Sentry without rethrowing.
 * Client aborts are silent (expected). Other drops are warnings.
 */
export function reportSseConnectionDrop(
  error: unknown,
  ctx: SentryTelemetryContext & {
    reason?: SseDropReason;
    stream?: string;
  } = {}
): { reported: boolean; reason: SseDropReason; eventId: string | null } {
  const reason = ctx.reason ?? classifySseDrop(error);
  if (reason === "client_abort") {
    return { reported: false, reason, eventId: null };
  }

  const ids = resolveTelemetryIds(ctx);
  const eventId = captureStructuredError(error, {
    tenantId: ids.tenantId,
    traceId: ids.traceId,
    agentExecutionId: ids.agentExecutionId,
    route: ctx.route ?? ctx.stream ?? "sse",
    source: "sse",
    level: "warning",
    extra: {
      reason,
      stream: ctx.stream ?? null,
      ...ctx.extra,
    },
  });

  return { reported: true, reason, eventId };
}

/**
 * Safe enqueue for SSE — swallows closed-controller errors and reports once.
 */
export function safeSseEnqueue(
  controller: ReadableStreamDefaultController<Uint8Array>,
  chunk: Uint8Array,
  opts: {
    isClosed: () => boolean;
    markClosed: () => void;
    telemetry?: SentryTelemetryContext & { stream?: string };
  }
): boolean {
  if (opts.isClosed()) return false;
  try {
    controller.enqueue(chunk);
    return true;
  } catch (error) {
    opts.markClosed();
    reportSseConnectionDrop(error, {
      ...opts.telemetry,
      reason: "enqueue_failed",
      source: "sse",
    });
    return false;
  }
}

/** Exponential backoff with jitter for client reconnect loops. */
export function sseReconnectDelayMs(
  attempt: number,
  opts?: {
    baseDelayMs?: number;
    maxDelayMs?: number;
  }
): number {
  const base = opts?.baseDelayMs ?? SSE_RECONNECT_DEFAULTS.baseDelayMs;
  const max = opts?.maxDelayMs ?? SSE_RECONNECT_DEFAULTS.maxDelayMs;
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(400, exp * 0.25));
  return Math.min(max, exp + jitter);
}

export function shouldAttemptSseReconnect(
  attempt: number,
  error: unknown,
  maxAttempts = SSE_RECONNECT_DEFAULTS.maxAttempts
): boolean {
  if (attempt >= maxAttempts) return false;
  if (isSseAbortError(error)) return false;
  const reason = classifySseDrop(error);
  return reason === "network" || reason === "timeout" || reason === "reader_error" || reason === "unknown";
}
