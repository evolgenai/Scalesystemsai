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

/** Public pricing page amounts — must stay aligned with Stripe price IDs. */
export const PLAN_MONTHLY_USD: Record<PlanTier, number | null> = {
  FREE: 0,
  STARTER: 49,
  PREMIUM: 149,
  ENTERPRISE: null,
};

export const PAID_CHECKOUT_TIERS = ["STARTER", "PREMIUM"] as const satisfies readonly PlanTier[];

export type PaidCheckoutTier = (typeof PAID_CHECKOUT_TIERS)[number];

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

export function formatMonthlyPrice(plan: PlanTier): string {
  const amount = PLAN_MONTHLY_USD[plan];
  if (amount === null) return "Custom";
  return amount === 0 ? "$0" : `$${amount}`;
}

export function resolveStripePriceIdForPlan(plan: PaidCheckoutTier): string | null {
  const envKey =
    plan === "STARTER" ? "STRIPE_STARTER_PRICE_ID" : "STRIPE_PREMIUM_PRICE_ID";
  const priceId = process.env[envKey]?.trim();

  if (!priceId || priceId.includes("placeholder")) {
    return null;
  }

  return priceId;
}

export function resolvePlanFromStripePriceId(
  priceId: string | null | undefined
): PlanTier | null {
  const normalized = priceId?.trim();
  if (!normalized) return null;

  const starterId = process.env.STRIPE_STARTER_PRICE_ID?.trim();
  const premiumId = process.env.STRIPE_PREMIUM_PRICE_ID?.trim();

  if (starterId && normalized === starterId) return "STARTER";
  if (premiumId && normalized === premiumId) return "PREMIUM";

  return null;
}

export function resolvePlanFromPaymentAmount(amountUsd: number): PlanTier | null {
  if (amountUsd >= PLAN_MONTHLY_USD.PREMIUM!) return "PREMIUM";
  if (amountUsd >= PLAN_MONTHLY_USD.STARTER!) return "STARTER";
  return null;
}

export function agentLimitLabel(plan: PlanTier): string {
  const limit = TIER_LIMITS[plan].maxActiveAgents;
  return limit === null ? "Unlimited active agent deployments" : `${limit} active agent deployment${limit === 1 ? "" : "s"}`;
}

export function tokenQuotaLabel(plan: PlanTier): string {
  const quota = TIER_LIMITS[plan].monthlyTokenQuota;
  return quota === null
    ? "Unlimited token pools"
    : `${quota.toLocaleString()} tokens/mo runtime limit`;
}
