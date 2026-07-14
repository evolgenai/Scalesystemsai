import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";
import { compileOpenApiSpec } from "@/lib/plugins/compileOpenApiSpec";
import {
  encryptSecret,
  isUsingDevEncryptionFallback,
} from "@/lib/security/crypto";
import { assertPublicHttpUrl } from "@/lib/security/ssrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RegisterPluginBody = {
  name?: string;
  baseUrl?: string;
  authType?: string;
  authHeader?: string;
  authToken?: string | null;
  workspaceId?: string | null;
  orgId?: string | null;
  fileName?: string | null;
  /** Raw OpenAPI JSON/YAML string or already-parsed object. */
  spec?: string | Record<string, unknown>;
};

const AUTH_TYPES = new Set(["none", "bearer", "apiKey"]);

function softWarning(message: string, details?: Record<string, unknown>) {
  return { warning: message, ...details };
}

export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);

  const allowUnauthedDev =
    profile.isSuperAdmin &&
    process.env.DEV_USER_ROLE === "SUPER_ADMIN" &&
    process.env.DEV_USER_TIER === "OVERLORD_500";

  if (!profile.id && !allowUnauthedDev) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  let body: RegisterPluginBody;
  try {
    body = (await request.json()) as RegisterPluginBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const name = body.name?.trim();
  if (!name || name.length < 2) {
    return NextResponse.json(
      { success: false, error: "Plugin name must be at least 2 characters." },
      { status: 400 }
    );
  }

  const authType = (body.authType?.trim() || "none") as string;
  if (!AUTH_TYPES.has(authType)) {
    return NextResponse.json(
      {
        success: false,
        error: 'authType must be "none", "bearer", or "apiKey".',
      },
      { status: 400 }
    );
  }

  const authHeader =
    body.authHeader?.trim() ||
    (authType === "apiKey" ? "x-api-key" : "Authorization");

  const rawToken =
    typeof body.authToken === "string" ? body.authToken.trim() : "";
  if (authType !== "none" && !rawToken) {
    return NextResponse.json(
      {
        success: false,
        error: "authToken is required when authType is bearer or apiKey.",
      },
      { status: 400 }
    );
  }

  if (body.spec === undefined || body.spec === null || body.spec === "") {
    return NextResponse.json(
      { success: false, error: "OpenAPI spec (JSON or YAML) is required." },
      { status: 400 }
    );
  }

  let compiled;
  try {
    compiled = compileOpenApiSpec(body.spec, body.fileName ?? null);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to parse OpenAPI specification.",
      },
      { status: 400 }
    );
  }

  const baseUrlRaw =
    body.baseUrl?.trim() || compiled.defaultBaseUrl?.trim() || "";
  if (!baseUrlRaw) {
    return NextResponse.json(
      {
        success: false,
        error:
          "baseUrl is required when the OpenAPI document has no servers[0].url.",
      },
      { status: 400 }
    );
  }

  let baseUrl: string;
  try {
    baseUrl = assertPublicHttpUrl(baseUrlRaw).toString().replace(/\/$/, "");
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "baseUrl failed SSRF validation.",
      },
      { status: 400 }
    );
  }

  const workspaceId =
    body.workspaceId?.trim() ||
    body.orgId?.trim() ||
    extractOrgIdFromRequest(request) ||
    null;

  if (workspaceId && profile.id && !profile.isSuperAdmin) {
    const membership = await resolveOrgContext(profile.id, workspaceId);
    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          error: "You are not a member of the target workspace.",
        },
        { status: 403 }
      );
    }
  }

  let encryptedToken: string | null = null;
  if (authType !== "none") {
    try {
      encryptedToken = encryptSecret(rawToken);
    } catch (error) {
      console.error("[plugins/register] encryption failed");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? "Unable to encrypt authToken."
              : "Unable to encrypt authToken.",
        },
        { status: 500 }
      );
    }
  }

  try {
    const plugin = await getPrisma().workspacePlugin.create({
      data: {
        name,
        spec: compiled as unknown as Prisma.InputJsonValue,
        baseUrl,
        authType,
        authHeader,
        authToken: encryptedToken,
        isActive: true,
        workspaceId,
      },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        authType: true,
        authHeader: true,
        isActive: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const warnings: Record<string, unknown>[] = [];
    if (isUsingDevEncryptionFallback()) {
      warnings.push(
        softWarning(
          "PLUGINS_ENCRYPTION_KEY is unset — using development encryption fallback. Set a 64-char hex key before production."
        )
      );
    }
    if (!workspaceId) {
      warnings.push(
        softWarning(
          "No workspace scope provided — plugin stored without organization linkage."
        )
      );
    }

    return NextResponse.json({
      success: true,
      plugin: {
        ...plugin,
        operationCount: compiled.operations.length,
        // Never echo authToken (encrypted or plaintext).
        hasAuthToken: Boolean(encryptedToken),
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error("[plugins/register] persist failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to register plugin." },
      { status: 500 }
    );
  }
}
