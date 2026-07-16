import type { McpErrorResponse } from "@/lib/mcp/types";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";
import { NextResponse } from "next/server";

export function mcpJsonError(
  error: string,
  code: string,
  status: number
): NextResponse<McpErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

/**
 * Edge middleware sets `x-agent-auth=verified`.
 * Also re-verifies Bearer / x-agent-token in-process so routes stay secure
 * if request-header mutation is dropped by the runtime.
 */
export async function requireVerifiedAgentGate(
  request: Request
): Promise<NextResponse<McpErrorResponse> | null> {
  const gate = request.headers.get("x-agent-auth")?.trim();
  if (gate === "verified") return null;

  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
    return mcpJsonError(verdict.reason, "AGENT_TOKEN_INVALID", 401);
  }

  return mcpJsonError(
    "Unauthorized. MCP routes require a verified agent token.",
    "MCP_UNAUTHORIZED",
    401
  );
}

export type McpHostPublic = {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  isActive: boolean;
  hasAuth: boolean;
  orgId: string | null;
  ownerId: string | null;
  lastToolListAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPublicMcpHost(row: {
  id: string;
  name: string;
  url: string;
  transport: "HTTP" | "SSE";
  authTokenCipher: string | null;
  isActive: boolean;
  orgId: string | null;
  ownerId: string | null;
  lastToolListAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): McpHostPublic {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: row.transport === "SSE" ? "sse" : "http",
    isActive: row.isActive,
    hasAuth: Boolean(row.authTokenCipher),
    orgId: row.orgId,
    ownerId: row.ownerId,
    lastToolListAt: row.lastToolListAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
