import type { SubscriptionTier } from "@prisma/client";

export type TierDefinition = {
  tier: SubscriptionTier;
  label: string;
  maxAgents: number;
  monthlyPriceUsd: number;
};

export const TIER_MATRIX: Record<SubscriptionTier, TierDefinition> = {
  STARTER_5: {
    tier: "STARTER_5",
    label: "Starter",
    maxAgents: 5,
    monthlyPriceUsd: 49,
  },
  GROWTH_10: {
    tier: "GROWTH_10",
    label: "Growth",
    maxAgents: 10,
    monthlyPriceUsd: 99,
  },
  PRO_20: {
    tier: "PRO_20",
    label: "Pro",
    maxAgents: 20,
    monthlyPriceUsd: 149,
  },
  SCALE_50: {
    tier: "SCALE_50",
    label: "Scale",
    maxAgents: 50,
    monthlyPriceUsd: 299,
  },
  ENTERPRISE_100: {
    tier: "ENTERPRISE_100",
    label: "Enterprise",
    maxAgents: 100,
    monthlyPriceUsd: 499,
  },
  OVERLORD_500: {
    tier: "OVERLORD_500",
    label: "Overlord",
    maxAgents: 1100,
    monthlyPriceUsd: 1499,
  },
};

export function getMaxAgentsForTier(tier: SubscriptionTier): number {
  return TIER_MATRIX[tier].maxAgents;
}

export function syncUserTierCapacity(tier: SubscriptionTier): {
  tier: SubscriptionTier;
  maxAgents: number;
} {
  return {
    tier,
    maxAgents: getMaxAgentsForTier(tier),
  };
}
