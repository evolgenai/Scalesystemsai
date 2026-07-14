import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";
import {
  executeCodeInSandbox,
  type SandboxLanguage,
} from "@/lib/agents/codeSandbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SandboxBody = {
  code?: string;
  language?: string;
};

/**
 * POST /api/agents/sandbox/run
 * Body: { code, language: "javascript" | "python" }
 * Header: optional x-org-id (membership verified when present)
 */
export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Sign in required.",
        stdout: "",
        stderr: "Unauthorized",
        exitCode: 1,
      },
      { status: 401 }
    );
  }

  const headerOrg = extractOrgIdFromRequest(request);
  if (headerOrg) {
    const membership = await resolveOrgContext(profile.id, headerOrg);
    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          error: "You are not a member of this organization.",
          code: "ORG_ACCESS_DENIED",
          stdout: "",
          stderr: "Forbidden",
          exitCode: 1,
        },
        { status: 403 }
      );
    }
  }

  let body: SandboxBody;
  try {
    body = (await request.json()) as SandboxBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body.",
        stdout: "",
        stderr: "Invalid JSON",
        exitCode: 1,
      },
      { status: 400 }
    );
  }

  const code = body.code?.trim() ?? "";
  const language = (body.language?.trim() || "javascript") as SandboxLanguage;

  if (!code) {
    return NextResponse.json(
      {
        success: false,
        error: "code is required.",
        stdout: "",
        stderr: "code is required",
        exitCode: 1,
      },
      { status: 400 }
    );
  }

  if (language !== "javascript" && language !== "python") {
    return NextResponse.json(
      {
        success: false,
        error: 'language must be "javascript" or "python".',
        stdout: "",
        stderr: "Unsupported language",
        exitCode: 1,
      },
      { status: 400 }
    );
  }

  try {
    const result = await executeCodeInSandbox(code, language, {
      signal: request.signal,
    });

    return NextResponse.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      language,
    });
  } catch (error) {
    console.error("[sandbox/run] failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "Sandbox execution failed.",
        stdout: "",
        stderr:
          error instanceof Error ? error.message : "Sandbox execution failed.",
        exitCode: 1,
      },
      { status: 500 }
    );
  }
}
