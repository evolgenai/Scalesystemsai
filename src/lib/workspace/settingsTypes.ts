import { z } from "zod";

/** Well-known platform feature flags (extensible via arbitrary string keys). */
export const PLATFORM_FEATURE_FLAGS = [
  "experimental_ai_optimization",
  "third_party_webhooks",
  "edge_regional_affinity",
  "agent_sandbox",
  "telemetry_chaos",
] as const;

export type PlatformFeatureFlag = (typeof PLATFORM_FEATURE_FLAGS)[number];

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  experimental_ai_optimization: false,
  third_party_webhooks: false,
  edge_regional_affinity: true,
  agent_sandbox: true,
  telemetry_chaos: false,
};

export const WorkspaceConfigEntrySchema = z
  .object({
    key: z.string().trim().min(1).max(128),
    value: z.union([
      z.string().max(8_192),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
    label: z.string().trim().max(256).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type WorkspaceConfigEntry = z.infer<typeof WorkspaceConfigEntrySchema>;

export const FeatureFlagsSchema = z
  .record(z.string().trim().min(1).max(128), z.boolean())
  .refine((flags) => Object.keys(flags).length <= 64, {
    message: "At most 64 feature flags allowed.",
  });

export type FeatureFlagsMap = z.infer<typeof FeatureFlagsSchema>;

export const PatchWorkspaceSettingsSchema = z
  .object({
    workspaceId: z.string().uuid().optional().nullable(),
    /** Replace entire config array when provided. */
    config: z.array(WorkspaceConfigEntrySchema).max(128).optional(),
    /** Merge into existing flags (partial update). */
    featureFlags: FeatureFlagsSchema.optional(),
    /** When true, replace flags wholesale instead of merge. */
    replaceFlags: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) => body.config !== undefined || body.featureFlags !== undefined,
    { message: "Provide config and/or featureFlags to update." }
  );

export type PatchWorkspaceSettingsInput = z.infer<
  typeof PatchWorkspaceSettingsSchema
>;

export type WorkspaceSettingsDTO = {
  workspaceId: string;
  config: WorkspaceConfigEntry[];
  featureFlags: FeatureFlagsMap;
  updatedAt: string;
  createdAt: string;
  cache: {
    kvSynced: boolean;
    kvConfigured: boolean;
  };
};

export function normalizeFeatureFlags(
  raw: unknown
): FeatureFlagsMap {
  const base = { ...DEFAULT_FEATURE_FLAGS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = key.trim().slice(0, 128);
    if (!k) continue;
    if (typeof value === "boolean") base[k] = value;
  }
  return base;
}

export function normalizeConfig(raw: unknown): WorkspaceConfigEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkspaceConfigEntry[] = [];
  for (const item of raw.slice(0, 128)) {
    const parsed = WorkspaceConfigEntrySchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
