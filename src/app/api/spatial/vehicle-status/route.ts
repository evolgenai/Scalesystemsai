/**
 * GET|POST /api/spatial/vehicle-status
 * Vehicle mount state (`is_driving`, `speed_multiplier: 2.0`) plus
 * bio-metallic design tokens for server-rendered metadata.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { authStateFromProfile } from "@/lib/spatial/workstationPin";
import {
  VEHICLE_DRIVE_SPEED_MULTIPLIER,
  dismountVehicle,
  getVehicleState,
  mountVehicle,
  tickVehicleMovement,
} from "@/lib/spatial/vehicleState";
import { BIO_METALLIC_TOKENS } from "@/lib/spatial/bioMetallicTokens";
import {
  captureSpatialError,
  captureSpatialInteraction,
  withSpatialTelemetry,
} from "@/lib/spatial/spatialTelemetry";
import { telemetryContextFromRequest } from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const BodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("status"),
      sessionId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("mount"),
      sessionId: z.string().trim().min(1).max(128),
      vehicleId: z.string().trim().min(1).max(128),
      spawnAnchorId: z.string().trim().min(1).max(128).optional().nullable(),
      position: PositionSchema.optional().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("dismount"),
      sessionId: z.string().trim().min(1).max(128),
      position: PositionSchema.optional().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("tick"),
      sessionId: z.string().trim().min(1).max(128),
      deltaDistance: z.number().min(0).max(10_000),
      position: PositionSchema.optional().nullable(),
    })
    .strict(),
]);

function vehicleStatusPayload(
  sessionId: string,
  authState: string,
  userId: string | null
) {
  const state = getVehicleState(sessionId);
  const is_driving = state.mounted && state.avatarMode === "driving";
  const speed_multiplier = is_driving
    ? VEHICLE_DRIVE_SPEED_MULTIPLIER
    : 1;

  return {
    is_driving,
    speed_multiplier: Number(speed_multiplier),
    avatar_mode: state.avatarMode,
    mounted: state.mounted,
    vehicle_id: state.vehicleId,
    spawn_anchor_id: state.spawnAnchorId,
    position: state.position,
    updated_at: state.updatedAt,
    telemetry: {
      distance_logged: state.telemetry.distanceLogged,
      ticks: state.telemetry.ticks,
      vehicle_speed_status: state.telemetry.vehicleSpeedStatus,
      last_speed_applied: state.telemetry.lastSpeedApplied,
    },
    design_tokens: BIO_METALLIC_TOKENS,
    metadata: {
      theme: BIO_METALLIC_TOKENS.theme,
      colors: BIO_METALLIC_TOKENS.colors,
      surfaces: BIO_METALLIC_TOKENS.surfaces,
      motion: BIO_METALLIC_TOKENS.motion,
      drive_speed_multiplier: VEHICLE_DRIVE_SPEED_MULTIPLIER,
    },
    auth: { state: authState, userId },
    session_id: sessionId,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return apiError("sessionId query param required.", "INVALID_QUERY", 400);
  }

  const profile = await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);
  const payload = vehicleStatusPayload(sessionId, authState, profile.id);

  captureSpatialInteraction(
    "spatial.vehicle_status.get",
    {
      objectType: payload.is_driving ? "automobile_unit" : "vehicle_spawn",
      authState,
      avatarMode: payload.avatar_mode,
      mounted: payload.mounted,
      vehicleSpeedStatus: payload.telemetry.vehicle_speed_status,
      coordinates: payload.position
        ? {
            x: payload.position.x,
            z: payload.position.z,
            y: payload.position.y,
          }
        : null,
    },
    telemetryContextFromRequest(request, {
      route: "/api/spatial/vehicle-status",
    }),
    "info"
  );

  return apiSuccess({ vehicle: payload });
}

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
      parsed.error.issues[0]?.message ?? "Invalid vehicle-status payload.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  const profile = await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);
  const telemetry = telemetryContextFromRequest(request, {
    source: "api",
    route: "/api/spatial/vehicle-status",
  });

  try {
    return await withSpatialTelemetry(
      {
        ...telemetry,
        spatial: {
          objectType: "automobile_unit",
          authState,
          vehicleSpeedStatus:
            body.action === "mount" ? "drive_2x" : "walk_1x",
        },
      },
      async () => {
        if (body.action === "mount") {
          mountVehicle({
            sessionId: body.sessionId,
            userId: profile.id,
            vehicleId: body.vehicleId,
            spawnAnchorId: body.spawnAnchorId,
            position: body.position,
            authState,
          });
        } else if (body.action === "dismount") {
          dismountVehicle({
            sessionId: body.sessionId,
            userId: profile.id,
            position: body.position,
            authState,
          });
        } else if (body.action === "tick") {
          tickVehicleMovement({
            sessionId: body.sessionId,
            deltaDistance: body.deltaDistance,
            position: body.position,
            authState,
          });
        }

        const payload = vehicleStatusPayload(
          body.sessionId,
          authState,
          profile.id
        );

        captureSpatialInteraction(
          `spatial.vehicle_status.${body.action}`,
          {
            objectType: payload.is_driving
              ? "automobile_unit"
              : "vehicle_spawn",
            authState,
            avatarMode: payload.avatar_mode,
            mounted: payload.mounted,
            vehicleSpeedStatus: payload.telemetry.vehicle_speed_status,
            coordinates: payload.position
              ? {
                  x: payload.position.x,
                  z: payload.position.z,
                  y: payload.position.y,
                }
              : null,
          },
          telemetry,
          "info"
        );

        return apiSuccess({
          action: body.action,
          vehicle: payload,
        });
      }
    );
  } catch (error) {
    captureSpatialError(
      error,
      {
        objectType: "automobile_unit",
        authState,
        vehicleSpeedStatus: "walk_1x",
      },
      telemetry
    );
    return apiError(
      error instanceof Error ? error.message : "Vehicle status update failed.",
      "VEHICLE_STATUS_FAILED",
      500
    );
  }
}
