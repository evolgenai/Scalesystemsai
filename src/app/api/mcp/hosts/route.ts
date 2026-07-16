import { NextResponse } from "next/server";
import {
  CreateMcpHostSchema,
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateResponse = { success: true; host: McpHostPublic };
type ListResponse = { success: true; count: number; hosts: McpHostPublic[] };

/** GET /api/mcp/hosts — list registered MCP hosts. */
export async function GET(
  request: Request
): Promise<NextResponse<ListResponse | McpErrorResponse>> {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  try {
    const rows = await getPrisma().mcpHost.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      success: true,
      count: rows.length,
      hosts: rows.map(toPublicMcpHost),
    });
  } catch (err) {
    console.error("[api/mcp/hosts] list failed:", err);
    return mcpJsonError("Unable to list MCP hosts.", "MCP_LIST_FAILED", 503);
  }
}

/** POST /api/mcp/hosts — register a new MCP host (auth token encrypted at rest). */
export async function POST(
  request: Request
): Promise<NextResponse<CreateResponse | McpErrorResponse>> {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return mcpJsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = CreateMcpHostSchema.safeParse(raw);
  if (!parsed.success) {
    return mcpJsonError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  try {
    validateMcpHostUrl(body.url);
  } catch (err) {
    return mcpJsonError(
      err instanceof Error ? err.message : "Invalid MCP URL.",
      "MCP_URL_BLOCKED",
      400
    );
  }

  try {
    const created = await getPrisma().mcpHost.create({
      data: {
        name: body.name,
        url: body.url,
        transport: toPrismaTransport(body.transport),
        authTokenCipher: encryptHostAuthToken(body.authToken) ?? null,
        isActive: body.isActive,
        orgId: body.orgId ?? null,
        ownerId: body.ownerId ?? null,
      },
    });

    return NextResponse.json(
      { success: true, host: toPublicMcpHost(created) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api/mcp/hosts] create failed:", err);
    return mcpJsonError(
      "Unable to create MCP host.",
      "MCP_CREATE_FAILED",
      503
    );
  }
}
