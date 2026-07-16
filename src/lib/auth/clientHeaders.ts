/**
 * Build identity headers for API routes from the client-side auth store.
 * Matches `resolveRequestUser` (x-user-id / x-user-email) and optional org scope.
 */
import { getActiveOrgId } from "@/lib/org/activeOrg";
import { getActiveWorkspaceKey } from "@/lib/org/workspacePresets";

export function getClientAuthHeaders(
  customHeaders?: Record<string, string>
): Record<string, string> {
  if (typeof window === "undefined") {
    return { ...(customHeaders ?? {}) };
  }

  try {
    const raw = window.localStorage.getItem("scalesystems.auth.user");
    const headers: Record<string, string> = { ...(customHeaders ?? {}) };

    if (raw) {
      const user = JSON.parse(raw) as {
        id?: string;
        email?: string;
      };
      if (user.id) headers["x-user-id"] = user.id;
      if (user.email) headers["x-user-email"] = user.email;
    }

    const orgId = getActiveOrgId();
    if (orgId) headers["x-org-id"] = orgId;

    headers["x-workspace-key"] = getActiveWorkspaceKey();

    return headers;
  } catch {
    return { ...(customHeaders ?? {}) };
  }
}
