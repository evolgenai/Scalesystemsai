import type { PlanTier } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { TIER_LIMITS } from "@/lib/plans";

export type QuotaCheckResult =
  | { allowed: true }
  | { allowed: false; error: string; code: string };

export const QUOTA_VIOLATION_CODES = new Set([
  "TOKEN_QUOTA_EXCEEDED",
  "AGENT_LIMIT_EXCEEDED",
]);

export function isQuotaViolation(code: string): boolean {
  return QUOTA_VIOLATION_CODES.has(code);
}

type CheckAgentAccessOptions = {
  tokensRequired?: number;
  agentType?: string;
};

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function resetUsageIfNeeded(
  userId: string,
  usagePeriodStart: Date,
  currentUsage: number
): Promise<number> {
  const monthStart = startOfUtcMonth(new Date());
  const periodStart = startOfUtcMonth(usagePeriodStart);

  if (periodStart.getTime() >= monthStart.getTime()) {
    return currentUsage;
  }

  await getPrisma().user.update({
    where: { id: userId },
    data: {
      monthlyTokenUsage: 0,
      usagePeriodStart: monthStart,
    },
  });

  return 0;
}

export async function checkAgentAccess(
  userId: string,
  options: CheckAgentAccessOptions = {}
): Promise<QuotaCheckResult> {
  const { tokensRequired = 0, agentType } = options;

  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      plan: true,
      monthlyTokenUsage: true,
      usagePeriodStart: true,
    },
  });

  if (!user) {
    return {
      allowed: false,
      error: "User account not found.",
      code: "USER_NOT_FOUND",
    };
  }

  const limits = TIER_LIMITS[user.plan];
  const monthlyUsage = await resetUsageIfNeeded(
    userId,
    user.usagePeriodStart,
    user.monthlyTokenUsage
  );

  if (
    limits.monthlyTokenQuota !== null &&
    monthlyUsage + tokensRequired > limits.monthlyTokenQuota
  ) {
    return {
      allowed: false,
      error: `Monthly token quota exceeded for ${limits.label} plan (${limits.monthlyTokenQuota.toLocaleString()} tokens/mo). Upgrade to continue running agents.`,
      code: "TOKEN_QUOTA_EXCEEDED",
    };
  }

  if (limits.maxActiveAgents !== null && agentType) {
    const prisma = getPrisma();

    const existingDeployment = await prisma.agentDeployment.findUnique({
      where: {
        userId_agentType: {
          userId,
          agentType,
        },
      },
    });

    if (!existingDeployment?.isActive) {
      const activeCount = await prisma.agentDeployment.count({
        where: {
          userId,
          isActive: true,
        },
      });

      if (activeCount >= limits.maxActiveAgents) {
        return {
          allowed: false,
          error: `${limits.label} plan allows ${limits.maxActiveAgents} active agent node(s). Upgrade your subscription to deploy more agents.`,
          code: "AGENT_LIMIT_EXCEEDED",
        };
      }
    }
  }

  return { allowed: true };
}

export async function recordAgentRun(
  userId: string,
  agentType: string,
  tokensSpent: number
): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction([
    prisma.agentRunLog.create({
      data: {
        userId,
        agentType,
        tokensSpent,
      },
    }),
    prisma.agentDeployment.upsert({
      where: {
        userId_agentType: {
          userId,
          agentType,
        },
      },
      create: {
        userId,
        agentType,
        isActive: true,
      },
      update: {
        isActive: true,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        monthlyTokenUsage: {
          increment: tokensSpent,
        },
      },
    }),
  ]);
}

export async function getUserQuotaSnapshot(userId: string) {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      monthlyTokenUsage: true,
      usagePeriodStart: true,
      agentDeployments: {
        where: { isActive: true },
        select: { agentType: true },
      },
    },
  });

  if (!user) return null;

  const limits = TIER_LIMITS[user.plan];
  const monthlyUsage = await resetUsageIfNeeded(
    userId,
    user.usagePeriodStart,
    user.monthlyTokenUsage
  );

  return {
    plan: user.plan,
    limits,
    monthlyTokenUsage: monthlyUsage,
    activeAgents: user.agentDeployments.length,
  };
}
