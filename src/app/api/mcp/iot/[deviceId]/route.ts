import { NextResponse } from "next/server";
import { z } from "zod";
import { mcpJsonError, requireVerifiedAgentGate } from "@/lib/mcp/http";
import { upsertIotDevice } from "@/lib/mcp/iotDeviceStore";
import type { McpErrorResponse } from "@/lib/mcp/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PatchBodySchema = z.object({
  endpointUrl: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .refine((v) => /^https?:\/\/.+/i.test(v), {
      message: "endpointUrl must be an http(s) URL",
    }),
  protocol: z.enum(["rest", "shelly", "sonoff"]).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  workspaceKey: z.string().trim().min(1).max(64).optional(),
});

type RouteContext = { params: Promise<{ deviceId: string }> };

/** PATCH /api/mcp/iot/[deviceId] — save physical network endpoint. */
export async function PATCH(
  request: Request,
  context: RouteContext
): Promise<NextResponse<{ success: true; device: unknown } | McpErrorResponse>> {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  const { deviceId } = await context.params;
  if (!deviceId?.trim()) {
    return mcpJsonError("Missing device id.", "IOT_DEVICE_ID_REQUIRED", 400);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return mcpJsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PatchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return mcpJsonError(
      parsed.error.issues[0]?.message ?? "Invalid body.",
      "INVALID_BODY",
      400
    );
  }

  try {
    const device = await upsertIotDevice({
      id: deviceId.trim(),
      endpointUrl: parsed.data.endpointUrl,
      protocol: parsed.data.protocol,
      name: parsed.data.name,
      workspaceKey: parsed.data.workspaceKey ?? "meerendal",
    });
    return NextResponse.json({ success: true, device });
  } catch (err) {
    console.error("[api/mcp/iot/:id] patch failed:", err);
    return mcpJsonError("Unable to save IoT endpoint.", "IOT_PATCH_FAILED", 503);
  }
}
