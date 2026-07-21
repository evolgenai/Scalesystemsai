import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveWorkspaceTeamActor } from "@/lib/workspace/members";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/workspaces/members
 * List active members + pending invites for the workspace bound by x-workspace-key.
 * Requires: x-workspace-key + signed-in user (member or SUPER_ADMIN).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const actor = await resolveWorkspaceTeamActor(request);
  if (!actor.ok) {
    return NextResponse.json(actor.body, { status: actor.status });
  }

  const { workspaceId } = actor.ctx.gate;
  const prisma = getPrisma();

  const [members, invites] = await Promise.all([
    prisma.workspaceMembership.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            role: true,
            isSuperAdmin: true,
          },
        },
      },
    }),
    prisma.workspaceInvite.findMany({
      where: { workspaceId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: {
          select: { id: true, email: true, username: true, name: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    workspaceId,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      user: m.user,
    })),
    pendingInvites: invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      invitedBy: inv.invitedBy,
    })),
    canManage: actor.ctx.canManage,
  });
}
