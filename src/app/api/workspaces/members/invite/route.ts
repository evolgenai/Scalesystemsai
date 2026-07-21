import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  isInviteRole,
  mintInviteToken,
  resolveWorkspaceTeamActor,
} from "@/lib/workspace/members";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type InviteBody = {
  email?: string;
  role?: string;
};

/**
 * POST /api/workspaces/members/invite
 * Create a pending invite token for email + role (ADMIN | DEVELOPER | MEMBER).
 * Requires: x-workspace-key + workspace ADMIN or SUPER_ADMIN.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const actor = await resolveWorkspaceTeamActor(request, {
    requireManage: true,
  });
  if (!actor.ok) {
    return NextResponse.json(actor.body, { status: actor.status });
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const role = body.role?.trim().toUpperCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid invite email is required.",
        code: "INVALID_EMAIL",
      },
      { status: 400 }
    );
  }

  if (!isInviteRole(role)) {
    return NextResponse.json(
      {
        success: false,
        error: "role must be ADMIN, DEVELOPER, or MEMBER.",
        code: "INVALID_ROLE",
      },
      { status: 400 }
    );
  }

  const { workspaceId } = actor.ctx.gate;
  const prisma = getPrisma();

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true },
  });

  if (existingUser) {
    const already = await prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: existingUser.id,
        },
      },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json(
        {
          success: false,
          error: "User is already a workspace member.",
          code: "ALREADY_MEMBER",
        },
        { status: 409 }
      );
    }
  }

  // Revoke prior pending invites for the same email in this workspace.
  await prisma.workspaceInvite.updateMany({
    where: {
      workspaceId,
      email,
      status: "PENDING",
    },
    data: { status: "REVOKED" },
  });

  const token = mintInviteToken();
  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId,
      email,
      role,
      token,
      status: "PENDING",
      invitedById: actor.ctx.profile.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      status: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token: invite.token,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
        workspaceId,
      },
    },
    { status: 201 }
  );
}
