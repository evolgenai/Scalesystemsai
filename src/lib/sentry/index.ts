export {
  SENTRY_TAG_TENANT,
  SENTRY_TAG_TRACE,
  SENTRY_TAG_AGENT_EXECUTION,
  createTraceId,
  getSentryTelemetryContext,
  resolveTelemetryIds,
  applySentryTags,
  withSentryTelemetry,
  withSentryTelemetryAsync,
  captureStructuredError,
  telemetryContextFromRequest,
  type SentryTelemetryContext,
  type CaptureStructuredErrorOptions,
} from "@/lib/sentry/telemetry";

export {
  withServerActionTelemetry,
  runWithTelemetry,
  type ServerActionContext,
  type ServerActionResult,
} from "@/lib/sentry/withServerAction";
