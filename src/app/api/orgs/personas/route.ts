import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { getPrisma } from "@/lib/prisma";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolvePersonaScope(
  request: Request,
  userId: string
): Promise<
  | { ok: true; orgId: string | null }
  | { ok: false; status: 403; message: string }
> {
  const headerOrg = extractOrgIdFromRequest(request);
  if (!headerOrg) return { ok: true, orgId: null };

  const membership = await resolveOrgContext(userId, headerOrg);
  if (!membership) {
    return {
      ok: false,
      status: 403,
      message: "You are not a member of this organization.",
    };
  }
  return { ok: true, orgId: membership.orgId };
}

export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  const scope = await resolvePersonaScope(request, profile.id);
  if (!scope.ok) {
    return NextResponse.json(
      { success: false, error: scope.message },
      { status: 403 }
    );
  }

  let body: {
    name?: string;
    description?: string;
    systemPrompt?: string;
    tools?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const name = body.name?.trim();
  const systemPrompt = body.systemPrompt?.trim();
  if (!name || !systemPrompt) {
    return NextResponse.json(
      { success: false, error: "name and systemPrompt are required." },
      { status: 400 }
    );
  }

  const tools = Array.isArray(body.tools)
    ? body.tools
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
        .slice(0, 24)
    : [];

  try {
    const persona = await getPrisma().workspacePersona.create({
      data: {
        name: name.slice(0, 120),
        description: (body.description?.trim() || "").slice(0, 2000),
        systemPrompt: systemPrompt.slice(0, 8000),
        tools,
        userId: profile.id,
        orgId: scope.orgId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        systemPrompt: true,
        tools: true,
        orgId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      persona: {
        ...persona,
        createdAt: persona.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[personas] create failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to save persona." },
      { status: 500 }
    );
  }
}
