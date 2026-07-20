import type { OrgRole, Prisma, SubscriptionTier, UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { RequestUserProfile } from "@/lib/auth/requestUser";
import { getMaxAgentsForTier } from "@/lib/billing/tiers";
import { normalizeCommercialPlan } from "@/lib/billing/commercialPlans";
import type { OrgSummary } from "@/lib/org/types";

export type { OrgSummary } from "@/lib/org/types";

export type OrgMembershipContext = {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  organization: { id: string; name: string; slug: string };
};

export type OrgOwnerBillingQuota = {
  ownerId: string;
  email: string | null;
  plan: string;
  tier: SubscriptionTier;
  maxAgents: number;
  profile: RequestUserProfile;
};

export function slugifyOrgName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `org-${Date.now().toString(36)}`;
}

export function extractOrgIdFromRequest(request: Request): string | null {
  return request.headers.get("x-org-id")?.trim() || null;
}

/**
 * Verify `userId` is an active member of an org referenced by id or slug.
 */
export async function resolveOrgContext(
  userId: string,
  orgIdOrSlug?: string | null
): Promise<OrgMembershipContext | null> {
  const key = orgIdOrSlug?.trim();
  if (!userId.trim() || !key) return null;

  const membership = await getPrisma().orgMembership.findFirst({
    where: {
      userId,
      OR: [{ orgId: key }, { organization: { slug: key } }],
    },
    select: {
      id: true,
      orgId: true,
      userId: true,
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return membership;
}

/**
 * Resolve the founder's subscription / credit pool for unified org billing.
 */
export async function getOrgOwnerBillingQuota(
  orgId: string
): Promise<OrgOwnerBillingQuota | null> {
  const ownerMembership = await getPrisma().orgMembership.findFirst({
    where: { orgId, role: "OWNER" },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          accountKind: true,
          tier: true,
          maxAgents: true,
          plan: true,
          developerAccount: { select: { id: true, verifiedAt: true } },
        },
      },
    },
  });

  const owner = ownerMembership?.user;
  if (!owner) return null;

  const tier = owner.tier as SubscriptionTier;
  const role = owner.role as UserRole;
  const verifiedDeveloper =
    owner.accountKind === "DEVELOPER_ACCOUNT" &&
    owner.developerAccount?.verifiedAt != null;
  const profile: RequestUserProfile = {
    id: owner.id,
    email: owner.email,
    role,
    accountKind: owner.accountKind,
    tier,
    maxAgents: owner.maxAgents || getMaxAgentsForTier(tier),
    plan: normalizeCommercialPlan(owner.plan),
    isSuperAdmin: role === "SUPER_ADMIN",
    isDeveloperAccount: verifiedDeveloper,
    developerAccountId: owner.developerAccount?.id ?? null,
  };

  return {
    ownerId: owner.id,
    email: owner.email,
    plan: owner.plan,
    tier,
    maxAgents: profile.maxAgents,
    profile,
  };
}

/**
 * Prisma `where` for SwarmSession history under personal vs org workspace scope.
 */
export function swarmSessionListWhere(
  userId: string,
  activeOrgId?: string | null
): Prisma.SwarmSessionWhereInput {
  if (activeOrgId?.trim()) {
    return { orgId: activeOrgId.trim() };
  }
  return { userId, orgId: null };
}

export async function listUserOrganizations(
  userId: string
): Promise<OrgSummary[]> {
  const rows = await getPrisma().orgMembership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return rows.map((row) => ({
    id: row.organization.id,
    name: row.organization.name,
    slug: row.organization.slug,
    role: row.role as OrgSummary["role"],
  }));
}

/** Prefer resolveOrgContext for full membership payloads. */
export async function assertOrgMembership(
  orgId: string,
  userId: string,
  roles?: OrgRole[]
): Promise<{ role: OrgRole } | null> {
  const ctx = await resolveOrgContext(userId, orgId);
  if (!ctx) return null;
  if (roles && !roles.includes(ctx.role)) return null;
  return { role: ctx.role };
}

export type BillingProfileResolution =
  | {
      ok: true;
      billing: RequestUserProfile;
      /** Set when execution is charged to the org OWNER pool. */
      orgId: string | null;
      billingMode: "personal" | "org_owner";
    }
  | {
      ok: false;
      status: 403;
      code: "ORG_ACCESS_DENIED" | "ORG_OWNER_BILLING_MISSING";
      message: string;
      orgId: string;
    };

/**
 * Billing profile for stream gating:
 * - No `x-org-id` → personal credit pool (decrement caller).
 * - Valid `x-org-id` → organization OWNER credit pool (decrement owner).
 * - Present but invalid / no OWNER → hard 403 (never silently fall back).
 */
export async function resolveBillingProfileForRequest(
  request: Request,
  personal: RequestUserProfile
): Promise<BillingProfileResolution> {
  const orgId = extractOrgIdFromRequest(request);
  if (!orgId) {
    return {
      ok: true,
      billing: personal,
      orgId: null,
      billingMode: "personal",
    };
  }

  if (!personal.id) {
    return {
      ok: false,
      status: 403,
      code: "ORG_ACCESS_DENIED",
      message: "Sign in is required to use an organization credit pool.",
      orgId,
    };
  }

  const membership = await resolveOrgContext(personal.id, orgId);
  if (!membership) {
    return {
      ok: false,
      status: 403,
      code: "ORG_ACCESS_DENIED",
      message:
        "You are not a member of this organization. Stream access denied.",
      orgId,
    };
  }

  const ownerQuota = await getOrgOwnerBillingQuota(membership.orgId);
  if (!ownerQuota) {
    return {
      ok: false,
      status: 403,
      code: "ORG_OWNER_BILLING_MISSING",
      message:
        "Organization owner billing profile is unavailable. Stream access denied.",
      orgId: membership.orgId,
    };
  }

  return {
    ok: true,
    billing: ownerQuota.profile,
    orgId: membership.orgId,
    billingMode: "org_owner",
  };
}
