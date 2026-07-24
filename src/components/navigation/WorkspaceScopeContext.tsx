"use client";

/**
 * Global workspace scope — syncs workspaceId for spatial / memory / telemetry queries.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getActiveOrgId, setActiveOrgId } from "@/lib/org/activeOrg";
import {
  WORKSPACE_PRESETS,
  getActiveWorkspaceKey,
  setActiveWorkspaceKey,
  type WorkspacePreset,
} from "@/lib/org/workspacePresets";

const WORKSPACE_ID_KEY = "scalesystems.workspace.id";

export type WorkspaceScopeValue = {
  /** Stable id used on API queries (org id or `ws_<preset>`). */
  workspaceId: string;
  workspaceKey: string;
  orgId: string | null;
  preset: WorkspacePreset;
  label: string;
  setPreset: (key: string) => void;
  setOrg: (orgId: string | null, label?: string) => void;
};

const WorkspaceScopeContext = createContext<WorkspaceScopeValue | null>(null);

export function resolveWorkspaceIdFromStorage(): string {
  if (typeof window === "undefined") return "ws_personal";
  try {
    const org = getActiveOrgId();
    if (org) return org;
    const stored = window.localStorage.getItem(WORKSPACE_ID_KEY)?.trim();
    if (stored) return stored;
    const key = getActiveWorkspaceKey();
    return `ws_${key}`;
  } catch {
    return "ws_personal";
  }
}

function persistWorkspaceId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_ID_KEY, id);
    window.dispatchEvent(
      new CustomEvent("scalesystems:workspace-id-changed", {
        detail: { workspaceId: id },
      })
    );
  } catch {
    /* ignore */
  }
}

export function WorkspaceScopeProvider({ children }: { children: ReactNode }) {
  const [workspaceKey, setWorkspaceKey] = useState("personal");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLabel, setOrgLabel] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState("ws_personal");

  useEffect(() => {
    setWorkspaceKey(getActiveWorkspaceKey());
    setOrgId(getActiveOrgId());
    setWorkspaceId(resolveWorkspaceIdFromStorage());

    const sync = () => {
      setWorkspaceKey(getActiveWorkspaceKey());
      setOrgId(getActiveOrgId());
      setWorkspaceId(resolveWorkspaceIdFromStorage());
    };
    window.addEventListener("scalesystems:org-changed", sync);
    window.addEventListener("scalesystems:workspace-changed", sync);
    window.addEventListener("scalesystems:workspace-id-changed", sync);
    return () => {
      window.removeEventListener("scalesystems:org-changed", sync);
      window.removeEventListener("scalesystems:workspace-changed", sync);
      window.removeEventListener("scalesystems:workspace-id-changed", sync);
    };
  }, []);

  const setPreset = useCallback((key: string) => {
    setActiveWorkspaceKey(key);
    setActiveOrgId(null);
    setOrgLabel(null);
    const id = `ws_${key}`;
    persistWorkspaceId(id);
    setWorkspaceKey(key);
    setOrgId(null);
    setWorkspaceId(id);
  }, []);

  const setOrg = useCallback((nextOrgId: string | null, label?: string) => {
    setActiveOrgId(nextOrgId);
    if (nextOrgId) {
      persistWorkspaceId(nextOrgId);
      setOrgId(nextOrgId);
      setOrgLabel(label ?? null);
      setWorkspaceId(nextOrgId);
    } else {
      const key = getActiveWorkspaceKey();
      const id = `ws_${key}`;
      persistWorkspaceId(id);
      setOrgId(null);
      setOrgLabel(null);
      setWorkspaceId(id);
    }
  }, []);

  const preset =
    WORKSPACE_PRESETS.find((p) => p.key === workspaceKey) ??
    WORKSPACE_PRESETS[0]!;

  const value = useMemo<WorkspaceScopeValue>(
    () => ({
      workspaceId,
      workspaceKey,
      orgId,
      preset,
      label: orgId ? (orgLabel ?? "Organization") : preset.name,
      setPreset,
      setOrg,
    }),
    [
      workspaceId,
      workspaceKey,
      orgId,
      orgLabel,
      preset,
      setPreset,
      setOrg,
    ]
  );

  return (
    <WorkspaceScopeContext.Provider value={value}>
      {children}
    </WorkspaceScopeContext.Provider>
  );
}

export function useWorkspaceScope(): WorkspaceScopeValue {
  const ctx = useContext(WorkspaceScopeContext);
  if (!ctx) {
    return {
      workspaceId: "ws_personal",
      workspaceKey: "personal",
      orgId: null,
      preset: WORKSPACE_PRESETS[0]!,
      label: WORKSPACE_PRESETS[0]!.name,
      setPreset: () => {},
      setOrg: () => {},
    };
  }
  return ctx;
}
