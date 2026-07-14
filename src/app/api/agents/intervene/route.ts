import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { getPrisma } from "@/lib/prisma";
import {
  appendSessionKernelNote,
  assertSwarmSessionAccess,
  type LiveSwarmSessionStatus,
} from "@/lib/agents/swarmSessionControl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InterveneBody = {
  sessionId?: string;
  directive?: string;
  /** Default resume when directive is set; pause parks the live swarm loop. */
  action?: "pause" | "resume";
};

/**
 * POST /api/agents/intervene
 * Body:
 *   { sessionId, action: "pause" }
 *   { sessionId, action: "resume", directive?: string }
 * Header: optional x-org-id (membership validated when present / for org sessions)
 */
export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required to intervene." },
      { status: 401 }
    );
  }

  let body: InterveneBody;
  try {
    body = (await request.json()) as InterveneBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "sessionId is required." },
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
      interventionDirective: true,
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

  const action: "pause" | "resume" =
    body.action === "pause" ? "pause" : "resume";

  if (action === "pause") {
    if (
      session.status === "COMPLETED" ||
      session.status === "FAILED" ||
      session.status === "TIMEOUT"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot pause a finished SwarmSession.",
        },
        { status: 409 }
      );
    }

    await getPrisma().swarmSession.update({
      where: { id: sessionId },
      data: { status: "PAUSED" satisfies LiveSwarmSessionStatus, hitlUsed: true },
    });

    await appendSessionKernelNote(
      sessionId,
      "[SYSTEM] HITL pause requested — swarm loop parking."
    );

    return NextResponse.json({
      success: true,
      sessionId,
      status: "PAUSED",
      message: "SwarmSession paused. Stream loop will idle until resumed.",
    });
  }

  // action === "resume" — flip ACTIVE; optionally queue a directive for the loop.
  const directive = body.directive?.trim().slice(0, 4000) || null;

  const terminal = ["COMPLETED", "FAILED", "TIMEOUT"].includes(session.status);
  if (terminal) {
    return NextResponse.json(
      {
        success: false,
        error: "Cannot intervene on a finished SwarmSession.",
      },
      { status: 409 }
    );
  }

  await getPrisma().swarmSession.update({
    where: { id: sessionId },
    data: {
      status: "ACTIVE" satisfies LiveSwarmSessionStatus,
      hitlUsed: true,
      ...(directive ? { interventionDirective: directive } : {}),
    },
  });

  if (directive) {
    await appendSessionKernelNote(
      sessionId,
      `[SYSTEM] HITL intervention directive queued: ${directive.slice(0, 500)}`
    );
  } else {
    await appendSessionKernelNote(
      sessionId,
      "[SYSTEM] HITL resume — swarm loop re-armed (no new directive)."
    );
  }

  return NextResponse.json({
    success: true,
    sessionId,
    status: "ACTIVE",
    directive,
    message: directive
      ? "Directive accepted. Swarm loop will resume and inject the operator override."
      : "SwarmSession resumed (ACTIVE). Stream loop will continue.",
  });
}
