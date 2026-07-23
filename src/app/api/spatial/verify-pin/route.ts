/**
 * POST /api/spatial/verify-pin
 * Validates Superadmin PIN against process.env.SUPERADMIN_PIN.
 * On success → sanitized live Sentry error telemetry.
 * On failure → rate-limited security telemetry to Sentry.
 */

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  authStateFromProfile,
  grantPinUnlock,
  verifySuperadminPin,
} from "@/lib/spatial/workstationPin";
import { fetchSanitizedSentryErrors } from "@/lib/spatial/sentryLiveLogs";
import { buildNodeSpecificLogs } from "@/lib/spatial/nodeSecureLogs";
import {
  allowSecuritySentryLog,
  checkPinFailureRateLimit,
  clientKeyFromRequest,
  recordPinFailure,
} from "@/lib/spatial/pinRateLimit";
import {
  captureSpatialError,
  captureSpatialInteraction,
  withSpatialTelemetry,
} from "@/lib/spatial/spatialTelemetry";
import { telemetryContextFromRequest } from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z
  .object({
    pin: z.string().trim().min(4).max(8).regex(/^\d{4,8}$/),
    sessionId: z.string().trim().min(1).max(128),
    objectId: z.string().trim().min(1).max(128).optional(),
    nodeType: z.string().trim().min(1).max(64).optional(),
    coordinates: z
      .object({
        x: z.number(),
        z: z.number(),
        y: z.number().optional(),
      })
      .optional(),
    limit: z.number().int().min(1).max(25).optional(),
  })
  .strict();

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid PIN payload.",
      "INVALID_BODY",
      400
    );
  }

  const profile = await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);
  const rateKey = clientKeyFromRequest(request);
  const telemetry = telemetryContextFromRequest(request, {
    source: "api",
    route: "/api/spatial/verify-pin",
  });

  const rate = checkPinFailureRateLimit(rateKey);
  if (!rate.allowed) {
    if (allowSecuritySentryLog(rateKey)) {
      captureSpatialInteraction(
        "spatial.verify_pin.rate_limited",
        {
          objectType: "sentry_terminal",
          nodeId: parsed.data.objectId ?? null,
          authState,
          accessLevel: "Superadmin",
          coordinates: parsed.data.coordinates
            ? {
                x: parsed.data.coordinates.x,
                z: parsed.data.coordinates.z,
                y: parsed.data.coordinates.y,
              }
            : null,
          vehicleSpeedStatus: "walk_1x",
        },
        telemetry,
        "warning"
      );
      Sentry.withScope((scope) => {
        scope.setLevel("warning");
        scope.setTag("security.event", "spatial_pin_rate_limited");
        scope.setTag("spatial.auth_state", authState);
        scope.setContext("pin_rate_limit", {
          failureCount: rate.failureCount,
          retryAfterSec: rate.retryAfterSec,
        });
        Sentry.captureMessage(
          "Spatial Superadmin PIN rate limit exceeded",
          "warning"
        );
      });
    }

    return apiError(
      `Too many failed PIN attempts. Retry in ${rate.retryAfterSec}s.`,
      "PIN_RATE_LIMITED",
      429,
      { "retry-after": String(rate.retryAfterSec) }
    );
  }

  try {
    return await withSpatialTelemetry(
      {
        ...telemetry,
        spatial: {
          objectType: "sentry_terminal",
          nodeId: parsed.data.objectId ?? null,
          authState,
          accessLevel: "Superadmin",
          coordinates: parsed.data.coordinates
            ? {
                x: parsed.data.coordinates.x,
                z: parsed.data.coordinates.z,
                y: parsed.data.coordinates.y,
              }
            : null,
          vehicleSpeedStatus: "walk_1x",
        },
      },
      async () => {
        const ok = verifySuperadminPin(parsed.data.pin);

        if (!ok) {
          const after = recordPinFailure(rateKey);

          if (allowSecuritySentryLog(rateKey)) {
            Sentry.withScope((scope) => {
              scope.setLevel("warning");
              scope.setTag("security.event", "spatial_pin_invalid");
              scope.setTag("spatial.object_type", "sentry_terminal");
              scope.setTag("spatial.auth_state", authState);
              scope.setTag("spatial.access_level", "Superadmin");
              if (parsed.data.objectId) {
                scope.setTag("spatial.node_id", parsed.data.objectId);
              }
              if (parsed.data.coordinates) {
                scope.setTag(
                  "spatial.coordinates",
                  `${parsed.data.coordinates.x.toFixed(1)},${parsed.data.coordinates.z.toFixed(1)}`
                );
              }
              scope.setContext("security_telemetry", {
                event: "verify_pin_failed",
                failureCount: after.failureCount,
                remaining: after.remaining,
                userId: profile.id,
                sessionId: parsed.data.sessionId,
              });
              Sentry.captureMessage(
                "Invalid Spatial Superadmin PIN attempt",
                "warning"
              );
            });
          }

          captureSpatialInteraction(
            "spatial.verify_pin.denied",
            {
              objectType: "sentry_terminal",
              nodeId: parsed.data.objectId ?? null,
              authState,
              accessLevel: "Superadmin",
              coordinates: parsed.data.coordinates
                ? {
                    x: parsed.data.coordinates.x,
                    z: parsed.data.coordinates.z,
                    y: parsed.data.coordinates.y,
                  }
                : null,
              vehicleSpeedStatus: "walk_1x",
            },
            telemetry,
            "warning"
          );

          return apiError("Invalid Superadmin PIN.", "PIN_INVALID", 403, {
            "x-pin-attempts-remaining": String(after.remaining),
          });
        }

        const unlock = grantPinUnlock({
          sessionId: parsed.data.sessionId,
          nodeId: parsed.data.objectId ?? parsed.data.nodeType ?? "sentry_terminal",
          lane: "superadmin",
          accessGranted: "Superadmin",
          userId: profile.id,
        });

        const sentryTelemetry = await fetchSanitizedSentryErrors({
          limit: parsed.data.limit ?? 10,
        });

        const nodeType = parsed.data.nodeType ?? "sentry_terminal";

        const decryptedLogs = buildNodeSpecificLogs(nodeType, sentryTelemetry);

        captureSpatialInteraction(
          "spatial.verify_pin.ok",
          {
            objectType: nodeType,
            nodeId: parsed.data.objectId ?? null,
            authState,
            accessLevel: "Superadmin",
            coordinates: parsed.data.coordinates
              ? {
                  x: parsed.data.coordinates.x,
                  z: parsed.data.coordinates.z,
                  y: parsed.data.coordinates.y,
                }
              : null,
            vehicleSpeedStatus: "walk_1x",
          },
          telemetry,
          "info"
        );

        return apiSuccess({
          verified: true,
          unlock: {
            lane: unlock.lane,
            accessGranted: unlock.accessGranted,
            unlockedUntil: new Date(unlock.expiresAt).toISOString(),
            sessionToken: unlock.sessionToken,
          },
          sentryTelemetry,
          decryptedLogs,
          auth: {
            state: authState,
            userId: profile.id,
            isSuperAdmin: profile.isSuperAdmin,
          },
        });
      }
    );
  } catch (error) {
    captureSpatialError(
      error,
      {
        objectType: "sentry_terminal",
        authState,
        accessLevel: "Superadmin",
        nodeId: parsed.data.objectId ?? null,
      },
      telemetry
    );
    return apiError(
      error instanceof Error ? error.message : "PIN verification failed.",
      "VERIFY_PIN_FAILED",
      500
    );
  }
}
