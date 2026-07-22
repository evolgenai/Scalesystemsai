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

export {
  applySpatialSentryTags,
  captureSpatialInteraction,
  withSpatialTelemetry,
  captureSpatialError,
  SENTRY_TAG_SPATIAL_OBJECT,
  SENTRY_TAG_SPATIAL_ACCESS,
  SENTRY_TAG_SPATIAL_AUTH,
  SENTRY_TAG_SPATIAL_SPEED,
  SENTRY_TAG_SPATIAL_COORDS,
  type SpatialInteractionTags,
  type SpatialTelemetryContext,
} from "@/lib/spatial/spatialTelemetry";
