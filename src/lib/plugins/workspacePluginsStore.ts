import { getActiveOrgId } from "@/lib/org/activeOrg";
import type { WorkspacePlugin } from "@/lib/plugins/types";

const STORAGE_PREFIX = "scalesystems.workspace.plugins";
export const PLUGINS_CHANGED_EVENT = "scalesystems:plugins-changed";

function storageKey(orgId: string | null): string {
  return `${STORAGE_PREFIX}:${orgId ?? "local"}`;
}

function isPluginRecord(value: unknown): value is WorkspacePlugin {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.baseUrl === "string" &&
    typeof row.active === "boolean" &&
    typeof row.specText === "string" &&
    row.auth !== null &&
    typeof row.auth === "object"
  );
}

function normalizeList(raw: unknown): WorkspacePlugin[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPluginRecord);
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function listWorkspacePlugins(
  orgId: string | null = getActiveOrgId()
): WorkspacePlugin[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (!raw) return [];
    return normalizeList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function persist(
  plugins: WorkspacePlugin[],
  orgId: string | null
): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(plugins));
    window.dispatchEvent(
      new CustomEvent(PLUGINS_CHANGED_EVENT, {
        detail: { orgId, plugins },
      })
    );
  } catch {
    // Private mode / quota — ignore persistence failure.
  }
}

export function saveWorkspacePlugin(
  plugin: WorkspacePlugin,
  orgId: string | null = getActiveOrgId()
): WorkspacePlugin[] {
  const existing = listWorkspacePlugins(orgId);
  const index = existing.findIndex((row) => row.id === plugin.id);
  const next =
    index >= 0
      ? existing.map((row, i) => (i === index ? plugin : row))
      : [...existing, plugin];
  persist(next, orgId);
  return next;
}

export function setWorkspacePluginActive(
  pluginId: string,
  active: boolean,
  orgId: string | null = getActiveOrgId()
): WorkspacePlugin[] {
  const next = listWorkspacePlugins(orgId).map((row) =>
    row.id === pluginId
      ? { ...row, active, updatedAt: new Date().toISOString() }
      : row
  );
  persist(next, orgId);
  return next;
}

export function deleteWorkspacePlugin(
  pluginId: string,
  orgId: string | null = getActiveOrgId()
): WorkspacePlugin[] {
  const next = listWorkspacePlugins(orgId).filter((row) => row.id !== pluginId);
  persist(next, orgId);
  return next;
}

export function listActiveWorkspacePlugins(
  orgId: string | null = getActiveOrgId()
): WorkspacePlugin[] {
  return listWorkspacePlugins(orgId).filter((plugin) => plugin.active);
}

export function createPluginId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `plugin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
