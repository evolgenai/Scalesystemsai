import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  generateApiKey,
  hashToken,
  visibleKeyPrefix,
} from "@/lib/auth/apiTokenEngine";
import { getPrisma } from "@/lib/prisma";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveKeyScope(
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

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required.", keys: [] },
      { status: 401 }
    );
  }

  const scope = await resolveKeyScope(request, profile.id);
  if (!scope.ok) {
    return NextResponse.json(
      { success: false, error: scope.message, keys: [] },
      { status: 403 }
    );
  }

  try {
    const rows = await getPrisma().apiKey.findMany({
      where: scope.orgId
        ? { orgId: scope.orgId }
        : { userId: profile.id, orgId: null },
      orderBy: { createdAt: "desc" },
      take: 32,
      select: {
        id: true,
        prefix: true,
        name: true,
        orgId: true,
        userId: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      orgId: scope.orgId,
      keys: rows.map((row) => ({
        id: row.id,
        prefix: row.prefix,
        name: row.name,
        orgId: row.orgId,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[apikeys] list failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to load API keys.", keys: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  const scope = await resolveKeyScope(request, profile.id);
  if (!scope.ok) {
    return NextResponse.json(
      { success: false, error: scope.message },
      { status: 403 }
    );
  }

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    body = {};
  }

  const name = body.name?.trim() || "Default API Key";
  const rawKey = generateApiKey();

  try {
    const row = await getPrisma().apiKey.create({
      data: {
        hashedKey: hashToken(rawKey),
        prefix: visibleKeyPrefix(rawKey),
        name: name.slice(0, 120),
        userId: profile.id,
        orgId: scope.orgId,
      },
      select: {
        id: true,
        prefix: true,
        name: true,
        orgId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      key: rawKey,
      metadata: {
        id: row.id,
        prefix: row.prefix,
        name: row.name,
        orgId: row.orgId,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[apikeys] create failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to create API key." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  const scope = await resolveKeyScope(request, profile.id);
  if (!scope.ok) {
    return NextResponse.json(
      { success: false, error: scope.message },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  let keyId = searchParams.get("id")?.trim() || null;
  if (!keyId) {
    try {
      const body = (await request.json()) as { id?: string };
      keyId = body.id?.trim() || null;
    } catch {
      // no body
    }
  }

  if (!keyId) {
    return NextResponse.json(
      { success: false, error: "id is required." },
      { status: 400 }
    );
  }

  const row = await getPrisma().apiKey.findUnique({
    where: { id: keyId },
    select: { id: true, userId: true, orgId: true },
  });

  if (!row) {
    return NextResponse.json(
      { success: false, error: "API key not found." },
      { status: 404 }
    );
  }

  if (scope.orgId) {
    if (row.orgId !== scope.orgId) {
      return NextResponse.json(
        { success: false, error: "Not allowed to revoke this key." },
        { status: 403 }
      );
    }
  } else if (row.userId !== profile.id || row.orgId != null) {
    return NextResponse.json(
      { success: false, error: "Not allowed to revoke this key." },
      { status: 403 }
    );
  }

  await getPrisma().apiKey.delete({ where: { id: row.id } });
  return NextResponse.json({ success: true, revokedId: row.id });
}
