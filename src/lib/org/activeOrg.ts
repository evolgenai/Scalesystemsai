const ACTIVE_ORG_KEY = "active_org_id";
const LEGACY_ORG_KEY = "scalesystems.activeOrgId";

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(ACTIVE_ORG_KEY) ??
      window.localStorage.getItem(LEGACY_ORG_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function setActiveOrgId(orgId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (orgId) {
      window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    } else {
      window.localStorage.removeItem(ACTIVE_ORG_KEY);
    }
    window.localStorage.removeItem(LEGACY_ORG_KEY);
    window.dispatchEvent(
      new CustomEvent("scalesystems:org-changed", { detail: { orgId } })
    );
  } catch {
    // Private mode — ignore.
  }
}
