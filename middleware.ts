import { NextResponse, type NextRequest } from "next/server";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";
import {
  encodeFlagsHeader,
  getWorkspaceFlagsFromKv,
} from "@/lib/workspace/settingsCache";
import { getWorkspaceUiPreferenceFromKv } from "@/lib/workspace/uiPreferenceCache";

/**
 * Edge gate — geo regional routing + quick auth before origin/DB.
 * Runtime: Edge (`experimental-edge` / `edge`).
 * Feature flags: read from Edge KV (`ws:flags:{workspaceId}`) — no Postgres.
 * UI preference: read from Edge KV (`ws:ui-pref:{workspaceId}`) — no Postgres.
 */

const SESSION_COOKIE_HINTS = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "ss_session",
];

/** Country → preferred compute region (Vercel-style codes). */
const REGION_BY_COUNTRY: Record<string, string> = {
  US: "iad1",
  CA: "iad1",
  MX: "iad1",
  GB: "lhr1",
  IE: "lhr1",
  FR: "cdg1",
  DE: "fra1",
  NL: "ams1",
  SE: "arn1",
  PL: "waw1",
  IT: "mxp1",
  ES: "mad1",
  BR: "gru1",
  AR: "gru1",
  IN: "bom1",
  SG: "sin1",
  JP: "hnd1",
  KR: "icn1",
  AU: "syd1",
  NZ: "syd1",
  ZA: "cpt1",
  AE: "dxb1",
};

const DEFAULT_REGION = "iad1";

function resolveRegion(request: NextRequest): {
  country: string;
  region: string;
  city: string;
} {
  const country = (
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    "XX"
  )
    .trim()
    .toUpperCase()
    .slice(0, 2);

  const city = (request.headers.get("x-vercel-ip-city") || "")
    .trim()
    .slice(0, 64);

  const region =
    REGION_BY_COUNTRY[country] ||
    request.headers.get("x-vercel-ip-country-region")?.trim() ||
    DEFAULT_REGION;

  return { country: country || "XX", region, city };
}

function unauthorized(reason: string, code = "AGENT_UNAUTHORIZED") {
  return NextResponse.json(
    { success: false, error: reason, code },
    {
      status: 401,
      headers: {
        "x-agent-gate": "blocked",
        "cache-control": "no-store",
        "x-scale-theme": "#121212",
        "x-scale-accent": "#1DB954",
      },
    }
  );
}

function hasSessionHint(request: NextRequest): boolean {
  for (const name of SESSION_COOKIE_HINTS) {
    if (request.cookies.get(name)?.value) return true;
  }
  if (request.headers.get("x-user-id")?.trim()) return true;
  if (request.headers.get("x-user-email")?.trim()) return true;
  return false;
}

function isStrictPath(pathname: string): boolean {
  if (pathname === "/api/mcp" || pathname.startsWith("/api/mcp/")) return true;
  if (pathname.startsWith("/api/v1/admin/")) return true;
  if (
    pathname === "/api/agents/heal" ||
    pathname.startsWith("/api/agents/heal/")
  ) {
    return true;
  }
  if (
    pathname === "/api/workspaces" ||
    pathname.startsWith("/api/workspaces/")
  ) {
    return true;
  }
  return process.env.AGENT_MIDDLEWARE_STRICT === "1";
}

/** Agent telemetry / stream surfaces that benefit from regional affinity. */
function isTelemetryPath(pathname: string): boolean {
  if (pathname === "/api/agents/stream" || pathname.startsWith("/api/agents/stream/")) {
    return true;
  }
  if (pathname.startsWith("/api/telemetry/")) return true;
  if (pathname === "/api/agents/sandbox/run") return true;
  if (pathname.startsWith("/api/org/") && pathname.includes("telemetry")) {
    return true;
  }
  return false;
}

function applyGeoHeaders(
  headers: Headers,
  geo: ReturnType<typeof resolveRegion>
): void {
  headers.set("x-scale-geo-country", geo.country);
  headers.set("x-scale-preferred-region", geo.region);
  if (geo.city) headers.set("x-scale-geo-city", geo.city);
  headers.set("x-scale-edge-runtime", "1");
}

async function attachWorkspaceEdgeStateFromKv(
  request: NextRequest,
  requestHeaders: Headers,
  responseHeaders: Headers
): Promise<void> {
  const workspaceId =
    request.headers.get("x-workspace-id")?.trim() ||
    request.nextUrl.searchParams.get("workspaceId")?.trim() ||
    "";
  if (!workspaceId) {
    responseHeaders.set("x-scale-flags-source", "none");
    responseHeaders.set("x-scale-ui-pref-source", "none");
    return;
  }

  const [cachedFlags, cachedPref] = await Promise.all([
    getWorkspaceFlagsFromKv(workspaceId),
    getWorkspaceUiPreferenceFromKv(workspaceId),
  ]);

  if (!cachedFlags) {
    responseHeaders.set("x-scale-flags-source", "miss");
  } else {
    const encoded = encodeFlagsHeader(cachedFlags.flags);
    requestHeaders.set("x-scale-feature-flags", encoded);
    requestHeaders.set("x-scale-flags-workspace", cachedFlags.workspaceId);
    responseHeaders.set("x-scale-feature-flags", encoded);
    responseHeaders.set("x-scale-flags-source", "kv");
    responseHeaders.set(
      "x-scale-flag-edge-regional-affinity",
      cachedFlags.flags.edge_regional_affinity === false ? "0" : "1"
    );
  }

  if (!cachedPref) {
    responseHeaders.set("x-scale-ui-pref-source", "miss");
  } else {
    const mode = cachedPref.uiPreference;
    requestHeaders.set("x-scale-ui-preference", mode);
    requestHeaders.set("x-scale-ui-pref-workspace", cachedPref.workspaceId);
    responseHeaders.set("x-scale-ui-preference", mode);
    responseHeaders.set("x-scale-ui-pref-source", "kv");
  }
}

async function passThrough(
  request: NextRequest,
  requestHeaders: Headers,
  geo: ReturnType<typeof resolveRegion>
) {
  applyGeoHeaders(requestHeaders, geo);

  const responseHeaders = new Headers();
  await attachWorkspaceEdgeStateFromKv(request, requestHeaders, responseHeaders);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("x-scale-geo-country", geo.country);
  response.headers.set("x-scale-preferred-region", geo.region);
  response.headers.set("x-scale-edge-runtime", "1");
  responseHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });

  if (isTelemetryPath(request.nextUrl.pathname)) {
    response.headers.set("x-scale-telemetry-route", "edge");
    const affinityOff =
      response.headers.get("x-scale-flag-edge-regional-affinity") === "0";
    if (!affinityOff) {
      response.headers.set("x-scale-region-affinity", geo.region);
    }
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const geo = resolveRegion(request);

  const agentHost = request.headers.get("x-agent-host")?.trim();
  const requestHeaders = new Headers(request.headers);
  if (agentHost) {
    requestHeaders.set("x-scale-agent-host", agentHost);
  }
  requestHeaders.set("x-scale-preferred-region", geo.region);

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
    return await passThrough(request, requestHeaders, geo);
  }

  if (!strict && hasSessionHint(request)) {
    requestHeaders.set("x-agent-auth", "session");
    return await passThrough(request, requestHeaders, geo);
  }

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AGENT_MIDDLEWARE_STRICT !== "1" &&
    !strict
  ) {
    requestHeaders.set("x-agent-auth", "dev-bypass");
    return await passThrough(request, requestHeaders, geo);
  }

  if (!strict) {
    requestHeaders.set("x-agent-auth", "deferred");
    return await passThrough(request, requestHeaders, geo);
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
    "/api/telemetry/:path*",
    "/api/workspace",
    "/api/workspace/:path*",
    "/api/workspaces",
    "/api/workspaces/:path*",
    "/api/v1/admin/:path*",
  ],
};
