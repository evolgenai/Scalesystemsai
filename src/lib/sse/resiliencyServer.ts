/**
 * Server-only SSE resiliency — Sentry reporting for connection drops.
 * Keep this out of Client Components (uses node:async_hooks via telemetry).
 */

import {
  captureStructuredError,
  resolveTelemetryIds,
  type SentryTelemetryContext,
} from "@/lib/sentry/telemetry";
import {
  classifySseDrop,
  type SseDropReason,
} from "@/lib/sse/resiliency";

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
