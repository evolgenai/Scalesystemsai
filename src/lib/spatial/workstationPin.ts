/**
 * PIN authentication for locked Spatial Universe workstations.
 * Timing-safe compare; Admin vs Superadmin PIN lanes; session unlock cache.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { SpatialAccessLevel } from "@/lib/spatial/proceduralWorld";

export const DEFAULT_ADMIN_PIN = "2468" as const;
export const DEFAULT_SUPERADMIN_PIN = "0482" as const;

export type PinLane = "admin" | "superadmin";

export type PinAuthState =
  | "anonymous"
  | "authenticated"
  | "admin"
  | "superadmin";

export type PinVerifyResult =
  | {
      ok: true;
      lane: PinLane;
      accessGranted: SpatialAccessLevel;
      unlockedUntil: string;
      sessionToken: string;
    }
  | {
      ok: false;
      code:
        | "PIN_REQUIRED"
        | "PIN_INVALID"
        | "PIN_LANE_MISMATCH"
        | "ACCESS_DENIED";
      error: string;
    };

type UnlockRecord = {
  nodeId: string;
  lane: PinLane;
  accessGranted: SpatialAccessLevel;
  expiresAt: number;
  sessionToken: string;
  userId: string | null;
};

type PinGlobals = {
  __ssSpatialPinUnlocks?: Map<string, UnlockRecord>;
};

const UNLOCK_TTL_MS = 15 * 60 * 1000;

function unlockStore(): Map<string, UnlockRecord> {
  const g = globalThis as unknown as PinGlobals;
  if (!g.__ssSpatialPinUnlocks) {
    g.__ssSpatialPinUnlocks = new Map();
  }
  return g.__ssSpatialPinUnlocks;
}

function normalizePin(pin: string): string {
  return pin.replace(/\s+/g, "").trim();
}

function pinDigest(pin: string, lane: PinLane): Buffer {
  return createHash("sha256")
    .update(`spatial-pin:${lane}:${normalizePin(pin)}`)
    .digest();
}

export function resolveConfiguredPin(lane: PinLane): string {
  if (lane === "superadmin") {
    return (
      process.env.SUPERADMIN_PIN?.trim() ||
      process.env.SPATIAL_SUPERADMIN_PIN?.trim() ||
      process.env.SPATIAL_WORKSTATION_PIN?.trim() ||
      DEFAULT_SUPERADMIN_PIN
    );
  }
  return process.env.SPATIAL_ADMIN_PIN?.trim() || DEFAULT_ADMIN_PIN;
}

/**
 * Verify Superadmin PIN against `process.env.SUPERADMIN_PIN`
 * (with spatial/env fallbacks). Timing-safe.
 */
export function verifySuperadminPin(
  pin: string | null | undefined
): boolean {
  return verifyPin(pin, "superadmin");
}

/** Constant-time PIN verification for a lane. */
export function verifyPin(pin: string | null | undefined, lane: PinLane): boolean {
  if (!pin) return false;
  const provided = normalizePin(pin);
  if (!/^\d{4,8}$/.test(provided)) return false;

  const expected = resolveConfiguredPin(lane);
  const a = pinDigest(provided, lane);
  const b = pinDigest(expected, lane);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function authStateFromProfile(profile: {
  isSuperAdmin: boolean;
  role: string;
  id: string | null;
}): PinAuthState {
  if (profile.isSuperAdmin || profile.role === "SUPER_ADMIN") {
    return "superadmin";
  }
  if (
    profile.role === "ADMIN" ||
    profile.role === "DEVELOPER" ||
    // Workspace seat roles arrive separately; treat signed-in users as authenticated.
    Boolean(profile.id)
  ) {
    if (profile.role === "ADMIN" || profile.role === "DEVELOPER") {
      return "admin";
    }
    return "authenticated";
  }
  return "anonymous";
}

export function requiredLaneForAccess(
  accessLevel: SpatialAccessLevel
): PinLane | null {
  if (accessLevel === "Public") return null;
  if (accessLevel === "Admin") return "admin";
  return "superadmin";
}

/**
 * Determine whether a caller may interact without a PIN (role bypass).
 * Superadmin-locked nodes still require PIN as a second factor unless
 * `allowSuperadminBypass` is true (session already proven via PIN unlock).
 */
export function canBypassPin(options: {
  accessLevel: SpatialAccessLevel;
  authState: PinAuthState;
  allowSuperadminBypass?: boolean;
}): boolean {
  const { accessLevel, authState, allowSuperadminBypass = false } = options;
  if (accessLevel === "Public") return true;
  if (accessLevel === "Admin") {
    return authState === "admin" || authState === "superadmin";
  }
  // Superadmin nodes: role alone is insufficient unless explicit bypass.
  return allowSuperadminBypass && authState === "superadmin";
}

function unlockKey(sessionId: string, nodeId: string): string {
  return `${sessionId}::${nodeId}`;
}

export function mintUnlockSessionToken(
  sessionId: string,
  nodeId: string,
  lane: PinLane
): string {
  return createHash("sha256")
    .update(`${sessionId}|${nodeId}|${lane}|${Date.now()}`)
    .digest("hex")
    .slice(0, 32);
}

export function grantPinUnlock(options: {
  sessionId: string;
  nodeId: string;
  lane: PinLane;
  accessGranted: SpatialAccessLevel;
  userId?: string | null;
  ttlMs?: number;
}): UnlockRecord {
  const sessionToken = mintUnlockSessionToken(
    options.sessionId,
    options.nodeId,
    options.lane
  );
  const record: UnlockRecord = {
    nodeId: options.nodeId,
    lane: options.lane,
    accessGranted: options.accessGranted,
    expiresAt: Date.now() + (options.ttlMs ?? UNLOCK_TTL_MS),
    sessionToken,
    userId: options.userId ?? null,
  };
  unlockStore().set(unlockKey(options.sessionId, options.nodeId), record);
  return record;
}

export function getPinUnlock(
  sessionId: string,
  nodeId: string
): UnlockRecord | null {
  const key = unlockKey(sessionId, nodeId);
  const record = unlockStore().get(key);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    unlockStore().delete(key);
    return null;
  }
  return record;
}

export function revokePinUnlock(sessionId: string, nodeId: string): boolean {
  return unlockStore().delete(unlockKey(sessionId, nodeId));
}

/**
 * Full unlock flow: role bypass or PIN lane verification.
 */
export function authenticateWorkstationAccess(options: {
  accessLevel: SpatialAccessLevel;
  requiresPin: boolean;
  authState: PinAuthState;
  pin?: string | null;
  sessionId: string;
  nodeId: string;
  userId?: string | null;
  membershipRole?: string | null;
}): PinVerifyResult {
  const effectiveAuth: PinAuthState =
    options.membershipRole === "ADMIN" ||
    options.membershipRole === "DEVELOPER"
      ? options.authState === "superadmin"
        ? "superadmin"
        : "admin"
      : options.authState;

  const existing = getPinUnlock(options.sessionId, options.nodeId);
  if (existing) {
    return {
      ok: true,
      lane: existing.lane,
      accessGranted: existing.accessGranted,
      unlockedUntil: new Date(existing.expiresAt).toISOString(),
      sessionToken: existing.sessionToken,
    };
  }

  if (
    !options.requiresPin &&
    canBypassPin({
      accessLevel: options.accessLevel,
      authState: effectiveAuth,
    })
  ) {
    const lane =
      options.accessLevel === "Superadmin" ? "superadmin" : "admin";
    const record = grantPinUnlock({
      sessionId: options.sessionId,
      nodeId: options.nodeId,
      lane,
      accessGranted: options.accessLevel,
      userId: options.userId,
    });
    return {
      ok: true,
      lane: record.lane,
      accessGranted: record.accessGranted,
      unlockedUntil: new Date(record.expiresAt).toISOString(),
      sessionToken: record.sessionToken,
    };
  }

  if (options.accessLevel === "Public") {
    const record = grantPinUnlock({
      sessionId: options.sessionId,
      nodeId: options.nodeId,
      lane: "admin",
      accessGranted: "Public",
      userId: options.userId,
    });
    return {
      ok: true,
      lane: record.lane,
      accessGranted: "Public",
      unlockedUntil: new Date(record.expiresAt).toISOString(),
      sessionToken: record.sessionToken,
    };
  }

  const lane = requiredLaneForAccess(options.accessLevel);
  if (!lane) {
    return {
      ok: false,
      code: "ACCESS_DENIED",
      error: "Unable to resolve PIN lane for access level.",
    };
  }

  // Admin nodes: seat role can bypass PIN.
  if (
    options.accessLevel === "Admin" &&
    canBypassPin({ accessLevel: "Admin", authState: effectiveAuth })
  ) {
    const record = grantPinUnlock({
      sessionId: options.sessionId,
      nodeId: options.nodeId,
      lane: "admin",
      accessGranted: "Admin",
      userId: options.userId,
    });
    return {
      ok: true,
      lane: "admin",
      accessGranted: "Admin",
      unlockedUntil: new Date(record.expiresAt).toISOString(),
      sessionToken: record.sessionToken,
    };
  }

  if (!options.pin) {
    return {
      ok: false,
      code: "PIN_REQUIRED",
      error:
        options.accessLevel === "Superadmin"
          ? "Superadmin PIN required to unlock this workstation."
          : "Admin PIN required to unlock this workstation.",
    };
  }

  if (!verifyPin(options.pin, lane)) {
    // Allow Superadmin PIN to open Admin-locked stations (higher privilege).
    if (lane === "admin" && verifyPin(options.pin, "superadmin")) {
      const record = grantPinUnlock({
        sessionId: options.sessionId,
        nodeId: options.nodeId,
        lane: "superadmin",
        accessGranted: options.accessLevel,
        userId: options.userId,
      });
      return {
        ok: true,
        lane: "superadmin",
        accessGranted: options.accessLevel,
        unlockedUntil: new Date(record.expiresAt).toISOString(),
        sessionToken: record.sessionToken,
      };
    }
    return {
      ok: false,
      code: "PIN_INVALID",
      error: "Invalid workstation PIN.",
    };
  }

  const record = grantPinUnlock({
    sessionId: options.sessionId,
    nodeId: options.nodeId,
    lane,
    accessGranted: options.accessLevel,
    userId: options.userId,
  });

  return {
    ok: true,
    lane: record.lane,
    accessGranted: record.accessGranted,
    unlockedUntil: new Date(record.expiresAt).toISOString(),
    sessionToken: record.sessionToken,
  };
}
