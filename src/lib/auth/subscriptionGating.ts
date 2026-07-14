import type { RequestUserProfile } from "@/lib/auth/requestUser";
import {
  normalizeCommercialPlan,
  type CommercialPlan,
} from "@/lib/billing/commercialPlans";

export type StreamGateDecision =
  | { allowed: true; plan: CommercialPlan; remaining: number | null }
  | {
      allowed: false;
      status: 402;
      plan: CommercialPlan;
      used: number;
      limit: number;
      code: "PAYMENT_REQUIRED";
      message: string;
      upgradePath: string;
    };

const FREE_STREAM_LIMIT = Number(process.env.FREE_STREAM_QUOTA ?? "3");

type QuotaBucket = {
  used: number;
  windowStartedAt: number;
};

const globalQuota = globalThis as unknown as {
  __scaleStreamQuota?: Map<string, QuotaBucket>;
};

function quotaStore(): Map<string, QuotaBucket> {
  if (!globalQuota.__scaleStreamQuota) {
    globalQuota.__scaleStreamQuota = new Map();
  }
  return globalQuota.__scaleStreamQuota;
}

function quotaKey(profile: RequestUserProfile): string {
  return (
    profile.id ||
    profile.email ||
    `anon:${profile.tier}:${profile.role}`
  );
}

function getPlan(profile: RequestUserProfile): CommercialPlan {
  return normalizeCommercialPlan(profile.plan);
}

/**
 * Determine whether the caller may open an agent stream channel.
 * FREE plans are hard-capped; paid + SUPER_ADMIN bypass usage quotas.
 */
export function evaluateStreamAccess(
  profile: RequestUserProfile,
  options?: { consume?: boolean; forceExceeded?: boolean }
): StreamGateDecision {
  const plan = getPlan(profile);
  const consume = options?.consume !== false;

  if (profile.isSuperAdmin || profile.role === "SUPER_ADMIN") {
    return { allowed: true, plan, remaining: null };
  }

  if (plan !== "FREE") {
    return { allowed: true, plan, remaining: null };
  }

  const limit = Number.isFinite(FREE_STREAM_LIMIT)
    ? Math.max(0, FREE_STREAM_LIMIT)
    : 3;
  const store = quotaStore();
  const key = quotaKey(profile);
  const current = store.get(key) ?? { used: 0, windowStartedAt: Date.now() };

  if (options?.forceExceeded || current.used >= limit) {
    return {
      allowed: false,
      status: 402,
      plan,
      used: Math.max(current.used, limit),
      limit,
      code: "PAYMENT_REQUIRED",
      message:
        "Free plan stream quota exceeded. Upgrade to STARTER or PREMIUM to continue.",
      upgradePath: "/api/checkout/stripe",
    };
  }

  if (consume) {
    const next = { ...current, used: current.used + 1 };
    store.set(key, next);
    return {
      allowed: true,
      plan,
      remaining: Math.max(0, limit - next.used),
    };
  }

  return {
    allowed: true,
    plan,
    remaining: Math.max(0, limit - current.used),
  };
}

export function resetStreamQuotaForUser(profile: RequestUserProfile): void {
  quotaStore().delete(quotaKey(profile));
}
