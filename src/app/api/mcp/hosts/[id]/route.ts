import { NextResponse } from "next/server";
import {
  UpdateMcpHostSchema,
  encryptHostAuthToken,
  toPrismaTransport,
  validateMcpHostUrl,
} from "@/lib/mcp/hostSchemas";
import {
  mcpJsonError,
  requireVerifiedAgentGate,
  toPublicMcpHost,
  type McpHostPublic,
} from "@/lib/mcp/http";
import type { McpErrorResponse } from "@/lib/mcp/types";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HostResponse = { success: true; host: McpHostPublic };

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/mcp/hosts/[id] */
export async function GET(
  request: Request,
  context: RouteContext
): Promise<NextResponse<HostResponse | McpErrorResponse>> {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!id) {
    return mcpJsonError("Missing host id.", "MCP_HOST_ID_REQUIRED", 400);
  }

  try {
    const row = await getPrisma().mcpHost.findUnique({ where: { id } });
    if (!row) {
      return mcpJsonError("MCP host not found.", "MCP_HOST_NOT_FOUND", 404);
    }
    return NextResponse.json({ success: true, host: toPublicMcpHost(row) });
  } catch (err) {
    console.error("[api/mcp/hosts/:id] get failed:", err);
    return mcpJsonError("Unable to load MCP host.", "MCP_GET_FAILED", 503);
  }
}

/** PATCH /api/mcp/hosts/[id] — edit host metadata / rotate auth token. */
export async function PATCH(
  request: Request,
  context: RouteContext
): Promise<NextResponse<HostResponse | McpErrorResponse>> {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!id) {
    return mcpJsonError("Missing host id.", "MCP_HOST_ID_REQUIRED", 400);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return mcpJsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = UpdateMcpHostSchema.safeParse(raw);
  if (!parsed.success) {
    return mcpJsonError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  if (body.url) {
    try {
      validateMcpHostUrl(body.url);
    } catch (err) {
      return mcpJsonError(
        err instanceof Error ? err.message : "Invalid MCP URL.",
        "MCP_URL_BLOCKED",
        400
      );
    }
  }

  const data: Prisma.McpHostUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.url !== undefined) data.url = body.url;
  if (body.transport !== undefined) {
    data.transport = toPrismaTransport(body.transport);
  }
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.orgId !== undefined) {
    data.organization =
      body.orgId === null
        ? { disconnect: true }
        : { connect: { id: body.orgId } };
  }
  if (body.ownerId !== undefined) {
    data.owner =
      body.ownerId === null
        ? { disconnect: true }
        : { connect: { id: body.ownerId } };
  }
  if (body.authToken !== undefined) {
    data.authTokenCipher = encryptHostAuthToken(body.authToken) ?? null;
  }

  try {
    const updated = await getPrisma().mcpHost.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, host: toPublicMcpHost(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("Record to update not found")) {
      return mcpJsonError("MCP host not found.", "MCP_HOST_NOT_FOUND", 404);
    }
    console.error("[api/mcp/hosts/:id] patch failed:", err);
    return mcpJsonError("Unable to update MCP host.", "MCP_UPDATE_FAILED", 503);
  }
}
