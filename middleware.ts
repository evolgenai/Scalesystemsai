import { NextResponse, type NextRequest } from "next/server";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";

/**
 * Edge gate for agentic surfaces — runs before Node API handlers.
 * Matcher keeps marketing / auth / checkout off the hot path.
 */

const SESSION_COOKIE_HINTS = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "ss_session",
];

function unauthorized(reason: string, code = "AGENT_UNAUTHORIZED") {
  return NextResponse.json(
    { success: false, error: reason, code },
    {
      status: 401,
      headers: {
        "x-agent-gate": "blocked",
        "cache-control": "no-store",
      },
    }
  );
}

function hasSessionHint(request: NextRequest): boolean {
  for (const name of SESSION_COOKIE_HINTS) {
    if (request.cookies.get(name)?.value) return true;
  }
  // Existing soft identity headers used by dashboard → resolveRequestUser
  if (request.headers.get("x-user-id")?.trim()) return true;
  if (request.headers.get("x-user-email")?.trim()) return true;
  return false;
}

function isStrictPath(pathname: string): boolean {
  // MCP + admin fleet + self-healer always require Edge-verified tokens.
  // `/api/agent` keeps body `clientApiKey` auth — do not Edge-block it by default.
  // `/api/telemetry/errors` is intentionally NOT matched (public ingest).
  if (pathname === "/api/mcp" || pathname.startsWith("/api/mcp/")) return true;
  if (pathname.startsWith("/api/v1/admin/")) return true;
  if (pathname === "/api/agents/heal" || pathname.startsWith("/api/agents/heal/")) {
    return true;
  }
  if (pathname === "/api/workspaces" || pathname.startsWith("/api/workspaces/")) {
    return true;
  }
  return process.env.AGENT_MIDDLEWARE_STRICT === "1";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dynamic host routing hint for decentralized Agent Hosts (Sandbox / Firecracker).
  const agentHost = request.headers.get("x-agent-host")?.trim();
  const requestHeaders = new Headers(request.headers);
  if (agentHost) {
    requestHeaders.set("x-scale-agent-host", agentHost);
  }

  const rawToken = extractAgentToken(request);
  const strict = isStrictPath(pathname);

  if (rawToken) {
    const verdict = await verifyAgentEdgeToken(rawToken);
    if (!verdict.ok) {
      return unauthorized(verdict.reason, "AGENT_TOKEN_INVALID");
    }
    requestHeaders.set("x-agent-auth", "verified");
    requestHeaders.set("x-agent-auth-mode", verdict.mode);
    if (verdict.subject) {
      requestHeaders.set("x-agent-subject", verdict.subject.slice(0, 128));
    }

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Dashboard session / soft identity: allow agent workforce routes, not MCP.
  if (!strict && hasSessionHint(request)) {
    requestHeaders.set("x-agent-auth", "session");
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Dev convenience for workforce routes — MCP/admin stay strict.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AGENT_MIDDLEWARE_STRICT !== "1" &&
    !strict
  ) {
    requestHeaders.set("x-agent-auth", "dev-bypass");
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Non-strict production agent routes without token: pass through;
  // handlers retain their own auth (clientApiKey / resolveRequestUser).
  if (!strict) {
    requestHeaders.set("x-agent-auth", "deferred");
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return unauthorized(
    "Unauthorized agent request. Provide Authorization: Bearer <ss_live_…> or x-agent-token.",
    "AGENT_UNAUTHORIZED"
  );
}

export const config = {
  matcher: [
    "/api/mcp",
    "/api/mcp/:path*",
    "/api/agent",
    "/api/agent/:path*",
    "/api/agents/:path*",
    "/api/workspaces",
    "/api/workspaces/:path*",
    "/api/v1/admin/:path*",
  ],
};
