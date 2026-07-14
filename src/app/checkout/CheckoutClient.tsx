"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bitcoin, CreditCard, ShieldCheck } from "lucide-react";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import {
  isCheckoutPlan,
  PLAN_DISPLAY,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";

function CheckoutInner() {
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<CheckoutPlan>("STARTER");
  const [pending, setPending] = useState<"stripe" | "bvnk" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get("plan")?.toUpperCase() ?? "";
    if (isCheckoutPlan(fromQuery)) {
      setPlan(fromQuery);
      trackFunnelEvent({
        event: "checkout_proceed",
        plan: fromQuery,
        metadata: { source: "query" },
      });
    }
  }, [searchParams]);

  const launchCheckout = async (provider: "stripe" | "bvnk") => {
    setPending(provider);
    setError(null);
    trackFunnelEvent({
      event:
        provider === "stripe" ? "checkout_stripe_start" : "checkout_bvnk_start",
      plan,
      provider,
    });

    try {
      const response = await fetch(`/api/checkout/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.url) {
        setError(payload.error ?? "Checkout failed.");
        setPending(null);
        return;
      }
      trackFunnelEvent({
        event: "checkout_redirect",
        plan,
        provider,
      });
      trackFunnelEvent({
        event: "redirected_to_payment",
        plan,
        provider,
        metadata: { source: "checkout_client" },
      });
      window.location.href = payload.url;
    } catch {
      setError("Network error launching checkout.");
      setPending(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-4 text-white">
      <div className="mb-8 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-cyan-accent">
          Secure checkout
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Unlock ScaleSystems Swarm Capacity
        </h1>
        <p className="text-sm text-slate-muted">
          Continue with Stripe card billing or BVNK sandbox crypto rails.
          Successful payments redirect back to your dashboard.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {(["STARTER", "PREMIUM"] as const).map((option) => {
          const display = PLAN_DISPLAY[option];
          return (
            <button
              key={option}
              type="button"
              onClick={() => setPlan(option)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                plan === option
                  ? "border-cyan-accent/50 bg-cyan-accent/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <p className="font-display text-sm font-semibold text-white">
                {display.label} · ${display.priceMonthly}/mo
              </p>
              <p className="mt-1 text-xs text-slate-dim">{display.tagline}</p>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0b0f17] p-5">
        <div className="flex items-center gap-2 text-xs text-slate-dim">
          <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
          Encrypted checkout sessions · webhook-verified plan upgrades
        </div>

        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void launchCheckout("stripe")}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-accent/40 bg-cyan-accent/15 px-4 py-3 text-sm font-semibold text-cyan-accent shadow-[0_0_24px_rgba(0,242,254,0.2)] transition hover:bg-cyan-accent/25 disabled:opacity-50"
        >
          <CreditCard className="h-4 w-4" aria-hidden />
          {pending === "stripe" ? "Redirecting to Stripe…" : "Pay with Stripe"}
        </button>

        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void launchCheckout("bvnk")}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-amber-300/40 hover:text-amber-200 disabled:opacity-50"
        >
          <Bitcoin className="h-4 w-4" aria-hidden />
          {pending === "bvnk"
            ? "Redirecting to BVNK…"
            : "Pay with BVNK Crypto"}
        </button>

        {error ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function CheckoutClient() {
  return (
    <Suspense
      fallback={
        <div className="py-10 text-slate-dim">Loading checkout…</div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
