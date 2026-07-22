/**
 * GET /api/spatial/vehicle-state?sessionId=
 * POST /api/spatial/vehicle-state
 *   { action: "mount" | "dismount" | "tick" | "status", sessionId, ... }
 *
 * Tracks avatar walking vs driving and applies 2× speed to server-side
 * telemetry distance logs while mounted.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { enforcePermission } from "@/lib/auth/rbacMiddleware";
import { authStateFromProfile } from "@/lib/spatial/workstationPin";
import {
  VEHICLE_DRIVE_SPEED_MULTIPLIER,
  dismountVehicle,
  getVehicleState,
  listVehicleTelemetryLogs,
  mountVehicle,
  tickVehicleMovement,
} from "@/lib/spatial/vehicleState";
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
      workspaceId: z.string().trim().min(1).optional(),
      includeLogs: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("mount"),
      sessionId: z.string().trim().min(1).max(128),
      vehicleId: z.string().trim().min(1).max(128),
      spawnAnchorId: z.string().trim().min(1).max(128).optional().nullable(),
      position: PositionSchema.optional().nullable(),
      workspaceId: z.string().trim().min(1).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("dismount"),
      sessionId: z.string().trim().min(1).max(128),
      position: PositionSchema.optional().nullable(),
      workspaceId: z.string().trim().min(1).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("tick"),
      sessionId: z.string().trim().min(1).max(128),
      deltaDistance: z.number().min(0).max(10_000),
      position: PositionSchema.optional().nullable(),
      workspaceId: z.string().trim().min(1).optional(),
    })
    .strict(),
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return apiError("sessionId query param required.", "INVALID_QUERY", 400);
  }

  const profile = await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);
  const state = getVehicleState(sessionId);
  const includeLogs = url.searchParams.get("includeLogs") === "1";

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/vehicle-state",
  });

  captureSpatialInteraction(
    "spatial.vehicle.status",
    {
      objectType: state.mounted ? "automobile_unit" : null,
      authState,
      coordinates: state.position
        ? { x: state.position.x, z: state.position.z, y: state.position.y }
        : null,
      vehicleSpeedStatus: state.telemetry.vehicleSpeedStatus,
      avatarMode: state.avatarMode,
      mounted: state.mounted,
    },
    telemetry,
    "info"
  );

  return apiSuccess({
    state,
    driveSpeedMultiplier: VEHICLE_DRIVE_SPEED_MULTIPLIER,
    auth: { state: authState, userId: profile.id },
    logs: includeLogs ? listVehicleTelemetryLogs(sessionId, 40) : undefined,
  });
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
      parsed.error.issues[0]?.message ?? "Invalid vehicle-state payload.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  const rbac = await enforcePermission(
    request,
    "spatial.vehicle",
    body.workspaceId ?? null
  );
  const profile = rbac.ok
    ? rbac.ctx.profile
    : await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);

  // Mount/dismount/tick prefer workspace permission but allow demo sessions
  // without a key (status-equivalent) so the Spatial Universe still works.
  if (
    !rbac.ok &&
    body.action !== "status" &&
    process.env.SPATIAL_REQUIRE_WORKSPACE_KEY === "1"
  ) {
    return rbac.response;
  }

  const telemetry = telemetryContextFromRequest(request, {
    source: "api",
    route: "/api/spatial/vehicle-state",
    tenantId: rbac.ok ? rbac.ctx.workspaceId : undefined,
  });

  try {
    return await withSpatialTelemetry(
      {
        ...telemetry,
        spatial: {
          authState,
          objectType: "automobile_unit",
          vehicleSpeedStatus:
            body.action === "mount" ? "drive_2x" : "walk_1x",
        },
      },
      async () => {
        const state =
          body.action === "status"
            ? getVehicleState(body.sessionId)
            : body.action === "mount"
              ? mountVehicle({
                  sessionId: body.sessionId,
                  userId: profile.id,
                  vehicleId: body.vehicleId,
                  spawnAnchorId: body.spawnAnchorId,
                  position: body.position,
                  authState,
                })
              : body.action === "dismount"
                ? dismountVehicle({
                    sessionId: body.sessionId,
                    userId: profile.id,
                    position: body.position,
                    authState,
                  })
                : tickVehicleMovement({
                    sessionId: body.sessionId,
                    deltaDistance: body.deltaDistance,
                    position: body.position,
                    authState,
                  });

        captureSpatialInteraction(
          `spatial.vehicle.${body.action}`,
          {
            objectType: state.mounted ? "automobile_unit" : null,
            nodeId: state.spawnAnchorId,
            authState,
            coordinates: state.position
              ? {
                  x: state.position.x,
                  z: state.position.z,
                  y: state.position.y,
                }
              : null,
            vehicleSpeedStatus: state.telemetry.vehicleSpeedStatus,
            avatarMode: state.avatarMode,
            mounted: state.mounted,
          },
          telemetry,
          "info"
        );

        return apiSuccess({
          action: body.action,
          state,
          driveSpeedMultiplier: VEHICLE_DRIVE_SPEED_MULTIPLIER,
          auth: { state: authState, userId: profile.id },
          logs:
            body.action === "status" && body.includeLogs
              ? listVehicleTelemetryLogs(body.sessionId, 40)
              : undefined,
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
      error instanceof Error ? error.message : "Vehicle state update failed.",
      "VEHICLE_STATE_FAILED",
      500
    );
  }
}
