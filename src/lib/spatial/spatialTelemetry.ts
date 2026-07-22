/**
 * Sentry tagging for Spatial Universe interactions —
 * object type, coordinates, user auth state, vehicle speed status.
 */

import * as Sentry from "@sentry/nextjs";
import {
  applySentryTags,
  captureStructuredError,
  resolveTelemetryIds,
  withSentryTelemetryAsync,
  type SentryTelemetryContext,
} from "@/lib/sentry/telemetry";

export const SENTRY_TAG_SPATIAL_OBJECT = "spatial.object_type" as const;
export const SENTRY_TAG_SPATIAL_ACCESS = "spatial.access_level" as const;
export const SENTRY_TAG_SPATIAL_AUTH = "spatial.auth_state" as const;
export const SENTRY_TAG_SPATIAL_SPEED = "spatial.vehicle_speed" as const;
export const SENTRY_TAG_SPATIAL_COORDS = "spatial.coordinates" as const;
export const SENTRY_TAG_SPATIAL_NODE = "spatial.node_id" as const;
export const SENTRY_TAG_SPATIAL_AVATAR = "spatial.avatar_mode" as const;

export type SpatialInteractionTags = {
  objectType?: string | null;
  nodeId?: string | null;
  accessLevel?: string | null;
  authState?: string | null;
  coordinates?: { x: number; z: number; y?: number } | null;
  vehicleSpeedStatus?: "walk_1x" | "drive_2x" | string | null;
  avatarMode?: "walking" | "driving" | string | null;
  mounted?: boolean | null;
};

export type SpatialTelemetryContext = SentryTelemetryContext & {
  spatial?: SpatialInteractionTags;
};

function formatCoords(
  coordinates: SpatialInteractionTags["coordinates"]
): string | null {
  if (!coordinates) return null;
  const y =
    typeof coordinates.y === "number" ? `,${coordinates.y.toFixed(1)}` : "";
  return `${coordinates.x.toFixed(1)},${coordinates.z.toFixed(1)}${y}`;
}

/** Apply spatial interaction tags onto the active Sentry scope. */
export function applySpatialSentryTags(tags: SpatialInteractionTags): void {
  if (tags.objectType) {
    Sentry.setTag(SENTRY_TAG_SPATIAL_OBJECT, tags.objectType.slice(0, 64));
  }
  if (tags.accessLevel) {
    Sentry.setTag(SENTRY_TAG_SPATIAL_ACCESS, tags.accessLevel.slice(0, 32));
  }
  if (tags.authState) {
    Sentry.setTag(SENTRY_TAG_SPATIAL_AUTH, tags.authState.slice(0, 32));
  }
  if (tags.vehicleSpeedStatus) {
    Sentry.setTag(SENTRY_TAG_SPATIAL_SPEED, tags.vehicleSpeedStatus.slice(0, 32));
  }
  if (tags.avatarMode) {
    Sentry.setTag(SENTRY_TAG_SPATIAL_AVATAR, tags.avatarMode.slice(0, 32));
  }
  if (tags.nodeId) {
    Sentry.setTag(SENTRY_TAG_SPATIAL_NODE, tags.nodeId.slice(0, 128));
  }
  const coords = formatCoords(tags.coordinates ?? null);
  if (coords) {
    Sentry.setTag(SENTRY_TAG_SPATIAL_COORDS, coords.slice(0, 64));
  }
  if (typeof tags.mounted === "boolean") {
    Sentry.setTag("spatial.mounted", tags.mounted ? "true" : "false");
  }

  Sentry.setContext("spatial_interaction", {
    object_type: tags.objectType ?? null,
    node_id: tags.nodeId ?? null,
    access_level: tags.accessLevel ?? null,
    auth_state: tags.authState ?? null,
    coordinates: tags.coordinates ?? null,
    vehicle_speed_status: tags.vehicleSpeedStatus ?? null,
    avatar_mode: tags.avatarMode ?? null,
    mounted: tags.mounted ?? null,
  });
}

export function captureSpatialInteraction(
  message: string,
  tags: SpatialInteractionTags,
  telemetry?: SentryTelemetryContext,
  level: Sentry.SeverityLevel = "info"
): string | null {
  const ids = resolveTelemetryIds(telemetry);
  applySentryTags({
    ...telemetry,
    traceId: ids.traceId,
    tenantId: ids.tenantId,
    agentExecutionId: ids.agentExecutionId,
    source: telemetry?.source ?? "api",
  });

  return Sentry.withScope((scope) => {
    scope.setLevel(level);
    applySpatialSentryTags(tags);
    scope.setTag("spatial.event", message.slice(0, 120));
    return Sentry.captureMessage(message, level);
  });
}

export async function withSpatialTelemetry<T>(
  ctx: SpatialTelemetryContext,
  fn: () => Promise<T>
): Promise<T> {
  return withSentryTelemetryAsync(
    {
      ...ctx,
      source: ctx.source ?? "api",
      extra: {
        ...ctx.extra,
        spatial: ctx.spatial ?? null,
      },
    },
    async () => {
      if (ctx.spatial) applySpatialSentryTags(ctx.spatial);
      return fn();
    }
  );
}

export function captureSpatialError(
  error: unknown,
  tags: SpatialInteractionTags,
  telemetry?: SentryTelemetryContext
): string | null {
  return captureStructuredError(error, {
    ...telemetry,
    source: telemetry?.source ?? "api",
    extra: {
      ...telemetry?.extra,
      spatial: tags,
    },
  });
}
