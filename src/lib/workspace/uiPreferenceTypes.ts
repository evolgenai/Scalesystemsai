import { z } from "zod";

export const UI_PREFERENCES = ["USER", "DEVELOPER"] as const;

export type UiPreferenceMode = (typeof UI_PREFERENCES)[number];

export const DEFAULT_UI_PREFERENCE: UiPreferenceMode = "USER";

export const UiPreferenceSchema = z.enum(UI_PREFERENCES);

export const PatchUiPreferenceSchema = z
  .object({
    workspaceId: z.string().uuid().optional().nullable(),
    uiPreference: UiPreferenceSchema,
  })
  .strict();

export type PatchUiPreferenceInput = z.infer<typeof PatchUiPreferenceSchema>;

export type UiPreferenceDTO = {
  workspaceId: string;
  uiPreference: UiPreferenceMode;
  updatedAt: string;
  cache: {
    kvSynced: boolean;
    kvConfigured: boolean;
  };
};

export function normalizeUiPreference(raw: unknown): UiPreferenceMode {
  if (raw === "USER" || raw === "DEVELOPER") return raw;
  return DEFAULT_UI_PREFERENCE;
}
