import type {
  AccountProfileKind,
  SubscriptionTier,
  UserRole,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getMaxAgentsForTier, TIER_MATRIX } from "@/lib/billing/tiers";
import {
  normalizeCommercialPlan,
  type CommercialPlan,
} from "@/lib/billing/commercialPlans";

export type RequestUserProfile = {
  id: string | null;
  email: string | null;
  role: UserRole;
  accountKind: AccountProfileKind;
  tier: SubscriptionTier;
  maxAgents: number;
  plan: CommercialPlan;
  isSuperAdmin: boolean;
  isDeveloperAccount: boolean;
  developerAccountId: string | null;
};

const DEFAULT_PROFILE: RequestUserProfile = {
  id: null,
  email: null,
  role: "USER",
  accountKind: "USER_ACCOUNT",
  tier: "STARTER_5",
  maxAgents: 5,
  plan: "FREE",
  isSuperAdmin: false,
  isDeveloperAccount: false,
  developerAccountId: null,
};

function profileFromEnv(): RequestUserProfile | null {
  const role = process.env.DEV_USER_ROLE?.trim();
  const tier = process.env.DEV_USER_TIER?.trim() as SubscriptionTier | undefined;
  const plan = process.env.DEV_USER_PLAN?.trim();
  const accountKindEnv = process.env.DEV_USER_ACCOUNT_KIND?.trim();

  if (!role && !tier && !plan && !accountKindEnv) return null;

  const resolvedRole: UserRole =
    role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
  const resolvedTier: SubscriptionTier =
    tier && tier in TIER_MATRIX ? tier : "STARTER_5";
  const resolvedPlan = normalizeCommercialPlan(
    plan ?? (resolvedRole === "SUPER_ADMIN" ? "ENTERPRISE" : "FREE")
  );
  const accountKind: AccountProfileKind =
    accountKindEnv === "DEVELOPER_ACCOUNT" || resolvedRole === "SUPER_ADMIN"
      ? "DEVELOPER_ACCOUNT"
      : "USER_ACCOUNT";

  return {
    id: process.env.DEV_USER_ID?.trim() ?? null,
    email: process.env.DEV_USER_EMAIL?.trim() ?? null,
    role: resolvedRole,
    accountKind,
    tier: resolvedTier,
    maxAgents: getMaxAgentsForTier(resolvedTier),
    plan: resolvedPlan,
    isSuperAdmin: resolvedRole === "SUPER_ADMIN",
    isDeveloperAccount: accountKind === "DEVELOPER_ACCOUNT",
    developerAccountId: process.env.DEV_DEVELOPER_ACCOUNT_ID?.trim() ?? null,
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
      accountKind: "DEVELOPER_ACCOUNT",
      tier,
      maxAgents: getMaxAgentsForTier(tier),
      plan: normalizeCommercialPlan(
        request.headers.get("x-user-plan") ?? "ENTERPRISE"
      ),
      isSuperAdmin: true,
      isDeveloperAccount: true,
      developerAccountId:
        request.headers.get("x-developer-account-id")?.trim() ?? null,
    };
  }

  const envProfile = profileFromEnv();
  if (envProfile) return envProfile;

  const userId = request.headers.get("x-user-id")?.trim();
  const userEmail = request.headers.get("x-user-email")?.trim()?.toLowerCase();

  if (userId || userEmail) {
    try {
      const userSelect = {
        id: true,
        email: true,
        role: true,
        accountKind: true,
        tier: true,
        maxAgents: true,
        plan: true,
        developerAccount: { select: { id: true, verifiedAt: true } },
      } as const;

      const user = userId
        ? await getPrisma().user.findUnique({
            where: { id: userId },
            select: userSelect,
          })
        : await getPrisma().user.findUnique({
            where: { email: userEmail! },
            select: userSelect,
          });

      if (user) {
        const verifiedDeveloper =
          user.accountKind === "DEVELOPER_ACCOUNT" &&
          user.developerAccount?.verifiedAt != null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          accountKind: user.accountKind,
          tier: user.tier,
          maxAgents: user.maxAgents,
          plan: normalizeCommercialPlan(user.plan),
          isSuperAdmin: user.role === "SUPER_ADMIN",
          isDeveloperAccount: verifiedDeveloper,
          developerAccountId: user.developerAccount?.id ?? null,
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
