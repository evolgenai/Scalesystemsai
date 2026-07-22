/**
 * Structured Sentry telemetry for API routes, SSE handlers, and DB adapters.
 * Attaches tenant_id / trace_id / agent_execution_id tags on every capture.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

export const SENTRY_TAG_TENANT = "tenant_id" as const;
export const SENTRY_TAG_TRACE = "trace_id" as const;
export const SENTRY_TAG_AGENT_EXECUTION = "agent_execution_id" as const;

export type SentryTelemetryContext = {
  tenantId?: string | null;
  traceId?: string | null;
  agentExecutionId?: string | null;
  route?: string | null;
  source?:
    | "api"
    | "sse"
    | "db"
    | "server_action"
    | "pool"
    | "catalog"
    | "unknown";
  extra?: Record<string, unknown>;
};

type Store = Required<
  Pick<SentryTelemetryContext, "tenantId" | "traceId" | "agentExecutionId">
> &
  Pick<SentryTelemetryContext, "route" | "source" | "extra">;

const als = new AsyncLocalStorage<Store>();

function normalizeId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 128) : null;
}

export function createTraceId(): string {
  return randomUUID();
}

export function getSentryTelemetryContext(): Store | undefined {
  return als.getStore();
}

/**
 * Resolve active telemetry ids — ALS first, then explicit overrides, then generate.
 */
export function resolveTelemetryIds(
  partial?: SentryTelemetryContext
): {
  tenantId: string | null;
  traceId: string;
  agentExecutionId: string | null;
} {
  const active = als.getStore();
  return {
    tenantId:
      normalizeId(partial?.tenantId) ??
      normalizeId(active?.tenantId) ??
      null,
    traceId:
      normalizeId(partial?.traceId) ??
      normalizeId(active?.traceId) ??
      createTraceId(),
    agentExecutionId:
      normalizeId(partial?.agentExecutionId) ??
      normalizeId(active?.agentExecutionId) ??
      null,
  };
}

export function applySentryTags(ctx: SentryTelemetryContext): void {
  const ids = resolveTelemetryIds(ctx);
  Sentry.setTag(SENTRY_TAG_TENANT, ids.tenantId ?? "unknown");
  Sentry.setTag(SENTRY_TAG_TRACE, ids.traceId);
  if (ids.agentExecutionId) {
    Sentry.setTag(SENTRY_TAG_AGENT_EXECUTION, ids.agentExecutionId);
  }
  if (ctx.route) Sentry.setTag("route", ctx.route.slice(0, 200));
  if (ctx.source) Sentry.setTag("error_source", ctx.source);
}

/**
 * Run `fn` inside an ALS scope so nested captures inherit tenant/trace/execution ids.
 */
export function withSentryTelemetry<T>(
  ctx: SentryTelemetryContext,
  fn: () => T
): T {
  const ids = resolveTelemetryIds(ctx);
  const store: Store = {
    tenantId: ids.tenantId,
    traceId: ids.traceId,
    agentExecutionId: ids.agentExecutionId,
    route: ctx.route ?? null,
    source: ctx.source ?? "unknown",
    extra: ctx.extra,
  };

  return als.run(store, () =>
    Sentry.withScope((scope) => {
      scope.setTag(SENTRY_TAG_TENANT, store.tenantId ?? "unknown");
      scope.setTag(SENTRY_TAG_TRACE, store.traceId);
      if (store.agentExecutionId) {
        scope.setTag(SENTRY_TAG_AGENT_EXECUTION, store.agentExecutionId);
      }
      if (store.route) scope.setTag("route", store.route);
      if (store.source) scope.setTag("error_source", store.source);
      if (store.extra) scope.setContext("telemetry_extra", store.extra);
      return fn();
    })
  );
}

export async function withSentryTelemetryAsync<T>(
  ctx: SentryTelemetryContext,
  fn: () => Promise<T>
): Promise<T> {
  return withSentryTelemetry(ctx, fn);
}

export type CaptureStructuredErrorOptions = SentryTelemetryContext & {
  level?: Sentry.SeverityLevel;
  /** When true, skip reporting (e.g. client abort). */
  silent?: boolean;
};

/**
 * Capture an exception with structured Scale Systems tags.
 * Returns the Sentry event id (or null when silent / capture fails).
 */
export function captureStructuredError(
  error: unknown,
  options: CaptureStructuredErrorOptions = {}
): string | null {
  if (options.silent) return null;

  const ids = resolveTelemetryIds(options);
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Unknown error");

  return Sentry.withScope((scope) => {
    scope.setLevel(options.level ?? "error");
    scope.setTag(SENTRY_TAG_TENANT, ids.tenantId ?? "unknown");
    scope.setTag(SENTRY_TAG_TRACE, ids.traceId);
    if (ids.agentExecutionId) {
      scope.setTag(SENTRY_TAG_AGENT_EXECUTION, ids.agentExecutionId);
    }
    if (options.route) scope.setTag("route", options.route.slice(0, 200));
    if (options.source) scope.setTag("error_source", options.source);
    if (options.extra) {
      scope.setContext("telemetry_extra", options.extra);
    }
    scope.setContext("scale_systems", {
      tenant_id: ids.tenantId,
      trace_id: ids.traceId,
      agent_execution_id: ids.agentExecutionId,
      route: options.route ?? null,
      source: options.source ?? "unknown",
    });
    return Sentry.captureException(err);
  });
}

/**
 * Extract tenant / execution / trace hints from a Request (headers + query).
 */
export function telemetryContextFromRequest(
  request: Request,
  overrides?: SentryTelemetryContext
): SentryTelemetryContext {
  const url = new URL(request.url);
  const headerTenant =
    request.headers.get("x-workspace-id") ??
    request.headers.get("x-tenant-id") ??
    request.headers.get("x-org-id");
  const headerTrace =
    request.headers.get("x-trace-id") ??
    request.headers.get("sentry-trace")?.split("-")[0] ??
    request.headers.get("x-request-id");
  const headerExec =
    request.headers.get("x-agent-execution-id") ??
    request.headers.get("x-swarm-session-id") ??
    url.searchParams.get("sessionId") ??
    url.searchParams.get("executionId");

  return {
    tenantId: overrides?.tenantId ?? headerTenant,
    traceId: overrides?.traceId ?? headerTrace ?? createTraceId(),
    agentExecutionId: overrides?.agentExecutionId ?? headerExec,
    route: overrides?.route ?? url.pathname,
    source: overrides?.source ?? "api",
    extra: overrides?.extra,
  };
}
