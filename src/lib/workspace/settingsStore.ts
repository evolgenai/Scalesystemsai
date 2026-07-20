import { Prisma } from "@prisma/client";
import { withPrisma } from "@/lib/prisma";
import {
  isWorkspaceFlagsKvConfigured,
  putWorkspaceFlagsToKv,
} from "@/lib/workspace/settingsCache";
import {
  normalizeConfig,
  normalizeFeatureFlags,
  type FeatureFlagsMap,
  type WorkspaceConfigEntry,
  type WorkspaceSettingsDTO,
} from "@/lib/workspace/settingsTypes";

function toDto(
  row: {
    workspaceId: string;
    configJson: unknown;
    featureFlagsJson: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  cache: { kvSynced: boolean; kvConfigured: boolean }
): WorkspaceSettingsDTO {
  return {
    workspaceId: row.workspaceId,
    config: normalizeConfig(row.configJson),
    featureFlags: normalizeFeatureFlags(row.featureFlagsJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cache,
  };
}

async function syncFlagsToKv(
  workspaceId: string,
  flags: FeatureFlagsMap
): Promise<boolean> {
  const cached = await putWorkspaceFlagsToKv(workspaceId, flags);
  return Boolean(cached);
}

/**
 * Load settings for a gated workspace. Auto-creates an empty row when missing.
 */
export async function getOrCreateWorkspaceSettings(
  workspaceId: string
): Promise<WorkspaceSettingsDTO> {
  const kvConfigured = isWorkspaceFlagsKvConfigured();

  const row = await withPrisma(async (db) => {
    const existing = await db.workspaceSettings.findUnique({
      where: { workspaceId },
    });
    if (existing) return existing;

    return db.workspaceSettings.create({
      data: {
        workspaceId,
        configJson: [] as Prisma.InputJsonValue,
        featureFlagsJson: normalizeFeatureFlags({}) as Prisma.InputJsonValue,
      },
    });
  }, "workspaceSettings.getOrCreate");

  const flags = normalizeFeatureFlags(row.featureFlagsJson);
  // Warm KV on read so middleware can resolve flags without a prior PATCH.
  const kvSynced = kvConfigured
    ? await syncFlagsToKv(workspaceId, flags)
    : false;

  return toDto(row, { kvSynced, kvConfigured });
}

export type PatchWorkspaceSettingsParams = {
  workspaceId: string;
  config?: WorkspaceConfigEntry[];
  featureFlags?: FeatureFlagsMap;
  replaceFlags?: boolean;
};

/**
 * Persist config / feature flags, then mirror active flags to Edge KV.
 */
export async function patchWorkspaceSettings(
  params: PatchWorkspaceSettingsParams
): Promise<WorkspaceSettingsDTO> {
  const kvConfigured = isWorkspaceFlagsKvConfigured();

  const row = await withPrisma(async (db) => {
    const current = await db.workspaceSettings.findUnique({
      where: { workspaceId: params.workspaceId },
    });

    const nextConfig =
      params.config !== undefined
        ? params.config
        : normalizeConfig(current?.configJson);

    let nextFlags: FeatureFlagsMap;
    if (params.featureFlags !== undefined) {
      nextFlags = params.replaceFlags
        ? normalizeFeatureFlags(params.featureFlags)
        : {
            ...normalizeFeatureFlags(current?.featureFlagsJson),
            ...params.featureFlags,
          };
    } else {
      nextFlags = normalizeFeatureFlags(current?.featureFlagsJson);
    }

    return db.workspaceSettings.upsert({
      where: { workspaceId: params.workspaceId },
      create: {
        workspaceId: params.workspaceId,
        configJson: nextConfig as Prisma.InputJsonValue,
        featureFlagsJson: nextFlags as Prisma.InputJsonValue,
      },
      update: {
        configJson: nextConfig as Prisma.InputJsonValue,
        featureFlagsJson: nextFlags as Prisma.InputJsonValue,
      },
    });
  }, "workspaceSettings.patch");

  const flags = normalizeFeatureFlags(row.featureFlagsJson);
  const kvSynced = await syncFlagsToKv(params.workspaceId, flags);

  return toDto(row, { kvSynced, kvConfigured });
}
