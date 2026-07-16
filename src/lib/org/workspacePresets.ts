"use client";

/**
 * Demo / tenancy workspace presets — scoped via x-workspace-key on API fetches.
 * Real org IDs from /api/orgs still use x-org-id via getActiveOrgId().
 */

export type WorkspacePreset = {
  key: string;
  name: string;
  blurb: string;
};

export const WORKSPACE_PRESETS: readonly WorkspacePreset[] = [
  {
    key: "personal",
    name: "Personal Sandbox",
    blurb: "Isolated agent lab",
  },
  {
    key: "meerendal",
    name: "Meerendal Estate",
    blurb: "Estate operations tenancy",
  },
  {
    key: "production",
    name: "Production Gateway",
    blurb: "Live edge gateway",
  },
] as const;

const WORKSPACE_KEY = "scalesystems.workspace.key";

export function getActiveWorkspaceKey(): string {
  if (typeof window === "undefined") return "personal";
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY)?.trim();
    if (raw && WORKSPACE_PRESETS.some((p) => p.key === raw)) return raw;
    return "personal";
  } catch {
    return "personal";
  }
}

export function setActiveWorkspaceKey(key: string): void {
  if (typeof window === "undefined") return;
  const next = WORKSPACE_PRESETS.some((p) => p.key === key) ? key : "personal";
  try {
    window.localStorage.setItem(WORKSPACE_KEY, next);
    window.dispatchEvent(
      new CustomEvent("scalesystems:workspace-changed", {
        detail: { workspaceKey: next },
      })
    );
  } catch {
    /* ignore */
  }
}

export function getWorkspacePreset(key: string): WorkspacePreset {
  return (
    WORKSPACE_PRESETS.find((p) => p.key === key) ?? WORKSPACE_PRESETS[0]!
  );
}
