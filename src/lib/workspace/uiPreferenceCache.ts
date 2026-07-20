/**
 * Edge KV mirror for tenant UI preference (USER | DEVELOPER).
 * Middleware reads this without hitting Postgres so layouts can
 * render the correct viewport mode on first paint.
 */

import { kv } from "@vercel/kv";
import {
  DEFAULT_UI_PREFERENCE,
  type UiPreferenceMode,
} from "@/lib/workspace/uiPreferenceTypes";

const PREF_PREFIX = "ws:ui-pref:";
const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h — refreshed on every preference PATCH

export type WorkspaceUiPreferenceKvRecord = {
  workspaceId: string;
  uiPreference: UiPreferenceMode;
  updatedAt: string;
  ttlSec: number;
};

function prefKey(workspaceId: string): string {
  return `${PREF_PREFIX}${workspaceId.trim()}`;
}

function kvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() &&
      process.env.KV_REST_API_TOKEN?.trim()
  );
}

export function isWorkspaceUiPreferenceKvConfigured(): boolean {
  return kvConfigured();
}

/** Edge-safe read — returns null on miss / misconfig / error. */
export async function getWorkspaceUiPreferenceFromKv(
  workspaceId: string
): Promise<WorkspaceUiPreferenceKvRecord | null> {
  if (!kvConfigured() || !workspaceId?.trim()) return null;
  try {
    const record = await kv.get<WorkspaceUiPreferenceKvRecord>(
      prefKey(workspaceId)
    );
    if (!record) return null;
    if (
      record.uiPreference !== "USER" &&
      record.uiPreference !== "DEVELOPER"
    ) {
      return {
        ...record,
        uiPreference: DEFAULT_UI_PREFERENCE,
      };
    }
    return record;
  } catch (err) {
    console.error("[uiPreferenceCache] getWorkspaceUiPreferenceFromKv failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Persist active UI preference for global edge middleware / layouts. */
export async function putWorkspaceUiPreferenceToKv(
  workspaceId: string,
  uiPreference: UiPreferenceMode,
  ttlSec = DEFAULT_TTL_SEC
): Promise<WorkspaceUiPreferenceKvRecord | null> {
  if (!kvConfigured() || !workspaceId?.trim()) return null;

  const mode: UiPreferenceMode =
    uiPreference === "DEVELOPER" ? "DEVELOPER" : "USER";
  const ex = Math.max(60, Math.min(ttlSec, 60 * 60 * 24 * 7));
  const payload: WorkspaceUiPreferenceKvRecord = {
    workspaceId: workspaceId.trim(),
    uiPreference: mode,
    updatedAt: new Date().toISOString(),
    ttlSec: ex,
  };

  try {
    await kv.set(prefKey(payload.workspaceId), payload, { ex });
    return payload;
  } catch (err) {
    console.error("[uiPreferenceCache] putWorkspaceUiPreferenceToKv failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function deleteWorkspaceUiPreferenceFromKv(
  workspaceId: string
): Promise<boolean> {
  if (!kvConfigured() || !workspaceId?.trim()) return false;
  try {
    await kv.del(prefKey(workspaceId.trim()));
    return true;
  } catch (err) {
    console.error(
      "[uiPreferenceCache] deleteWorkspaceUiPreferenceFromKv failed",
      {
        message: err instanceof Error ? err.message : String(err),
      }
    );
    return false;
  }
}
