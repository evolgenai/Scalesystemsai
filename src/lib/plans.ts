import type { PlanTier } from "@prisma/client";

export type { PlanTier };

export const PLAN_TIERS: PlanTier[] = [
  "FREE",
  "STARTER",
  "PREMIUM",
  "ENTERPRISE",
];

export type TierLimits = {
  maxActiveAgents: number | null;
  monthlyTokenQuota: number | null;
  label: string;
};

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  FREE: {
    maxActiveAgents: 1,
    monthlyTokenQuota: 50_000,
    label: "Free",
  },
  STARTER: {
    maxActiveAgents: 5,
    monthlyTokenQuota: 500_000,
    label: "Starter",
  },
  PREMIUM: {
    maxActiveAgents: null,
    monthlyTokenQuota: null,
    label: "Premium",
  },
  ENTERPRISE: {
    maxActiveAgents: null,
    monthlyTokenQuota: null,
    label: "Enterprise",
  },
};

export function isPaidPlan(plan: PlanTier): boolean {
  return plan === "PREMIUM" || plan === "ENTERPRISE" || plan === "STARTER";
}

export function parsePlanTier(value: string | null | undefined): PlanTier {
  const normalized = (value ?? "FREE").toUpperCase();

  if (PLAN_TIERS.includes(normalized as PlanTier)) {
    return normalized as PlanTier;
  }

  return "FREE";
}

export function formatPlanLabel(plan: PlanTier): string {
  return TIER_LIMITS[plan].label;
}
