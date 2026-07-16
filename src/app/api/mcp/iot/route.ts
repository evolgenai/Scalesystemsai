import { NextResponse } from "next/server";
import { mcpJsonError, requireVerifiedAgentGate } from "@/lib/mcp/http";
import { listIotDevices } from "@/lib/mcp/iotDeviceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/mcp/iot?workspaceKey=meerendal */
export async function GET(request: Request) {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  const workspaceKey =
    new URL(request.url).searchParams.get("workspaceKey")?.trim() ||
    "meerendal";

  try {
    const devices = await listIotDevices(workspaceKey);
    return NextResponse.json({ success: true, count: devices.length, devices });
  } catch (err) {
    console.error("[api/mcp/iot] list failed:", err);
    return mcpJsonError("Unable to list IoT devices.", "IOT_LIST_FAILED", 503);
  }
}
