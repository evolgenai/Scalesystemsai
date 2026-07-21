import type { SubscriptionTier } from "@prisma/client";
import { getMaxAgentsForTier } from "@/lib/billing/tiers";

/** Commercial plan labels stored on User.plan (string column). */
export type CommercialPlan = "FREE" | "STARTER" | "PREMIUM" | "PRO" | "ENTERPRISE";

export type CheckoutPlan = "STARTER" | "PREMIUM" | "PRO" | "ENTERPRISE";

export const CHECKOUT_PLANS: CheckoutPlan[] = [
  "STARTER",
  "PREMIUM",
  "PRO",
  "ENTERPRISE",
];

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
    normalized === "PRO" ||
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
    case "PRO":
      return "PRO_20";
    case "ENTERPRISE":
      return "ENTERPRISE_100";
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
  if (plan === "ENTERPRISE") {
    return (
      process.env.STRIPE_ENTERPRISE_PRICE_ID?.trim() ||
      process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID?.trim() ||
      null
    );
  }
  // PREMIUM (legacy) and PRO share the pro price id.
  return (
    process.env.STRIPE_PRO_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID?.trim() ||
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
  const pro =
    process.env.STRIPE_PRO_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID?.trim() ||
    process.env.STRIPE_PREMIUM_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID?.trim();
  const enterprise =
    process.env.STRIPE_ENTERPRISE_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID?.trim();

  if (starter && priceId === starter) return "STARTER";
  if (pro && priceId === pro) return "PRO";
  if (enterprise && priceId === enterprise) return "ENTERPRISE";
  return null;
}

export function bvnkAmountUsdForPlan(plan: CheckoutPlan): number {
  if (plan === "ENTERPRISE") return 999;
  if (plan === "PRO" || plan === "PREMIUM") return 199;
  return 29;
}

export const PLAN_DISPLAY = {
  STARTER: {
    label: "Starter",
    priceMonthly: 29,
    tagline: "Perfect for individual builders.",
  },
  PREMIUM: {
    label: "Professional",
    priceMonthly: 199,
    tagline:
      "Advanced swarm access, parallel workers, and automated API hooks.",
  },
  PRO: {
    label: "Pro",
    priceMonthly: 199,
    tagline: "2M GAS/mo plus custom domains for growing fleets.",
  },
  ENTERPRISE: {
    label: "Enterprise",
    priceMonthly: 999,
    tagline: "Unlimited GAS with a dedicated Meta-SRE.",
  },
} as const;

/** Workspace upgrade panel tiers (Gas drawer / billing view). */
export const WORKSPACE_PLAN_DISPLAY = {
  STARTER: {
    label: "Starter",
    priceMonthly: 29,
    gasLabel: "200k GAS/mo",
    tagline: "Launch pad for solo operators.",
    features: ["200k GAS monthly allotment", "Core swarm workers", "Email support"],
  },
  PRO: {
    label: "Pro",
    priceMonthly: 199,
    gasLabel: "2M GAS/mo",
    tagline: "Scale fleets with custom domains.",
    features: [
      "2M GAS monthly allotment",
      "Custom domains & branding",
      "Priority orchestration throughput",
    ],
  },
  ENTERPRISE: {
    label: "Enterprise",
    priceMonthly: 999,
    gasLabel: "Unlimited GAS",
    tagline: "Unlimited compute with dedicated Meta-SRE.",
    features: [
      "Unlimited GAS",
      "Dedicated Meta-SRE engineer",
      "SSO / compliance packaging",
    ],
  },
} as const;
