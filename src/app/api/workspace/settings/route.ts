import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateDenied,
} from "@/lib/auth/workspaceGate";
import { apiFail, apiOk } from "@/lib/http/apiEnvelope";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  getOrCreateWorkspaceSettings,
  patchWorkspaceSettings,
} from "@/lib/workspace/settingsStore";
import { PatchWorkspaceSettingsSchema } from "@/lib/workspace/settingsTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gateFail(denied: WorkspaceGateDenied) {
  return apiFail(denied.message, denied.code, denied.status, {
    "x-workspace-bound": "denied",
  });
}

/**
 * GET /api/workspace/settings
 * Load tenant config arrays + feature flags. Requires x-workspace-key.
 * Warms Edge KV so middleware can read flags without Postgres.
 */
export async function GET(request: Request) {
  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) return gateFail(gate);

  try {
    const settings = await getOrCreateWorkspaceSettings(gate.workspaceId);
    return apiOk(
      {
        authMode: gate.authMode,
        settings,
      },
      {
        headers: {
          "x-workspace-bound": gate.workspaceId,
          "x-scale-flags-kv": settings.cache.kvSynced ? "1" : "0",
        },
      }
    );
  } catch (err) {
    console.error("[workspace/settings] GET failed:", err);
    return apiFail(
      err instanceof Error ? err.message : "Failed to load workspace settings.",
      "WORKSPACE_SETTINGS_GET_FAILED",
      503
    );
  }
}

/**
 * PATCH /api/workspace/settings
 * Persist config / feature flags, then sync active flags into Edge KV.
 */
export async function PATCH(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiFail("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PatchWorkspaceSettingsSchema.safeParse(raw);
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
    const settings = await patchWorkspaceSettings({
      workspaceId: gate.workspaceId,
      config: parsed.data.config,
      featureFlags: parsed.data.featureFlags,
      replaceFlags: parsed.data.replaceFlags === true,
    });

    return apiOk(
      {
        authMode: gate.authMode,
        settings,
      },
      {
        headers: {
          "x-workspace-bound": gate.workspaceId,
          "x-scale-flags-kv": settings.cache.kvSynced ? "1" : "0",
        },
      }
    );
  } catch (err) {
    console.error("[workspace/settings] PATCH failed:", err);
    return apiFail(
      err instanceof Error
        ? err.message
        : "Failed to update workspace settings.",
      "WORKSPACE_SETTINGS_PATCH_FAILED",
      503
    );
  }
}
