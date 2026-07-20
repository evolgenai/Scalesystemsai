/**
 * Multi-tenant workspace boundary gate.
 * Prevents cross-tenant resource reads/writes when API key and claimed IDs diverge.
 */

import { getPrisma } from "@/lib/prisma";

export type WorkspaceAuthMode = "api_key" | "workspace_id" | "bound";

export type WorkspaceGateOk = {
  ok: true;
  workspaceId: string;
  authMode: WorkspaceAuthMode;
  apiKeyPresent: boolean;
};

export type WorkspaceGateDenied = {
  ok: false;
  code:
    | "WORKSPACE_REQUIRED"
    | "WORKSPACE_NOT_FOUND"
    | "WORKSPACE_KEY_INVALID"
    | "WORKSPACE_CROSS_TENANT"
    | "WORKSPACE_RESOURCE_FORBIDDEN";
  message: string;
  status: 400 | 401 | 403 | 404;
};

export type WorkspaceGateResult = WorkspaceGateOk | WorkspaceGateDenied;

export type WorkspaceGateOptions = {
  /** Reject when neither key nor claimed id is present. Default true for secure reads. */
  requireWorkspace?: boolean;
  /** Require a valid x-workspace-key (blocks id-only access). */
  requireApiKey?: boolean;
};

export class WorkspaceBoundaryError extends Error {
  readonly code: WorkspaceGateDenied["code"];
  readonly status: WorkspaceGateDenied["status"];

  constructor(denied: WorkspaceGateDenied) {
    super(denied.message);
    this.name = "WorkspaceBoundaryError";
    this.code = denied.code;
    this.status = denied.status;
  }
}

function extractWorkspaceApiKey(request: Request): string | null {
  const key =
    request.headers.get("x-workspace-key")?.trim() ||
    request.headers.get("x-workspace-api-key")?.trim() ||
    "";
  return key || null;
}

function collectClaimedIds(
  request: Request,
  bodyWorkspaceId?: string | null
): string[] {
  const ids = new Set<string>();
  const headerId = request.headers.get("x-workspace-id")?.trim();
  if (headerId) ids.add(headerId);
  const bodyId = bodyWorkspaceId?.trim();
  if (bodyId) ids.add(bodyId);

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("workspaceId")?.trim();
    if (q) ids.add(q);
  } catch {
    /* ignore malformed URL */
  }

  return [...ids];
}

function denied(
  code: WorkspaceGateDenied["code"],
  message: string,
  status: WorkspaceGateDenied["status"]
): WorkspaceGateDenied {
  return { ok: false, code, message, status };
}

/**
 * Resolve and validate the active workspace for an edge/API request.
 * API key is authoritative; any conflicting claimed id is treated as cross-tenant.
 */
export async function resolveWorkspaceGate(
  request: Request,
  bodyWorkspaceId?: string | null,
  options?: WorkspaceGateOptions
): Promise<WorkspaceGateResult> {
  const requireWorkspace = options?.requireWorkspace !== false;
  const requireApiKey = options?.requireApiKey === true;
  const prisma = getPrisma();

  const apiKey = extractWorkspaceApiKey(request);
  const claimedIds = collectClaimedIds(request, bodyWorkspaceId);

  if (apiKey) {
    const keyed = await prisma.workspace.findUnique({
      where: { apiKey },
      select: { id: true },
    });

    if (!keyed) {
      return denied(
        "WORKSPACE_KEY_INVALID",
        "Workspace API key is invalid.",
        401
      );
    }

    for (const claimed of claimedIds) {
      if (claimed !== keyed.id) {
        return denied(
          "WORKSPACE_CROSS_TENANT",
          "Claimed workspaceId does not match the authenticated workspace key.",
          403
        );
      }
    }

    return {
      ok: true,
      workspaceId: keyed.id,
      authMode: claimedIds.length > 0 ? "bound" : "api_key",
      apiKeyPresent: true,
    };
  }

  if (requireApiKey) {
    return denied(
      "WORKSPACE_REQUIRED",
      "x-workspace-key is required for this tenant-scoped endpoint.",
      401
    );
  }

  if (claimedIds.length > 1) {
    const unique = new Set(claimedIds);
    if (unique.size > 1) {
      return denied(
        "WORKSPACE_CROSS_TENANT",
        "Conflicting workspace identifiers in request context.",
        403
      );
    }
  }

  const claimed = claimedIds[0] ?? null;
  if (!claimed) {
    if (requireWorkspace) {
      return denied(
        "WORKSPACE_REQUIRED",
        "workspaceId or x-workspace-key required.",
        400
      );
    }
    return denied(
      "WORKSPACE_REQUIRED",
      "No workspace context provided.",
      400
    );
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: claimed },
    select: { id: true },
  });

  if (!ws) {
    return denied("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
  }

  return {
    ok: true,
    workspaceId: ws.id,
    authMode: "workspace_id",
    apiKeyPresent: false,
  };
}

/**
 * Strict gate for high-frequency telemetry — requires API key, blocks id-only reads.
 */
export async function requireWorkspaceApiKeyGate(
  request: Request,
  bodyWorkspaceId?: string | null
): Promise<WorkspaceGateResult> {
  return resolveWorkspaceGate(request, bodyWorkspaceId, {
    requireWorkspace: true,
    requireApiKey: true,
  });
}

/**
 * Assert a loaded resource belongs to the authenticated workspace.
 * Null resource workspace is treated as unbound and forbidden for tenant reads.
 */
export function assertResourceWorkspace(
  gate: WorkspaceGateOk,
  resourceWorkspaceId: string | null | undefined
): WorkspaceGateResult {
  if (!resourceWorkspaceId || resourceWorkspaceId !== gate.workspaceId) {
    return denied(
      "WORKSPACE_RESOURCE_FORBIDDEN",
      "Resource is outside the authenticated workspace boundary.",
      403
    );
  }
  return gate;
}

/**
 * Filter helper — keep only rows whose workspaceId matches the gate.
 */
export function filterTenantRows<T extends { workspaceId?: string | null }>(
  gate: WorkspaceGateOk,
  rows: T[]
): T[] {
  return rows.filter((row) => row.workspaceId === gate.workspaceId);
}

export function throwIfDenied(result: WorkspaceGateResult): WorkspaceGateOk {
  if (!result.ok) throw new WorkspaceBoundaryError(result);
  return result;
}
