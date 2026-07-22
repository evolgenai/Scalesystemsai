/**
 * Global server-action / route-handler wrapper — attaches Sentry telemetry
 * context for the duration of the call and reports uncaught errors.
 */

import {
  captureStructuredError,
  createTraceId,
  withSentryTelemetryAsync,
  type SentryTelemetryContext,
} from "@/lib/sentry/telemetry";

export type ServerActionContext = SentryTelemetryContext & {
  actionName: string;
};

export type ServerActionResult<T> =
  | { ok: true; data: T; traceId: string }
  | {
      ok: false;
      error: string;
      code: string;
      traceId: string;
      eventId: string | null;
    };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Wrap any async server action so nested DB/SSE/API work inherits tags
 * (tenant_id, trace_id, agent_execution_id) and failures are captured once.
 */
export async function withServerActionTelemetry<T>(
  ctx: ServerActionContext,
  fn: () => Promise<T>
): Promise<ServerActionResult<T>> {
  const traceId = ctx.traceId?.trim() || createTraceId();
  const telemetry: SentryTelemetryContext = {
    ...ctx,
    traceId,
    source: ctx.source ?? "server_action",
    route: ctx.route ?? ctx.actionName,
    extra: {
      actionName: ctx.actionName,
      ...ctx.extra,
    },
  };

  try {
    const data = await withSentryTelemetryAsync(telemetry, fn);
    return { ok: true, data, traceId };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        error: "Aborted",
        code: "ABORTED",
        traceId,
        eventId: null,
      };
    }

    const eventId = captureStructuredError(error, {
      ...telemetry,
      level: "error",
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Server action failed.",
      code: "SERVER_ACTION_ERROR",
      traceId,
      eventId,
    };
  }
}

/**
 * Fire-and-forget style: rethrows after capture (for Route Handlers that
 * prefer Next.js error boundaries / onRequestError).
 */
export async function runWithTelemetry<T>(
  ctx: ServerActionContext,
  fn: () => Promise<T>
): Promise<T> {
  const result = await withServerActionTelemetry(ctx, fn);
  if (result.ok) return result.data;
  if (result.code === "ABORTED") {
    throw new DOMException("Aborted", "AbortError");
  }
  const err = new Error(result.error);
  (err as Error & { sentryEventId?: string | null }).sentryEventId =
    result.eventId;
  throw err;
}
