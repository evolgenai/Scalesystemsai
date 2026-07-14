import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { getPrisma } from "@/lib/prisma";
import {
  appendSessionKernelNote,
  assertSwarmSessionAccess,
  type LiveSwarmSessionStatus,
} from "@/lib/agents/swarmSessionControl";
import type { DebateRole } from "@/lib/agents/debateEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VoteBody = {
  sessionId?: string;
  vote?: string;
};

/**
 * POST /api/agents/debate/vote
 * Body: { sessionId, vote: "creator" | "critic" }
 */
export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required to vote." },
      { status: 401 }
    );
  }

  let body: VoteBody;
  try {
    body = (await request.json()) as VoteBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const sessionId = body.sessionId?.trim();
  const voteRaw = body.vote?.trim().toLowerCase();
  const vote: DebateRole | null =
    voteRaw === "creator" || voteRaw === "critic" ? voteRaw : null;

  if (!sessionId || !vote) {
    return NextResponse.json(
      {
        success: false,
        error: 'sessionId and vote ("creator" | "critic") are required.',
      },
      { status: 400 }
    );
  }

  const session = await getPrisma().swarmSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      orgId: true,
      status: true,
    },
  });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "SwarmSession not found." },
      { status: 404 }
    );
  }

  const access = await assertSwarmSessionAccess(request, profile.id, session);
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.message, code: "ORG_ACCESS_DENIED" },
      { status: 403 }
    );
  }

  if (session.status !== "PENDING_CONSENSUS" && session.status !== "PAUSED") {
    if (
      session.status === "COMPLETED" ||
      session.status === "FAILED" ||
      session.status === "TIMEOUT"
    ) {
      return NextResponse.json(
        { success: false, error: "Cannot vote on a finished SwarmSession." },
        { status: 409 }
      );
    }
  }

  await getPrisma().swarmSession.update({
    where: { id: sessionId },
    data: {
      status: "ACTIVE" satisfies LiveSwarmSessionStatus,
      consensusVote: vote,
    },
  });

  await appendSessionKernelNote(
    sessionId,
    `[SYSTEM] Debate consensus vote recorded: ${vote}`
  );

  return NextResponse.json({
    success: true,
    sessionId,
    vote,
    status: "ACTIVE",
    message: `Vote accepted for ${vote}. Stream will resume with the winning strategy.`,
  });
}
