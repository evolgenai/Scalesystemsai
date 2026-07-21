import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveWorkspaceTeamActor } from "@/lib/workspace/members";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * DELETE /api/workspaces/members/[id]
 * Revoke an active workspace membership seat (membership id).
 * Requires: x-workspace-key + workspace ADMIN or SUPER_ADMIN.
 */
export async function DELETE(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const actor = await resolveWorkspaceTeamActor(request, {
    requireManage: true,
  });
  if (!actor.ok) {
    return NextResponse.json(actor.body, { status: actor.status });
  }

  const { id } = await context.params;
  const membershipId = id?.trim();
  if (!membershipId) {
    return NextResponse.json(
      {
        success: false,
        error: "Membership id is required.",
        code: "INVALID_ID",
      },
      { status: 400 }
    );
  }

  const { workspaceId } = actor.ctx.gate;
  const prisma = getPrisma();

  const membership = await prisma.workspaceMembership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      role: true,
      user: { select: { email: true, isSuperAdmin: true, role: true } },
    },
  });

  if (!membership || membership.workspaceId !== workspaceId) {
    return NextResponse.json(
      {
        success: false,
        error: "Membership not found in this workspace.",
        code: "MEMBERSHIP_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  // Tenant isolation: never let a non-superadmin revoke another SUPER_ADMIN seat.
  if (
    !actor.ctx.profile.isSuperAdmin &&
    (membership.user.isSuperAdmin || membership.user.role === "SUPER_ADMIN")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Cannot revoke a Super-Admin workspace seat.",
        code: "SUPER_ADMIN_PROTECTED",
      },
      { status: 403 }
    );
  }

  if (membership.userId === actor.ctx.profile.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Cannot revoke your own workspace seat.",
        code: "SELF_REVOKE_FORBIDDEN",
      },
      { status: 400 }
    );
  }

  await prisma.workspaceMembership.delete({
    where: { id: membership.id },
  });

  return NextResponse.json({
    success: true,
    revoked: {
      id: membership.id,
      workspaceId,
      userId: membership.userId,
      email: membership.user.email,
      role: membership.role,
    },
  });
}
