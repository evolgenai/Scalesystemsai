/**
 * Edge KV mirror for workspace feature flags.
 * Middleware reads these without hitting Postgres.
 */

import { kv } from "@vercel/kv";

const FLAGS_PREFIX = "ws:flags:";
const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h — refreshed on every settings PATCH

export type WorkspaceFlagsKvRecord = {
  workspaceId: string;
  flags: Record<string, boolean>;
  updatedAt: string;
  ttlSec: number;
};

function flagsKey(workspaceId: string): string {
  return `${FLAGS_PREFIX}${workspaceId.trim()}`;
}

function kvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() &&
      process.env.KV_REST_API_TOKEN?.trim()
  );
}

export function isWorkspaceFlagsKvConfigured(): boolean {
  return kvConfigured();
}

/** Edge-safe read — returns null on miss / misconfig / error. */
export async function getWorkspaceFlagsFromKv(
  workspaceId: string
): Promise<WorkspaceFlagsKvRecord | null> {
  if (!kvConfigured() || !workspaceId?.trim()) return null;
  try {
    return (
      (await kv.get<WorkspaceFlagsKvRecord>(flagsKey(workspaceId))) ?? null
    );
  } catch (err) {
    console.error("[settingsCache] getWorkspaceFlagsFromKv failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Persist active feature flags for global edge middleware. */
export async function putWorkspaceFlagsToKv(
  workspaceId: string,
  flags: Record<string, boolean>,
  ttlSec = DEFAULT_TTL_SEC
): Promise<WorkspaceFlagsKvRecord | null> {
  if (!kvConfigured() || !workspaceId?.trim()) return null;

  const ex = Math.max(60, Math.min(ttlSec, 60 * 60 * 24 * 7));
  const payload: WorkspaceFlagsKvRecord = {
    workspaceId: workspaceId.trim(),
    flags: { ...flags },
    updatedAt: new Date().toISOString(),
    ttlSec: ex,
  };

  try {
    await kv.set(flagsKey(payload.workspaceId), payload, { ex });
    return payload;
  } catch (err) {
    console.error("[settingsCache] putWorkspaceFlagsToKv failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function deleteWorkspaceFlagsFromKv(
  workspaceId: string
): Promise<boolean> {
  if (!kvConfigured() || !workspaceId?.trim()) return false;
  try {
    await kv.del(flagsKey(workspaceId.trim()));
    return true;
  } catch (err) {
    console.error("[settingsCache] deleteWorkspaceFlagsFromKv failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Compact header-safe encoding for middleware → origin handoff. */
export function encodeFlagsHeader(
  flags: Record<string, boolean>
): string {
  const enabled = Object.entries(flags)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .sort()
    .slice(0, 32);
  return enabled.join(",");
}

export function isFlagEnabledInKvRecord(
  record: WorkspaceFlagsKvRecord | null | undefined,
  flag: string
): boolean {
  if (!record) return false;
  return record.flags[flag] === true;
}
