import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { provisionDemoSandbox } from "@/lib/demo/sandboxProvision";
import { DEMO_TTL_MS } from "@/lib/demo/sandboxBlueprints";
import { trackServerFunnel } from "@/lib/analytics/serverFunnel";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rateLimiter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "ss_session";
const LOG = "[auth/demo-sandbox]";

/**
 * POST /api/auth/demo-sandbox
 * Provision an ephemeral guest tenant (demo-xxxx) with 10k GAS + 3 blueprints.
 * Returns HMAC session token for instant /dashboard redirect.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const verdict = checkRateLimit(request, {
    ...RATE_LIMIT_PRESETS.auth,
    bucket: "demo-sandbox",
    limit: 10,
    windowMs: 60_000,
  });

  if (!verdict.allowed) {
    const res = NextResponse.json(
      {
        success: false,
        error: "Too many demo sandbox requests. Try again shortly.",
        code: "RATE_LIMITED",
      },
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, verdict);
    return res;
  }

  try {
    const prisma = getPrisma();
    const sandbox = await provisionDemoSandbox(prisma);

    trackServerFunnel({
      event: "auth_success",
      metadata: {
        mode: "demo_sandbox",
        slug: sandbox.slug,
        workspaceId: sandbox.workspace.id,
      },
    });

    console.info(`${LOG} provisioned`, {
      slug: sandbox.slug,
      workspaceId: sandbox.workspace.id,
      userId: sandbox.user.id,
      expiresAt: sandbox.expiresAt.toISOString(),
    });

    const maxAge = Math.floor(DEMO_TTL_MS / 1000);
    const res = NextResponse.json(
      {
        success: true,
        redirectTo: sandbox.redirectTo,
        sessionToken: sandbox.sessionToken,
        expiresAt: sandbox.expiresAt.toISOString(),
        user: sandbox.user,
        workspace: sandbox.workspace,
        blueprints: sandbox.blueprints,
      },
      { status: 201 }
    );

    applyRateLimitHeaders(res.headers, verdict);
    res.cookies.set(SESSION_COOKIE, sandbox.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
    res.headers.set("x-workspace-id", sandbox.workspace.id);
    res.headers.set("cache-control", "no-store");

    return res;
  } catch (error) {
    console.error(`${LOG} failed`, {
      message: error instanceof Error ? error.message : String(error),
    });
    trackServerFunnel({
      event: "auth_failure",
      metadata: { mode: "demo_sandbox", reason: "server_error" },
    });

    const res = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to provision demo sandbox.",
        code: "DEMO_SANDBOX_FAILED",
      },
      { status: 503 }
    );
    applyRateLimitHeaders(res.headers, verdict);
    return res;
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: "Method not allowed. Use POST to provision a demo sandbox.",
      code: "METHOD_NOT_ALLOWED",
    },
    { status: 405 }
  );
}
