import type { CheckoutPlan } from "@/lib/billing/commercialPlans";
import { isCheckoutPlan } from "@/lib/billing/commercialPlans";

const PENDING_PLAN_KEY = "scalesystems.pendingCheckoutPlan";

export function storePendingCheckoutPlan(plan: CheckoutPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_PLAN_KEY, plan);
  } catch {
    // Private mode / blocked storage — ignore.
  }
}

export function peekPendingCheckoutPlan(): CheckoutPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_PLAN_KEY);
    if (!raw || !isCheckoutPlan(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function consumePendingCheckoutPlan(): CheckoutPlan | null {
  const plan = peekPendingCheckoutPlan();
  if (!plan) return null;
  try {
    window.sessionStorage.removeItem(PENDING_PLAN_KEY);
  } catch {
    // ignore
  }
  return plan;
}

export type OpenAuthDetail = {
  mode?: "signin" | "signup";
  plan?: CheckoutPlan;
};

export const OPEN_AUTH_EVENT = "scalesystems:open-auth";

export function requestOpenAuth(detail: OpenAuthDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenAuthDetail>(OPEN_AUTH_EVENT, { detail })
  );
}
