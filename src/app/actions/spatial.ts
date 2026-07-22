"use server";

/**
 * Server Actions — Spatial Universe procedural world + vehicle/PIN helpers.
 */

import {
  generateProceduralWorld,
  type ProceduralWorld,
  type GenerateProceduralWorldOptions,
} from "@/lib/spatial/proceduralWorld";
import {
  generateWorldObjectsMatrix,
  type WorldObjectsMatrix,
  type GenerateWorldObjectsOptions,
} from "@/lib/spatial/worldObjects";
import {
  authenticateWorkstationAccess,
  authStateFromProfile,
  verifySuperadminPin,
  grantPinUnlock,
  type PinVerifyResult,
} from "@/lib/spatial/workstationPin";
import {
  getVehicleState,
  mountVehicle,
  dismountVehicle,
  tickVehicleMovement,
  type VehicleState,
} from "@/lib/spatial/vehicleState";
import { fetchSanitizedSentryErrors } from "@/lib/spatial/sentryLiveLogs";
import { BIO_METALLIC_TOKENS } from "@/lib/spatial/bioMetallicTokens";
import {
  withServerActionTelemetry,
  type ServerActionResult,
} from "@/lib/sentry";
import { captureSpatialInteraction } from "@/lib/spatial/spatialTelemetry";

export async function generateWorldObjectsAction(
  options: GenerateWorldObjectsOptions = {}
): Promise<ServerActionResult<WorldObjectsMatrix>> {
  return withServerActionTelemetry(
    {
      actionName: "spatial.generateWorldObjects",
      source: "server_action",
      route: "actions/spatial",
    },
    async () => generateWorldObjectsMatrix(options)
  );
}

export async function generateSpatialWorldAction(
  options: GenerateProceduralWorldOptions = {}
): Promise<ServerActionResult<ProceduralWorld>> {
  return withServerActionTelemetry(
    {
      actionName: "spatial.generateProceduralWorld",
      source: "server_action",
      route: "actions/spatial",
    },
    async () => {
      const world = generateProceduralWorld(options);
      captureSpatialInteraction(
        "spatial.procedural_world.action",
        {
          objectType: "procedural_world",
          authState: "server_action",
          accessLevel: "Public",
          vehicleSpeedStatus: "walk_1x",
        },
        { source: "server_action", route: "actions/spatial" },
        "info"
      );
      return world;
    }
  );
}

export async function verifySuperadminPinAction(input: {
  pin: string;
  sessionId: string;
  objectId?: string;
}): Promise<
  ServerActionResult<{
    verified: boolean;
    designTokens: typeof BIO_METALLIC_TOKENS;
    sentryTelemetry: Awaited<ReturnType<typeof fetchSanitizedSentryErrors>> | null;
    unlock: {
      sessionToken: string;
      unlockedUntil: string;
    } | null;
  }>
> {
  return withServerActionTelemetry(
    {
      actionName: "spatial.verifySuperadminPin",
      source: "server_action",
      route: "actions/spatial",
    },
    async () => {
      const verified = verifySuperadminPin(input.pin);
      if (!verified) {
        return {
          verified: false,
          designTokens: BIO_METALLIC_TOKENS,
          sentryTelemetry: null,
          unlock: null,
        };
      }
      const unlock = grantPinUnlock({
        sessionId: input.sessionId,
        nodeId: input.objectId ?? "sentry_terminal",
        lane: "superadmin",
        accessGranted: "Superadmin",
      });
      const sentryTelemetry = await fetchSanitizedSentryErrors({ limit: 10 });
      return {
        verified: true,
        designTokens: BIO_METALLIC_TOKENS,
        sentryTelemetry,
        unlock: {
          sessionToken: unlock.sessionToken,
          unlockedUntil: new Date(unlock.expiresAt).toISOString(),
        },
      };
    }
  );
}


export async function unlockWorkstationAction(input: {
  nodeId: string;
  sessionId: string;
  pin?: string;
  seed?: string;
  count?: number;
  accessLevel: "Public" | "Admin" | "Superadmin";
  requiresPin: boolean;
  userId?: string | null;
  isSuperAdmin?: boolean;
  role?: string;
}): Promise<ServerActionResult<PinVerifyResult>> {
  return withServerActionTelemetry(
    {
      actionName: "spatial.unlockWorkstation",
      source: "server_action",
      route: "actions/spatial",
      extra: { nodeId: input.nodeId },
    },
    async () => {
      const authState = authStateFromProfile({
        id: input.userId ?? null,
        isSuperAdmin: Boolean(input.isSuperAdmin),
        role: input.role ?? "USER",
      });
      return authenticateWorkstationAccess({
        accessLevel: input.accessLevel,
        requiresPin: input.requiresPin,
        authState,
        pin: input.pin,
        sessionId: input.sessionId,
        nodeId: input.nodeId,
        userId: input.userId,
      });
    }
  );
}

export async function syncVehicleStateAction(input: {
  action: "mount" | "dismount" | "tick" | "status";
  sessionId: string;
  vehicleId?: string;
  spawnAnchorId?: string | null;
  deltaDistance?: number;
  position?: { x: number; y: number; z: number } | null;
  userId?: string | null;
  authState?: string;
}): Promise<ServerActionResult<VehicleState>> {
  return withServerActionTelemetry(
    {
      actionName: `spatial.vehicle.${input.action}`,
      source: "server_action",
      route: "actions/spatial",
    },
    async () => {
      if (input.action === "status") return getVehicleState(input.sessionId);
      if (input.action === "mount") {
        if (!input.vehicleId) throw new Error("vehicleId required to mount.");
        return mountVehicle({
          sessionId: input.sessionId,
          userId: input.userId,
          vehicleId: input.vehicleId,
          spawnAnchorId: input.spawnAnchorId,
          position: input.position,
          authState: input.authState,
        });
      }
      if (input.action === "dismount") {
        return dismountVehicle({
          sessionId: input.sessionId,
          userId: input.userId,
          position: input.position,
          authState: input.authState,
        });
      }
      return tickVehicleMovement({
        sessionId: input.sessionId,
        deltaDistance: input.deltaDistance ?? 0,
        position: input.position,
        authState: input.authState,
      });
    }
  );
}
