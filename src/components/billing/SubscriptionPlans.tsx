"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Crown,
  Loader2,
  Rocket,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import {
  isCheckoutPlan,
  type CheckoutPlan,
  WORKSPACE_PLAN_DISPLAY,
} from "@/lib/billing/commercialPlans";

export type WorkspacePlanId = "STARTER" | "PRO" | "ENTERPRISE";

type SubscriptionPlansProps = {
  /** Modal overlay mode (Gas drawer / Upgrade CTA). */
  open?: boolean;
  onClose?: () => void;
  /** Inline panel (billing view). */
  embedded?: boolean;
  className?: string;
};

const PLAN_ICONS = {
  STARTER: Rocket,
  PRO: Zap,
  ENTERPRISE: Building2,
} as const;

function planToCheckout(plan: WorkspacePlanId): CheckoutPlan | null {
  if (plan === "STARTER") return "STARTER";
  if (plan === "PRO") return "PRO";
  if (plan === "ENTERPRISE") return "ENTERPRISE";
  return null;
}

export default function SubscriptionPlans({
  open = true,
  onClose,
  embedded = false,
  className = "",
}: SubscriptionPlansProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<WorkspacePlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, embedded, onClose]);

  const launchCheckout = async (planId: WorkspacePlanId) => {
    const checkoutPlan = planToCheckout(planId);
    if (!checkoutPlan || !isCheckoutPlan(checkoutPlan)) {
      trackFunnelEvent({
        event: "pricing_tier_clicked",
        plan: "ENTERPRISE",
        metadata: { source: "subscription_plans" },
      });
      router.push("/contact?intent=enterprise");
      onClose?.();
      return;
    }

    setPending(planId);
    setError(null);
    trackFunnelEvent({
      event: "checkout_stripe_start",
      plan: checkoutPlan,
      provider: "stripe",
      metadata: { source: "subscription_plans" },
    });

    try {
      const response = await fetch("/api/checkout/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: checkoutPlan }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        url?: string;
        error?: string;
        mock?: boolean;
      };

      if (response.ok && payload.success && payload.url) {
        trackFunnelEvent({
          event: "checkout_redirect",
          plan: checkoutPlan,
          provider: "stripe",
          metadata: { mock: Boolean(payload.mock) },
        });
        window.location.assign(payload.url);
        return;
      }

      // Fallback: dedicated checkout page.
      router.push(`/checkout?plan=${checkoutPlan}`);
      onClose?.();
    } catch {
      setError("Unable to start checkout. Opening the billing page…");
      window.setTimeout(() => {
        router.push(`/checkout?plan=${checkoutPlan}`);
        onClose?.();
      }, 600);
    } finally {
      setPending(null);
    }
  };

  const panel = (
    <div
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#09090B]/95 shadow-[0_0_48px_rgba(16,185,129,0.12)] backdrop-blur-xl ${className}`}
    >
      <div className="flex items-start justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <Crown className="h-4 w-4 text-emerald-400" aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold tracking-wide text-white">
              Upgrade Workspace
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-dim">
              Pick a GAS allotment · Stripe subscription checkout
            </p>
          </div>
        </div>
        {onClose && !embedded ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
            aria-label="Close plans"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-3 px-5 py-5">
        {(Object.keys(WORKSPACE_PLAN_DISPLAY) as WorkspacePlanId[]).map(
          (id) => {
            const plan = WORKSPACE_PLAN_DISPLAY[id];
            const Icon = PLAN_ICONS[id];
            const featured = id === "PRO";
            return (
              <button
                key={id}
                type="button"
                disabled={pending !== null}
                onClick={() => void launchCheckout(id)}
                className={`group flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-4 text-left transition disabled:opacity-60 ${
                  featured
                    ? "border-emerald-500/40 bg-emerald-500/[0.08] hover:border-emerald-400/55"
                    : "border-white/5 bg-white/[0.03] hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
                      <Icon className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {plan.label}
                    </span>
                    <span className="font-mono text-sm text-emerald-300">
                      ${plan.priceMonthly}
                      <span className="text-[11px] text-slate-dim">/mo</span>
                    </span>
                    {featured ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                        <Sparkles className="h-2.5 w-2.5" aria-hidden />
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-dim">
                    {plan.gasLabel} · {plan.tagline}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-1.5 text-[11px] text-slate-muted"
                      >
                        <Check
                          className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400"
                          aria-hidden
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition group-hover:shadow-[0_0_16px_rgba(16,185,129,0.25)]">
                  {pending === id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : id === "ENTERPRISE" ? (
                    "Contact / Checkout"
                  ) : (
                    "Upgrade"
                  )}
                </span>
              </button>
            );
          }
        )}

        {error ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (embedded) {
    return <div className="mx-auto w-full max-w-2xl">{panel}</div>;
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-[#050507]/90 p-4 backdrop-blur-md sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close upgrade plans"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-workspace-title"
        className="relative z-10 w-full max-w-lg"
      >
        <span id="upgrade-workspace-title" className="sr-only">
          Upgrade Workspace
        </span>
        {panel}
      </div>
    </div>,
    document.body
  );
}
