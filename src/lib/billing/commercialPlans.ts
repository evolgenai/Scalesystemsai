import type { SubscriptionTier } from "@prisma/client";
import { getMaxAgentsForTier } from "@/lib/billing/tiers";

/** Commercial plan labels stored on User.plan (string column). */
export type CommercialPlan = "FREE" | "STARTER" | "PREMIUM" | "ENTERPRISE";

export type CheckoutPlan = "STARTER" | "PREMIUM";

export const CHECKOUT_PLANS: CheckoutPlan[] = ["STARTER", "PREMIUM"];

export function isCheckoutPlan(value: string): value is CheckoutPlan {
  return CHECKOUT_PLANS.includes(value as CheckoutPlan);
}

export function normalizeCommercialPlan(
  value: string | null | undefined
): CommercialPlan {
  const normalized = (value ?? "FREE").trim().toUpperCase();
  if (
    normalized === "STARTER" ||
    normalized === "PREMIUM" ||
    normalized === "ENTERPRISE"
  ) {
    return normalized;
  }
  return "FREE";
}

/** Map Stripe/BVNK commercial plans onto Prisma SubscriptionTier capacity. */
export function commercialPlanToTier(plan: CheckoutPlan): SubscriptionTier {
  switch (plan) {
    case "STARTER":
      return "STARTER_5";
    case "PREMIUM":
      return "PRO_20";
    default:
      return "STARTER_5";
  }
}

export function commercialPlanCapacity(plan: CheckoutPlan): {
  plan: CheckoutPlan;
  tier: SubscriptionTier;
  maxAgents: number;
} {
  const tier = commercialPlanToTier(plan);
  return {
    plan,
    tier,
    maxAgents: getMaxAgentsForTier(tier),
  };
}

export function stripePriceIdForPlan(plan: CheckoutPlan): string | null {
  if (plan === "STARTER") {
    return (
      process.env.STRIPE_STARTER_PRICE_ID?.trim() ||
      process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID?.trim() ||
      null
    );
  }
  return (
    process.env.STRIPE_PREMIUM_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID?.trim() ||
    null
  );
}

export function planFromStripePriceId(
  priceId: string | null | undefined
): CheckoutPlan | null {
  if (!priceId) return null;
  const starter =
    process.env.STRIPE_STARTER_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID?.trim();
  const premium =
    process.env.STRIPE_PREMIUM_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID?.trim();

  if (starter && priceId === starter) return "STARTER";
  if (premium && priceId === premium) return "PREMIUM";
  return null;
}

export function bvnkAmountUsdForPlan(plan: CheckoutPlan): number {
  return plan === "PREMIUM" ? 99 : 29;
}

export const PLAN_DISPLAY = {
  STARTER: {
    label: "Starter",
    priceMonthly: 29,
    tagline: "Perfect for individual builders.",
  },
  PREMIUM: {
    label: "Professional",
    priceMonthly: 99,
    tagline:
      "Advanced swarm access, parallel workers, and automated API hooks.",
  },
} as const;
