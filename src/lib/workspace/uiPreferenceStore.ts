import { withPrisma } from "@/lib/prisma";
import {
  isWorkspaceUiPreferenceKvConfigured,
  putWorkspaceUiPreferenceToKv,
} from "@/lib/workspace/uiPreferenceCache";
import {
  normalizeUiPreference,
  type UiPreferenceDTO,
  type UiPreferenceMode,
} from "@/lib/workspace/uiPreferenceTypes";

function toDto(
  row: {
    id: string;
    uiPreference: string;
    updatedAt: Date;
  },
  cache: { kvSynced: boolean; kvConfigured: boolean }
): UiPreferenceDTO {
  return {
    workspaceId: row.id,
    uiPreference: normalizeUiPreference(row.uiPreference),
    updatedAt: row.updatedAt.toISOString(),
    cache,
  };
}

async function syncPreferenceToKv(
  workspaceId: string,
  uiPreference: UiPreferenceMode
): Promise<boolean> {
  const cached = await putWorkspaceUiPreferenceToKv(workspaceId, uiPreference);
  return Boolean(cached);
}

/**
 * Load tenant UI preference. Warms Edge KV so middleware can resolve
 * viewport mode without a prior PATCH.
 */
export async function getWorkspaceUiPreference(
  workspaceId: string
): Promise<UiPreferenceDTO> {
  const kvConfigured = isWorkspaceUiPreferenceKvConfigured();

  const row = await withPrisma(async (db) => {
    return db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, uiPreference: true, updatedAt: true },
    });
  }, "workspace.uiPreference.get");

  const uiPreference = normalizeUiPreference(row.uiPreference);
  const kvSynced = kvConfigured
    ? await syncPreferenceToKv(workspaceId, uiPreference)
    : false;

  return toDto(row, { kvSynced, kvConfigured });
}

/**
 * Persist tenant UI preference, then mirror to Edge KV immediately.
 */
export async function patchWorkspaceUiPreference(params: {
  workspaceId: string;
  uiPreference: UiPreferenceMode;
}): Promise<UiPreferenceDTO> {
  const kvConfigured = isWorkspaceUiPreferenceKvConfigured();
  const next = normalizeUiPreference(params.uiPreference);

  const row = await withPrisma(async (db) => {
    return db.workspace.update({
      where: { id: params.workspaceId },
      data: { uiPreference: next },
      select: { id: true, uiPreference: true, updatedAt: true },
    });
  }, "workspace.uiPreference.patch");

  const uiPreference = normalizeUiPreference(row.uiPreference);
  const kvSynced = await syncPreferenceToKv(params.workspaceId, uiPreference);

  return toDto(row, { kvSynced, kvConfigured });
}
