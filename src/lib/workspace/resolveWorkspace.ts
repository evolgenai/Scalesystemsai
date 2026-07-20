import { randomBytes } from "node:crypto";
import {
  resolveWorkspaceGate,
  WorkspaceBoundaryError,
} from "@/lib/auth/workspaceGate";

export { WorkspaceBoundaryError };

export function generateWorkspaceApiKey(): string {
  return `ws_${randomBytes(24).toString("hex")}`;
}

/**
 * Resolve workspace from x-workspace-key / x-workspace-id / body.workspaceId.
 * Throws WorkspaceBoundaryError on cross-tenant claim conflicts or invalid keys.
 */
export async function resolveWorkspaceId(
  request: Request,
  bodyWorkspaceId?: string | null
): Promise<string | null> {
  const result = await resolveWorkspaceGate(request, bodyWorkspaceId, {
    requireWorkspace: false,
    requireApiKey: false,
  });

  if (result.ok) return result.workspaceId;

  // Soft-resolve preserves null for missing/invalid key; hard-fail cross-tenant claims.
  if (
    result.code === "WORKSPACE_CROSS_TENANT" ||
    result.code === "WORKSPACE_RESOURCE_FORBIDDEN"
  ) {
    throw new WorkspaceBoundaryError(result);
  }

  return null;
}
