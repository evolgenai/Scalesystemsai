import { NextResponse } from "next/server";
import { connectAndListMcpTools } from "@/lib/mcp/createClient";
import {
  mcpJsonError,
  requireVerifiedAgentGate,
  toPublicMcpHost,
  type McpHostPublic,
} from "@/lib/mcp/http";
import type { McpErrorResponse, McpListToolsResponse } from "@/lib/mcp/types";
import { decryptSecret, isEncryptedSecret } from "@/lib/security/crypto";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ConnectBodySchema = z.object({
  url: z.string().url().optional(),
  transport: z.enum(["http", "sse"]).optional(),
  authToken: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  hostId: z.string().cuid().optional(),
});

type ListHostsResponse = {
  success: true;
  protocol: string;
  count: number;
  hosts: McpHostPublic[];
};

/**
 * GET /api/mcp — list registered MCP host endpoints (no secrets).
 */
export async function GET(
  request: Request
): Promise<NextResponse<ListHostsResponse | McpErrorResponse>> {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  try {
    const rows = await getPrisma().mcpHost.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        transport: true,
        authTokenCipher: true,
        isActive: true,
        orgId: true,
        ownerId: true,
        lastToolListAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      protocol: "mcp-streamable-http|sse",
      count: rows.length,
      hosts: rows.map(toPublicMcpHost),
    });
  } catch (err) {
    console.error("[api/mcp] list hosts failed:", err);
    return mcpJsonError(
      "Unable to list MCP hosts.",
      "MCP_LIST_FAILED",
      503
    );
  }
}

/**
 * POST /api/mcp — connect to a remote MCP host and return discovered tools.
 * Body: { url, transport?, authToken?, headers? } | { hostId }
 */
export async function POST(
  request: Request
): Promise<NextResponse<McpListToolsResponse | McpErrorResponse>> {
  const denied = await requireVerifiedAgentGate(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return mcpJsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = ConnectBodySchema.safeParse(raw);
  if (!parsed.success) {
    return mcpJsonError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  let url = body.url?.trim();
  let transport = body.transport ?? "http";
  let authToken = body.authToken?.trim();
  const headers = body.headers;

  if (body.hostId) {
    try {
      const host = await getPrisma().mcpHost.findFirst({
        where: { id: body.hostId, isActive: true },
        select: {
          url: true,
          transport: true,
          authTokenCipher: true,
        },
      });
      if (!host) {
        return mcpJsonError(
          "MCP host not found or inactive.",
          "MCP_HOST_NOT_FOUND",
          404
        );
      }
      url = host.url;
      transport = host.transport === "SSE" ? "sse" : "http";
      if (host.authTokenCipher && isEncryptedSecret(host.authTokenCipher)) {
        authToken = decryptSecret(host.authTokenCipher);
      } else if (host.authTokenCipher) {
        authToken = host.authTokenCipher;
      }
    } catch (err) {
      console.error("[api/mcp] host lookup failed:", err);
      return mcpJsonError(
        "Unable to resolve MCP host from vault.",
        "MCP_HOST_LOOKUP_FAILED",
        503
      );
    }
  }

  if (!url) {
    return mcpJsonError(
      "Provide url or hostId to connect to an MCP host.",
      "MCP_TARGET_REQUIRED",
      400
    );
  }

  try {
    const result = await connectAndListMcpTools({
      url,
      transport,
      authToken,
      headers,
    });

    if (body.hostId) {
      void getPrisma()
        .mcpHost.update({
          where: { id: body.hostId },
          data: { lastToolListAt: new Date() },
        })
        .catch(() => undefined);
    }

    return NextResponse.json(
      {
        success: true,
        transport: result.transport,
        url: result.url,
        toolCount: result.tools.length,
        tools: result.tools,
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "MCP connection failed.";
    console.error("[api/mcp] connect/list failed:", message);
    return mcpJsonError(message, "MCP_CONNECT_FAILED", 502);
  }
}
