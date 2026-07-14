import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { getPrisma } from "@/lib/prisma";
import type { SwarmSessionDto } from "@/lib/agents/swarmSessionTypes";

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
    const rows = await getPrisma().swarmSession.findMany({
      where: { userId: profile.id },
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

    return NextResponse.json({ success: true, sessions });
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
