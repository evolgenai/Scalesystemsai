import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";
import {
  deleteMemoryForUser,
  listMemories,
} from "@/lib/agents/memoryBank";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolve personal vs org memory scope.
 * - With x-org-id: membership required → org memories
 * - Without: personal memories (orgId null)
 */
async function resolveMemoryScope(
  request: Request,
  userId: string
): Promise<
  | { ok: true; orgId: string | null }
  | { ok: false; status: 403; message: string }
> {
  const headerOrg = extractOrgIdFromRequest(request);
  if (!headerOrg) {
    return { ok: true, orgId: null };
  }

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

/**
 * GET /api/orgs/memories — list memories for active org or personal scope.
 */
export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required.", memories: [] },
      { status: 401 }
    );
  }

  const scope = await resolveMemoryScope(request, profile.id);
  if (!scope.ok) {
    return NextResponse.json(
      {
        success: false,
        error: scope.message,
        code: "ORG_ACCESS_DENIED",
        memories: [],
      },
      { status: 403 }
    );
  }

  try {
    const rows = await listMemories(profile.id, scope.orgId);
    return NextResponse.json({
      success: true,
      orgId: scope.orgId,
      memories: rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        userId: row.userId,
        fragment: row.fragment,
        keywords: row.keywords,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[memories] list failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to load memories.", memories: [] },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orgs/memories — body/query: memoryId
 */
export async function DELETE(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  const scope = await resolveMemoryScope(request, profile.id);
  if (!scope.ok) {
    return NextResponse.json(
      {
        success: false,
        error: scope.message,
        code: "ORG_ACCESS_DENIED",
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  let memoryId = searchParams.get("memoryId")?.trim() || null;

  if (!memoryId) {
    try {
      const body = (await request.json()) as { memoryId?: string };
      memoryId = body.memoryId?.trim() || null;
    } catch {
      // no body
    }
  }

  if (!memoryId) {
    return NextResponse.json(
      { success: false, error: "memoryId is required." },
      { status: 400 }
    );
  }

  const result = await deleteMemoryForUser({
    memoryId,
    userId: profile.id,
    orgId: scope.orgId,
  });

  if (result === "not_found") {
    return NextResponse.json(
      { success: false, error: "Memory not found." },
      { status: 404 }
    );
  }
  if (result === "forbidden") {
    return NextResponse.json(
      {
        success: false,
        error: "Not allowed to delete this memory.",
        code: "ORG_ACCESS_DENIED",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, deletedId: memoryId });
}
