/**
 * Workspace RBAC permission middleware — seat-role gates for mutation /
 * execution routes (terminal, spatial morph, payments).
 */

import type { WorkspaceMemberRole } from "@prisma/client";
import type { NextResponse } from "next/server";
import {
  resolveRequestUser,
  type RequestUserProfile,
} from "@/lib/auth/requestUser";
import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateOk,
} from "@/lib/auth/workspaceGate";
import { apiError } from "@/lib/http/apiResponse";
import { getPrisma } from "@/lib/prisma";

export type WorkspacePermission =
  | "terminal.execute"
  | "spatial.morph"
  | "spatial.interact"
  | "spatial.vehicle"
  | "payments.mutate"
  | "telemetry.read";

/** Default capability matrix keyed by WorkspaceMemberRole. */
export const ROLE_PERMISSIONS: Record<
  WorkspaceMemberRole,
  readonly WorkspacePermission[]
> = {
  ADMIN: [
    "terminal.execute",
    "spatial.morph",
    "spatial.interact",
    "spatial.vehicle",
    "payments.mutate",
    "telemetry.read",
  ],
  DEVELOPER: [
    "terminal.execute",
    "spatial.morph",
    "spatial.interact",
    "spatial.vehicle",
    "payments.mutate",
    "telemetry.read",
  ],
  MEMBER: ["telemetry.read", "payments.mutate", "spatial.vehicle"],
} as const;

export type RbacContext = {
  profile: RequestUserProfile;
  gate: WorkspaceGateOk;
  workspaceId: string;
  membershipRole: WorkspaceMemberRole | null;
  permission: WorkspacePermission;
};

export type RbacDenied = {
  ok: false;
  status: 401 | 403;
  code:
    | "AUTH_REQUIRED"
    | "WORKSPACE_MEMBER_REQUIRED"
    | "PERMISSION_DENIED"
    | "WORKSPACE_REQUIRED"
    | "WORKSPACE_NOT_FOUND"
    | "WORKSPACE_KEY_INVALID"
    | "WORKSPACE_CROSS_TENANT"
    | "WORKSPACE_RESOURCE_FORBIDDEN";
  error: string;
};

export type RbacOk = { ok: true; ctx: RbacContext };

export type RbacResult = RbacOk | RbacDenied;

export function roleHasPermission(
  role: WorkspaceMemberRole | null | undefined,
  permission: WorkspacePermission
): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}

function denied(
  status: RbacDenied["status"],
  code: RbacDenied["code"],
  error: string
): RbacDenied {
  return { ok: false, status, code, error };
}

/**
 * Enforce a workspace seat permission after resolving the tenant API key gate.
 * SUPER_ADMIN bypasses membership checks. Standard 403 for missing capability.
 */
export async function requirePermission(
  request: Request,
  permission: WorkspacePermission,
  bodyWorkspaceId?: string | null
): Promise<RbacResult> {
  const gate = await requireWorkspaceApiKeyGate(
    request,
    bodyWorkspaceId ?? null
  );
  if (!gate.ok) {
    return denied(gate.status as 401 | 403, gate.code, gate.message);
  }

  const profile = await resolveRequestUser(request);

  if (profile.isSuperAdmin || profile.role === "SUPER_ADMIN") {
    return {
      ok: true,
      ctx: {
        profile,
        gate,
        workspaceId: gate.workspaceId,
        membershipRole: "ADMIN",
        permission,
      },
    };
  }

  if (!profile.id) {
    return denied(401, "AUTH_REQUIRED", "Sign in required.");
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

  let membershipRole = membership?.role ?? null;

  if (!membershipRole) {
    const seatCount = await getPrisma().workspaceMembership.count({
      where: { workspaceId: gate.workspaceId },
    });
    // Bootstrap operator: valid API key + signed-in user before any seats exist.
    if (seatCount === 0) {
      membershipRole = "ADMIN";
    } else {
      return denied(
        403,
        "WORKSPACE_MEMBER_REQUIRED",
        "Not a member of this workspace."
      );
    }
  }

  if (!roleHasPermission(membershipRole, permission)) {
    return denied(
      403,
      "PERMISSION_DENIED",
      `Forbidden — missing permission "${permission}" for role ${membershipRole}.`
    );
  }

  return {
    ok: true,
    ctx: {
      profile,
      gate,
      workspaceId: gate.workspaceId,
      membershipRole,
      permission,
    },
  };
}

/** Map a denied RBAC result to the standard API error envelope. */
export function rbacErrorResponse(
  deniedResult: RbacDenied
): NextResponse<{ success: false; error: string; code: string }> {
  return apiError(deniedResult.error, deniedResult.code, deniedResult.status);
}

/**
 * Convenience: require permission or return a ready-made 401/403 Response.
 * On success returns the RBAC context for downstream handlers.
 */
export async function enforcePermission(
  request: Request,
  permission: WorkspacePermission,
  bodyWorkspaceId?: string | null
): Promise<
  | { ok: true; ctx: RbacContext }
  | {
      ok: false;
      response: NextResponse<{ success: false; error: string; code: string }>;
    }
> {
  const result = await requirePermission(request, permission, bodyWorkspaceId);
  if (result.ok === false) {
    return { ok: false, response: rbacErrorResponse(result) };
  }
  return { ok: true, ctx: result.ctx };
}
