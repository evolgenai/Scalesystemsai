/**
 * Spatial Universe vehicle mount state — walking vs driving with 2× speed
 * applied to server-side telemetry logs while mounted.
 */

import { z } from "zod";

export const VEHICLE_DRIVE_SPEED_MULTIPLIER = 2 as const;
export const VEHICLE_WALK_SPEED_MULTIPLIER = 1 as const;

export const AvatarModeSchema = z.enum(["walking", "driving"]);
export type AvatarMode = z.infer<typeof AvatarModeSchema>;

export const VehicleStateSchema = z.object({
  sessionId: z.string().min(1).max(128),
  userId: z.string().nullable(),
  avatarMode: AvatarModeSchema,
  mounted: z.boolean(),
  vehicleId: z.string().nullable(),
  spawnAnchorId: z.string().nullable(),
  speedMultiplier: z.union([
    z.literal(VEHICLE_WALK_SPEED_MULTIPLIER),
    z.literal(VEHICLE_DRIVE_SPEED_MULTIPLIER),
  ]),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .nullable(),
  updatedAt: z.string().datetime(),
  telemetry: z.object({
    distanceLogged: z.number().min(0),
    ticks: z.number().int().min(0),
    lastSpeedApplied: z.number().positive(),
    vehicleSpeedStatus: z.enum(["walk_1x", "drive_2x"]),
  }),
});
export type VehicleState = z.infer<typeof VehicleStateSchema>;

export type VehicleTelemetryLog = {
  at: string;
  sessionId: string;
  avatarMode: AvatarMode;
  speedMultiplier: number;
  vehicleSpeedStatus: "walk_1x" | "drive_2x";
  deltaDistance: number;
  effectiveDistance: number;
  position: { x: number; y: number; z: number } | null;
  objectType: string | null;
  coordinates: { x: number; z: number } | null;
  authState: string;
};

type VehicleGlobals = {
  __ssSpatialVehicleState?: Map<string, VehicleState>;
  __ssSpatialVehicleLogs?: VehicleTelemetryLog[];
};

const MAX_LOGS = 500;

function stateStore(): Map<string, VehicleState> {
  const g = globalThis as unknown as VehicleGlobals;
  if (!g.__ssSpatialVehicleState) {
    g.__ssSpatialVehicleState = new Map();
  }
  return g.__ssSpatialVehicleState;
}

function logStore(): VehicleTelemetryLog[] {
  const g = globalThis as unknown as VehicleGlobals;
  if (!g.__ssSpatialVehicleLogs) {
    g.__ssSpatialVehicleLogs = [];
  }
  return g.__ssSpatialVehicleLogs;
}

export function vehicleSpeedStatus(
  mode: AvatarMode
): "walk_1x" | "drive_2x" {
  return mode === "driving" ? "drive_2x" : "walk_1x";
}

export function speedMultiplierForMode(mode: AvatarMode): 1 | 2 {
  return mode === "driving"
    ? VEHICLE_DRIVE_SPEED_MULTIPLIER
    : VEHICLE_WALK_SPEED_MULTIPLIER;
}

function emptyState(
  sessionId: string,
  userId: string | null = null
): VehicleState {
  const now = new Date().toISOString();
  return {
    sessionId,
    userId,
    avatarMode: "walking",
    mounted: false,
    vehicleId: null,
    spawnAnchorId: null,
    speedMultiplier: VEHICLE_WALK_SPEED_MULTIPLIER,
    position: null,
    updatedAt: now,
    telemetry: {
      distanceLogged: 0,
      ticks: 0,
      lastSpeedApplied: VEHICLE_WALK_SPEED_MULTIPLIER,
      vehicleSpeedStatus: "walk_1x",
    },
  };
}

export function getVehicleState(sessionId: string): VehicleState {
  return stateStore().get(sessionId) ?? emptyState(sessionId);
}

export type MountVehicleInput = {
  sessionId: string;
  userId?: string | null;
  vehicleId: string;
  spawnAnchorId?: string | null;
  position?: { x: number; y: number; z: number } | null;
  authState?: string;
};

export function mountVehicle(input: MountVehicleInput): VehicleState {
  const prev = getVehicleState(input.sessionId);
  const now = new Date().toISOString();
  const next: VehicleState = {
    ...prev,
    userId: input.userId ?? prev.userId,
    avatarMode: "driving",
    mounted: true,
    vehicleId: input.vehicleId,
    spawnAnchorId: input.spawnAnchorId ?? prev.spawnAnchorId,
    speedMultiplier: VEHICLE_DRIVE_SPEED_MULTIPLIER,
    position: input.position ?? prev.position,
    updatedAt: now,
    telemetry: {
      ...prev.telemetry,
      lastSpeedApplied: VEHICLE_DRIVE_SPEED_MULTIPLIER,
      vehicleSpeedStatus: "drive_2x",
      ticks: prev.telemetry.ticks + 1,
    },
  };
  stateStore().set(input.sessionId, next);
  appendVehicleTelemetryLog({
    at: now,
    sessionId: input.sessionId,
    avatarMode: "driving",
    speedMultiplier: VEHICLE_DRIVE_SPEED_MULTIPLIER,
    vehicleSpeedStatus: "drive_2x",
    deltaDistance: 0,
    effectiveDistance: 0,
    position: next.position,
    objectType: "vehicle_spawn_anchor",
    coordinates: next.position
      ? { x: next.position.x, z: next.position.z }
      : null,
    authState: input.authState ?? "unknown",
  });
  return next;
}

export type DismountVehicleInput = {
  sessionId: string;
  userId?: string | null;
  position?: { x: number; y: number; z: number } | null;
  authState?: string;
};

export function dismountVehicle(input: DismountVehicleInput): VehicleState {
  const prev = getVehicleState(input.sessionId);
  const now = new Date().toISOString();
  const next: VehicleState = {
    ...prev,
    userId: input.userId ?? prev.userId,
    avatarMode: "walking",
    mounted: false,
    vehicleId: null,
    speedMultiplier: VEHICLE_WALK_SPEED_MULTIPLIER,
    position: input.position ?? prev.position,
    updatedAt: now,
    telemetry: {
      ...prev.telemetry,
      lastSpeedApplied: VEHICLE_WALK_SPEED_MULTIPLIER,
      vehicleSpeedStatus: "walk_1x",
      ticks: prev.telemetry.ticks + 1,
    },
  };
  stateStore().set(input.sessionId, next);
  appendVehicleTelemetryLog({
    at: now,
    sessionId: input.sessionId,
    avatarMode: "walking",
    speedMultiplier: VEHICLE_WALK_SPEED_MULTIPLIER,
    vehicleSpeedStatus: "walk_1x",
    deltaDistance: 0,
    effectiveDistance: 0,
    position: next.position,
    objectType: null,
    coordinates: next.position
      ? { x: next.position.x, z: next.position.z }
      : null,
    authState: input.authState ?? "unknown",
  });
  return next;
}

export type TickVehicleInput = {
  sessionId: string;
  /** Raw world-space distance moved this tick (pre-multiplier). */
  deltaDistance: number;
  position?: { x: number; y: number; z: number } | null;
  authState?: string;
};

/**
 * Apply movement tick. While driving, effective distance logged is 2×.
 */
export function tickVehicleMovement(input: TickVehicleInput): VehicleState {
  const prev = getVehicleState(input.sessionId);
  const mult = speedMultiplierForMode(prev.avatarMode);
  const delta = Math.max(0, input.deltaDistance);
  const effective = Number((delta * mult).toFixed(4));
  const now = new Date().toISOString();

  const next: VehicleState = {
    ...prev,
    position: input.position ?? prev.position,
    updatedAt: now,
    speedMultiplier: mult,
    telemetry: {
      distanceLogged: Number(
        (prev.telemetry.distanceLogged + effective).toFixed(4)
      ),
      ticks: prev.telemetry.ticks + 1,
      lastSpeedApplied: mult,
      vehicleSpeedStatus: vehicleSpeedStatus(prev.avatarMode),
    },
  };
  stateStore().set(input.sessionId, next);

  if (delta > 0) {
    appendVehicleTelemetryLog({
      at: now,
      sessionId: input.sessionId,
      avatarMode: prev.avatarMode,
      speedMultiplier: mult,
      vehicleSpeedStatus: vehicleSpeedStatus(prev.avatarMode),
      deltaDistance: delta,
      effectiveDistance: effective,
      position: next.position,
      objectType: prev.mounted ? "automobile_unit" : null,
      coordinates: next.position
        ? { x: next.position.x, z: next.position.z }
        : null,
      authState: input.authState ?? "unknown",
    });
  }

  return next;
}

export function appendVehicleTelemetryLog(entry: VehicleTelemetryLog): void {
  const logs = logStore();
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
}

export function listVehicleTelemetryLogs(
  sessionId?: string,
  limit = 50
): VehicleTelemetryLog[] {
  const logs = logStore();
  const filtered = sessionId
    ? logs.filter((l) => l.sessionId === sessionId)
    : logs;
  return filtered.slice(-Math.max(1, Math.min(200, limit)));
}
