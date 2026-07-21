/**
 * Workspace team RBAC helpers — tenant-isolated membership + invite gates.
 */

import { randomBytes } from "node:crypto";
import type { WorkspaceMemberRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateOk,
} from "@/lib/auth/workspaceGate";

export const INVITE_ROLES = ["ADMIN", "DEVELOPER", "MEMBER"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export function isInviteRole(value: unknown): value is InviteRole {
  return (
    typeof value === "string" &&
    (INVITE_ROLES as readonly string[]).includes(value)
  );
}

export function mintInviteToken(): string {
  return `ss_inv_${randomBytes(24).toString("hex")}`;
}

export type WorkspaceActorContext = {
  profile: Awaited<ReturnType<typeof resolveRequestUser>>;
  gate: WorkspaceGateOk;
  membershipRole: WorkspaceMemberRole | null;
  canManage: boolean;
};

/**
 * Resolve workspace from x-workspace-key and verify the caller may act on seats.
 * SUPER_ADMIN bypasses membership checks; otherwise ADMIN (or owner seat) required for mutations.
 */
export async function resolveWorkspaceTeamActor(
  request: Request,
  opts?: { requireManage?: boolean }
): Promise<
  | { ok: true; ctx: WorkspaceActorContext }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return {
      ok: false,
      status: 401,
      body: {
        success: false,
        error: "Sign in required.",
        code: "AUTH_REQUIRED",
      },
    };
  }

  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status,
      body: {
        success: false,
        error: gate.message,
        code: gate.code,
      },
    };
  }

  const membership = await getPrisma().workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: gate.workspaceId,
        userId: profile.id,
      },
    },
    select: { role: true },
  });

  const membershipRole = membership?.role ?? null;
  const canManage =
    profile.isSuperAdmin ||
    profile.role === "SUPER_ADMIN" ||
    membershipRole === "ADMIN";

  if (opts?.requireManage && !canManage) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: "Workspace ADMIN or SUPER_ADMIN required.",
        code: "WORKSPACE_ADMIN_REQUIRED",
      },
    };
  }

  if (
    !profile.isSuperAdmin &&
    profile.role !== "SUPER_ADMIN" &&
    !membershipRole
  ) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: "Not a member of this workspace.",
        code: "WORKSPACE_MEMBER_REQUIRED",
      },
    };
  }

  return {
    ok: true,
    ctx: {
      profile,
      gate,
      membershipRole,
      canManage,
    },
  };
}
