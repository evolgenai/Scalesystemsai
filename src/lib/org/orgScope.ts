import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type OrgMembershipRole = "OWNER" | "ADMIN" | "MEMBER";

export type ResolvedOrgContext = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: OrgMembershipRole;
};

const MEMBERSHIP_ROLES = new Set<OrgMembershipRole>([
  "OWNER",
  "ADMIN",
  "MEMBER",
]);

function normalizeMembershipRole(value: string): OrgMembershipRole {
  const upper = value.toUpperCase();
  return MEMBERSHIP_ROLES.has(upper as OrgMembershipRole)
    ? (upper as OrgMembershipRole)
    : "MEMBER";
}

/**
 * Resolve the active organization from `x-org-id` or `x-org-slug` and verify
 * the caller belongs to that workspace.
 */
export async function resolveOrgContext(
  request: Request,
  userId: string | null
): Promise<ResolvedOrgContext | null> {
  if (!userId) return null;

  const orgId = request.headers.get("x-org-id")?.trim();
  const orgSlug = request.headers.get("x-org-slug")?.trim()?.toLowerCase();

  if (!orgId && !orgSlug) return null;

  try {
    const membership = await getPrisma().orgMembership.findFirst({
      where: {
        userId,
        ...(orgId
          ? { orgId }
          : {
              organization: {
                slug: orgSlug!,
              },
            }),
      },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!membership) return null;

    return {
      orgId: membership.organization.id,
      orgSlug: membership.organization.slug,
      orgName: membership.organization.name,
      role: normalizeMembershipRole(membership.role),
    };
  } catch {
    return null;
  }
}

/** Personal workspace runs are user-scoped with no org attachment. */
export function personalSwarmSessionWhere(
  userId: string
): Prisma.SwarmSessionWhereInput {
  return { userId, orgId: null };
}

/** Org workspace runs are visible to every member of that organization. */
export function orgSwarmSessionWhere(
  orgId: string
): Prisma.SwarmSessionWhereInput {
  return { orgId };
}

export function swarmSessionListWhere(
  userId: string,
  org: ResolvedOrgContext | null
): Prisma.SwarmSessionWhereInput {
  return org ? orgSwarmSessionWhere(org.orgId) : personalSwarmSessionWhere(userId);
}

export function canManageOrgWorkspace(role: OrgMembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
