/**
 * Build identity headers for API routes from the client-side auth store.
 * Matches `resolveRequestUser` (x-user-id / x-user-email).
 */
export function getClientAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem("scalesystems.auth.user");
    if (!raw) return {};
    const user = JSON.parse(raw) as {
      id?: string;
      email?: string;
    };
    const headers: Record<string, string> = {};
    if (user.id) headers["x-user-id"] = user.id;
    if (user.email) headers["x-user-email"] = user.email;
    return headers;
  } catch {
    return {};
  }
}
