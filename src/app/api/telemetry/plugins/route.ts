import { NextResponse } from "next/server";
import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateDenied,
} from "@/lib/auth/workspaceGate";
import { aggregateWorkspacePluginTelemetry } from "@/lib/telemetry/pluginAggregator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorBody = { success: false; error: string; code: string };

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function gateError(denied: WorkspaceGateDenied) {
  return jsonError(denied.message, denied.code, denied.status);
}

/**
 * GET /api/telemetry/plugins
 * Marketplace telemetry for the authenticated workspace's active plugins.
 * Requires x-workspace-key; blocks cross-tenant claimed workspaceId mismatch.
 */
export async function GET(request: Request) {
  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) return gateError(gate);

  try {
    const telemetry = await aggregateWorkspacePluginTelemetry(gate.workspaceId);

    return NextResponse.json(
      {
        success: true,
        authMode: gate.authMode,
        telemetry,
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-workspace-bound": gate.workspaceId,
        },
      }
    );
  } catch (err) {
    console.error("[telemetry/plugins] aggregate failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Plugin telemetry aggregation failed.",
      "TELEMETRY_PLUGINS_FAILED",
      503
    );
  }
}
