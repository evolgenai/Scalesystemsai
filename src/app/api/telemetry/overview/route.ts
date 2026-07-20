import { NextResponse } from "next/server";
import { getWorkspaceFlowOverview } from "@/lib/telemetry/flowOverview";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorBody = { success: false; error: string; code: string };

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
  });
}

/**
 * GET /api/telemetry/overview
 * Platform-wide (workspace-scoped) flow stats for the 3D Isometric Flow Map.
 */
export async function GET(request: Request) {
  try {
    const workspaceId = await resolveWorkspaceId(request, null);
    const overview = await getWorkspaceFlowOverview(workspaceId);

    return NextResponse.json({
      success: true,
      overview,
    });
  } catch (err) {
    console.error("[telemetry/overview] failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Overview aggregation failed.",
      "TELEMETRY_OVERVIEW_FAILED",
      503
    );
  }
}
