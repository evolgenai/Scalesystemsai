import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { getPrisma } from "@/lib/prisma";
import type { SwarmSessionDto } from "@/lib/agents/swarmSessionTypes";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
  swarmSessionListWhere,
} from "@/lib/org/orgScope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/sessions — historical swarm runs for the authenticated operator.
 */
export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);

  if (!profile.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Sign in required to load workspace history.",
        sessions: [] as SwarmSessionDto[],
      },
      { status: 401 }
    );
  }

  try {
    const headerOrgId = extractOrgIdFromRequest(request);
    let activeOrgId: string | null = null;

    if (headerOrgId) {
      const membership = await resolveOrgContext(profile.id, headerOrgId);
      if (!membership) {
        return NextResponse.json(
          {
            success: false,
            error:
              "You are not a member of this organization. Session history denied.",
            code: "ORG_ACCESS_DENIED",
            orgId: headerOrgId,
            sessions: [] as SwarmSessionDto[],
          },
          { status: 403 }
        );
      }
      activeOrgId = membership.orgId;
    }

    // Org mode: only sessions with orgId === activeOrgId.
    // Personal mode: only caller's sessions where orgId is null.
    const rows = await getPrisma().swarmSession.findMany({
      where: swarmSessionListWhere(profile.id, activeOrgId),
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        objective: true,
        resultMarkdown: true,
        kernelLogs: true,
        status: true,
        createdAt: true,
      },
    });

    const sessions: SwarmSessionDto[] = rows.map((row) => ({
      id: row.id,
      objective: row.objective,
      resultMarkdown: row.resultMarkdown,
      kernelLogs: row.kernelLogs,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      orgId: activeOrgId,
      sessions,
    });
  } catch (error) {
    console.error("[sessions] list failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unable to load swarm history.",
        sessions: [] as SwarmSessionDto[],
      },
      { status: 500 }
    );
  }
}
