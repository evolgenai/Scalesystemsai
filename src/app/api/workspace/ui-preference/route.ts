import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateDenied,
} from "@/lib/auth/workspaceGate";
import { apiFail, apiOk } from "@/lib/http/apiEnvelope";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  getWorkspaceUiPreference,
  patchWorkspaceUiPreference,
} from "@/lib/workspace/uiPreferenceStore";
import { PatchUiPreferenceSchema } from "@/lib/workspace/uiPreferenceTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gateFail(denied: WorkspaceGateDenied) {
  return apiFail(denied.message, denied.code, denied.status, {
    "x-workspace-bound": "denied",
  });
}

/**
 * GET /api/workspace/ui-preference
 * Load tenant navigation mode (USER | DEVELOPER). Requires x-workspace-key.
 * Warms Edge KV so middleware can hand off viewport mode without Postgres.
 */
export async function GET(request: Request) {
  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) return gateFail(gate);

  try {
    const preference = await getWorkspaceUiPreference(gate.workspaceId);
    return apiOk(
      {
        authMode: gate.authMode,
        preference,
      },
      {
        headers: {
          "x-workspace-bound": gate.workspaceId,
          "x-scale-ui-preference": preference.uiPreference,
          "x-scale-ui-pref-kv": preference.cache.kvSynced ? "1" : "0",
        },
      }
    );
  } catch (err) {
    console.error("[workspace/ui-preference] GET failed:", err);
    return apiFail(
      err instanceof Error
        ? err.message
        : "Failed to load workspace UI preference.",
      "WORKSPACE_UI_PREFERENCE_GET_FAILED",
      503
    );
  }
}

/**
 * PATCH /api/workspace/ui-preference
 * Persist navigation mode, then sync into Edge KV for instant edge layouts.
 */
export async function PATCH(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiFail("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PatchUiPreferenceSchema.safeParse(raw);
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body.",
      "INVALID_BODY",
      400
    );
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    parsed.data.workspaceId ?? null
  );
  if (!gate.ok) return gateFail(gate);

  try {
    const preference = await patchWorkspaceUiPreference({
      workspaceId: gate.workspaceId,
      uiPreference: parsed.data.uiPreference,
    });

    return apiOk(
      {
        authMode: gate.authMode,
        preference,
      },
      {
        headers: {
          "x-workspace-bound": gate.workspaceId,
          "x-scale-ui-preference": preference.uiPreference,
          "x-scale-ui-pref-kv": preference.cache.kvSynced ? "1" : "0",
        },
      }
    );
  } catch (err) {
    console.error("[workspace/ui-preference] PATCH failed:", err);
    return apiFail(
      err instanceof Error
        ? err.message
        : "Failed to update workspace UI preference.",
      "WORKSPACE_UI_PREFERENCE_PATCH_FAILED",
      503
    );
  }
}
