/**
 * Active workspace registry — multi-tenant switch/list for /api/workspaces.
 * Process-local session binding; Prisma workspaces when available.
 */

import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { createTraceId } from "@/lib/sentry/telemetry";

export const WorkspaceSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "idle", "archived"]).default("active"),
  memberCount: z.number().int().nonnegative().optional(),
  gasBalance: z.number().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  source: z.enum(["prisma", "session", "demo"]),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

type RegistryGlobals = {
  __ssActiveWorkspaceBySession?: Map<string, string>;
  __ssSessionWorkspaces?: Map<string, WorkspaceSummary>;
};

function globals(): RegistryGlobals {
  return globalThis as unknown as RegistryGlobals;
}

function activeMap(): Map<string, string> {
  const g = globals();
  if (!g.__ssActiveWorkspaceBySession) {
    g.__ssActiveWorkspaceBySession = new Map();
  }
  return g.__ssActiveWorkspaceBySession;
}

function sessionWorkspaces(): Map<string, WorkspaceSummary> {
  const g = globals();
  if (!g.__ssSessionWorkspaces) {
    g.__ssSessionWorkspaces = new Map();
  }
  return g.__ssSessionWorkspaces;
}

const DEMO_WORKSPACES: WorkspaceSummary[] = [
  {
    id: "ws_personal_sandbox",
    name: "Personal Sandbox",
    status: "active",
    source: "demo",
    createdAt: new Date(0).toISOString(),
  },
  {
    id: "ws_meerendal",
    name: "Meerendal Estate",
    status: "idle",
    source: "demo",
    createdAt: new Date(0).toISOString(),
  },
  {
    id: "ws_production_gateway",
    name: "Production Gateway",
    status: "active",
    source: "demo",
    createdAt: new Date(0).toISOString(),
  },
];

export function resolveSessionKey(input?: {
  sessionId?: string | null;
  userId?: string | null;
}): string {
  const session = input?.sessionId?.trim();
  const user = input?.userId?.trim();
  if (session && user) return `${user}::${session}`;
  if (session) return `session::${session}`;
  if (user) return `user::${user}`;
  return "anonymous";
}

export function getActiveWorkspaceId(sessionKey: string): string | null {
  return activeMap().get(sessionKey) ?? null;
}

export function setActiveWorkspaceId(
  sessionKey: string,
  workspaceId: string
): string {
  const id = workspaceId.trim().slice(0, 128);
  activeMap().set(sessionKey, id);
  return id;
}

export function registerSessionWorkspace(
  workspace: Omit<WorkspaceSummary, "source"> & { source?: WorkspaceSummary["source"] }
): WorkspaceSummary {
  const row: WorkspaceSummary = {
    ...workspace,
    source: workspace.source ?? "session",
  };
  sessionWorkspaces().set(row.id, row);
  return row;
}

/**
 * List workspaces visible to the caller (Prisma + session + demo fallbacks).
 */
export async function listWorkspaces(options?: {
  includeDemo?: boolean;
}): Promise<WorkspaceSummary[]> {
  const includeDemo = options?.includeDemo !== false;
  const byId = new Map<string, WorkspaceSummary>();

  for (const w of sessionWorkspaces().values()) {
    byId.set(w.id, w);
  }

  try {
    const rows = await getPrisma().workspace.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        gasBalance: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memberships: true } },
      },
      take: 100,
    });
    for (const row of rows) {
      byId.set(row.id, {
        id: row.id,
        name: row.name,
        status: "active",
        memberCount: row._count.memberships,
        gasBalance: row.gasBalance,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        source: "prisma",
      });
    }
  } catch {
    // Prisma may be unavailable in local/dev — fall through.
  }

  if (includeDemo && byId.size === 0) {
    for (const d of DEMO_WORKSPACES) byId.set(d.id, d);
  } else if (includeDemo) {
    for (const d of DEMO_WORKSPACES) {
      if (!byId.has(d.id)) byId.set(d.id, d);
    }
  }

  return [...byId.values()].sort((a, b) =>
    (b.updatedAt ?? b.createdAt ?? "").localeCompare(
      a.updatedAt ?? a.createdAt ?? ""
    )
  );
}

export const SwitchWorkspaceSchema = z.object({
  action: z.literal("switch").optional(),
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
});
export type SwitchWorkspaceInput = z.infer<typeof SwitchWorkspaceSchema>;

export async function switchActiveWorkspace(
  input: SwitchWorkspaceInput
): Promise<{
  activeWorkspaceId: string;
  workspace: WorkspaceSummary | null;
  sessionKey: string;
}> {
  const sessionKey = resolveSessionKey(input);
  const workspaces = await listWorkspaces({ includeDemo: true });
  let workspace =
    workspaces.find((w) => w.id === input.workspaceId) ?? null;

  if (!workspace) {
    workspace = registerSessionWorkspace({
      id: input.workspaceId,
      name: `Workspace ${input.workspaceId.slice(0, 12)}`,
      status: "active",
      source: "session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const activeWorkspaceId = setActiveWorkspaceId(sessionKey, workspace.id);
  return { activeWorkspaceId, workspace, sessionKey };
}

export function createEphemeralWorkspace(name: string): WorkspaceSummary {
  const id = `ws_${createTraceId().replace(/-/g, "").slice(0, 16)}`;
  return registerSessionWorkspace({
    id,
    name: name.trim().slice(0, 120) || "Untitled Workspace",
    status: "active",
    source: "session",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
