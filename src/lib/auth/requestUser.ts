import type { SubscriptionTier, UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getMaxAgentsForTier, TIER_MATRIX } from "@/lib/billing/tiers";

export type RequestUserProfile = {
  id: string | null;
  email: string | null;
  role: UserRole;
  tier: SubscriptionTier;
  maxAgents: number;
  isSuperAdmin: boolean;
};

const DEFAULT_PROFILE: RequestUserProfile = {
  id: null,
  email: null,
  role: "USER",
  tier: "STARTER_5",
  maxAgents: 5,
  isSuperAdmin: false,
};

function profileFromEnv(): RequestUserProfile | null {
  const role = process.env.DEV_USER_ROLE?.trim();
  const tier = process.env.DEV_USER_TIER?.trim() as SubscriptionTier | undefined;

  if (!role && !tier) return null;

  const resolvedRole: UserRole =
    role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
  const resolvedTier: SubscriptionTier =
    tier && tier in TIER_MATRIX ? tier : "STARTER_5";

  return {
    id: process.env.DEV_USER_ID?.trim() ?? null,
    email: process.env.DEV_USER_EMAIL?.trim() ?? null,
    role: resolvedRole,
    tier: resolvedTier,
    maxAgents: getMaxAgentsForTier(resolvedTier),
    isSuperAdmin: resolvedRole === "SUPER_ADMIN",
  };
}

export async function resolveRequestUser(
  request: Request
): Promise<RequestUserProfile> {
  const roleHeader = request.headers.get("x-user-role")?.trim();
  if (roleHeader === "SUPER_ADMIN") {
    const tierHeader = request.headers.get("x-user-tier")?.trim() as
      | SubscriptionTier
      | undefined;
    const tier = tierHeader ?? "OVERLORD_500";
    return {
      id: request.headers.get("x-user-id"),
      email: request.headers.get("x-user-email"),
      role: "SUPER_ADMIN",
      tier,
      maxAgents: getMaxAgentsForTier(tier),
      isSuperAdmin: true,
    };
  }

  const envProfile = profileFromEnv();
  if (envProfile) return envProfile;

  const userId = request.headers.get("x-user-id")?.trim();
  if (userId) {
    try {
      const user = await getPrisma().user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, tier: true, maxAgents: true },
      });

      if (user) {
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          tier: user.tier,
          maxAgents: user.maxAgents,
          isSuperAdmin: user.role === "SUPER_ADMIN",
        };
      }
    } catch {
      // Fall through to default profile when DB is unavailable.
    }
  }

  return DEFAULT_PROFILE;
}

export function isQuotaBypassed(profile: RequestUserProfile): boolean {
  return profile.isSuperAdmin;
}
