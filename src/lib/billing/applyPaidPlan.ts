import { getPrisma } from "@/lib/prisma";
import {
  commercialPlanCapacity,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";

/**
 * Persist a paid plan onto the Neon User + Subscription records.
 * Safe no-op when userId is missing (anonymous checkout).
 */
export async function applyPaidPlanToUser(input: {
  userId?: string | null;
  email?: string | null;
  plan: CheckoutPlan;
  provider: "stripe" | "bvnk";
  externalId?: string | null;
}): Promise<{ updated: boolean; userId: string | null }> {
  const capacity = commercialPlanCapacity(input.plan);
  const prisma = getPrisma();

  let userId = input.userId?.trim() || null;

  if (!userId && input.email?.trim()) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      select: { id: true },
    });
    userId = existing?.id ?? null;
  }

  if (!userId) {
    return { updated: false, userId: null };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: capacity.plan,
      tier: capacity.tier,
      maxAgents: capacity.maxAgents,
    },
  });

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier: capacity.tier,
      maxAgents: capacity.maxAgents,
      status: `active:${input.provider}${
        input.externalId ? `:${input.externalId}` : ""
      }`,
    },
    update: {
      tier: capacity.tier,
      maxAgents: capacity.maxAgents,
      status: `active:${input.provider}${
        input.externalId ? `:${input.externalId}` : ""
      }`,
    },
  });

  return { updated: true, userId };
}
