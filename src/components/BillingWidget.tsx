"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Coins,
  Loader2,
  Zap,
  Sparkles,
  Settings2,
  Crown,
} from "lucide-react";
import {
  createCheckoutSession,
  createStripePortalSession,
} from "@/app/actions/stripe";
import { prepareCryptoPaymentIntent } from "@/app/actions/crypto";
import type { FiatCurrency } from "@/types/bvnk";
import {
  formatPlanLabel,
  isPaidPlan,
  PLAN_MONTHLY_USD,
  type PaidCheckoutTier,
  type PlanTier,
} from "@/lib/plans";

export type BillingWidgetProps = {
  userId: string;
  currentPlan: PlanTier | string;
  cryptoCurrency?: FiatCurrency;
  hasStripeCustomer?: boolean;
};

type PaymentRail = "card" | "crypto";

function normalizePlan(plan: PlanTier | string): PlanTier {
  const value = plan.toString().toUpperCase();
  if (
    value === "FREE" ||
    value === "STARTER" ||
    value === "PREMIUM" ||
    value === "ENTERPRISE"
  ) {
    return value;
  }
  return "FREE";
}

export default function BillingWidget({
  userId,
  currentPlan,
  cryptoCurrency = "USD",
  hasStripeCustomer = false,
}: BillingWidgetProps) {
  const [rail, setRail] = useState<PaymentRail>("card");
  const [checkoutPlan, setCheckoutPlan] = useState<PaidCheckoutTier>("STARTER");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const plan = normalizePlan(currentPlan);
  const paid = isPaidPlan(plan);
  const planLabel = formatPlanLabel(plan);

  function handleCardCheckout() {
    setError("");
    startTransition(async () => {
      const result = await createCheckoutSession(userId, checkoutPlan);

      if (!result.success) {
        setError(result.error);
        return;
      }

      window.location.href = result.url;
    });
  }

  function handleManageSubscription() {
    setError("");
    startTransition(async () => {
      const result = await createStripePortalSession(userId);

      if (!result.success) {
        setError(result.error);
        return;
      }

      window.location.href = result.url;
    });
  }

  function handleCryptoCheckout() {
    setError("");
    const amount = PLAN_MONTHLY_USD[checkoutPlan] ?? 49;
    startTransition(async () => {
      const result = await prepareCryptoPaymentIntent(
        amount,
        userId,
        cryptoCurrency
      );

      if (!result.success) {
        setError(result.error);
        return;
      }

      window.location.href = result.redirectUrl;
    });
  }

  return (
    <section className="glass overflow-hidden rounded-2xl border border-white/10">
      <div className="border-b border-white/10 bg-black/30 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">
              Billing & Subscription
            </h3>
            <p className="mt-1 text-xs text-slate-muted">
              Stripe card billing, BVNK crypto rail, and live plan sync
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
              paid
                ? "border-cyan-accent/30 bg-cyan-accent/10 text-cyan-accent"
                : "border-white/10 bg-white/5 text-slate-muted"
            }`}
          >
            {paid && <Crown className="h-3 w-3" aria-hidden />}
            {planLabel}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-5 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-slate-muted">
          <p>
            Current tier:{" "}
            <span className="font-mono text-cyan-accent">{plan}</span>
          </p>
          <p className="mt-1">
            {plan === "FREE" &&
              "1 active agent · 50,000 tokens/mo"}
            {plan === "STARTER" &&
              "5 concurrent agents · 500,000 tokens/mo"}
            {(plan === "PREMIUM" || plan === "ENTERPRISE") &&
              "Unlimited agent nodes · Unlimited compute quota"}
          </p>
        </div>

        {paid && hasStripeCustomer && (
          <button
            type="button"
            onClick={handleManageSubscription}
            disabled={isPending}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-cyan-accent/40 hover:text-cyan-accent disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Opening portal...
              </>
            ) : (
              <>
                <Settings2 className="h-4 w-4" aria-hidden />
                Manage Subscription
              </>
            )}
          </button>
        )}

        {!paid && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium text-slate-muted">
              Select upgrade tier
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["STARTER", "PREMIUM"] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setCheckoutPlan(tier)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    checkoutPlan === tier
                      ? "border-cyan-accent/50 bg-cyan-accent/10 text-cyan-accent"
                      : "border-white/10 text-slate-muted hover:text-white"
                  }`}
                >
                  {formatPlanLabel(tier)} · ${PLAN_MONTHLY_USD[tier]}/mo
                </button>
              ))}
            </div>
          </div>
        )}

        {!paid && (
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setRail("card")}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                rail === "card"
                  ? "bg-cyan-accent text-obsidian shadow-glow-sm"
                  : "text-slate-muted hover:text-white"
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden />
              Pay with Card
            </button>
            <button
              type="button"
              onClick={() => setRail("crypto")}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                rail === "crypto"
                  ? "bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.25)]"
                  : "text-slate-muted hover:text-white"
              }`}
            >
              <Coins className="h-3.5 w-3.5" aria-hidden />
              Pay with Crypto
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!paid && rail === "card" ? (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="rounded-xl border border-cyan-accent/20 bg-cyan-accent/5 p-4">
                <div className="flex items-start gap-3">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-cyan-accent" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-white">
                      Upgrade to {formatPlanLabel(checkoutPlan)}
                    </p>
                    <p className="mt-1 text-xs text-slate-muted">
                      ${PLAN_MONTHLY_USD[checkoutPlan]}/mo via Stripe (
                      {checkoutPlan === "STARTER"
                        ? "STRIPE_STARTER_PRICE_ID"
                        : "STRIPE_PREMIUM_PRICE_ID"}
                      ).
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCardCheckout}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-accent px-4 py-3 text-sm font-bold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Redirecting to Stripe...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" aria-hidden />
                    Pay with Card (Stripe)
                  </>
                )}
              </button>
            </motion.div>
          ) : !paid ? (
            <motion.div
              key="crypto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-white">
                      BVNK Stablecoin Checkout
                    </p>
                    <p className="mt-1 text-xs text-slate-muted">
                      Pay ${PLAN_MONTHLY_USD[checkoutPlan]} {cryptoCurrency} via
                      BVNK hosted checkout. Webhook sync upgrades your plan
                      automatically.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCryptoCheckout}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-bold text-purple-300 transition-colors hover:border-purple-400/50 hover:bg-purple-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Opening BVNK checkout...
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4" aria-hidden />
                    Pay with Crypto (BVNK)
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200"
            >
              Your {planLabel} subscription is active. Agent quota limits have
              been expanded for your workspace.
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
