"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2,
  Check,
  Network,
  Rocket,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import {
  requestOpenAuth,
  storePendingCheckoutPlan,
} from "@/lib/auth/pendingCheckout";
import type { CheckoutPlan } from "@/lib/billing/commercialPlans";
import { PLAN_DISPLAY } from "@/lib/billing/commercialPlans";

type PricingCard = {
  id: "STARTER" | "PREMIUM" | "ENTERPRISE";
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  featured: boolean;
  icon: typeof Zap;
};

const CARDS: PricingCard[] = [
  {
    id: "STARTER",
    name: PLAN_DISPLAY.STARTER.label,
    price: `$${PLAN_DISPLAY.STARTER.priceMonthly}`,
    cadence: "/mo",
    tagline: PLAN_DISPLAY.STARTER.tagline,
    features: [
      "1–5 parallel agent workers",
      "Router → Worker swarm routing",
      "Live dual-pane terminal",
      "Sandbox + web scrape tools",
      "Email support",
    ],
    cta: "Start building",
    featured: false,
    icon: Rocket,
  },
  {
    id: "PREMIUM",
    name: PLAN_DISPLAY.PREMIUM.label,
    price: `$${PLAN_DISPLAY.PREMIUM.priceMonthly}`,
    cadence: "/mo",
    tagline: PLAN_DISPLAY.PREMIUM.tagline,
    features: [
      "Expanded parallel swarm capacity",
      "Advanced multi-agent orchestration",
      "Automated API hooks & webhooks",
      "Priority tool throughput",
      "Faster Gemini router passes",
    ],
    cta: "Go Professional",
    featured: true,
    icon: Network,
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    tagline: "Dedicated fleets, SLAs, and security review for regulated teams.",
    features: [
      "Bespoke multi-tenant fleets",
      "Dedicated cluster endpoints",
      "Custom compliance reviews",
      "Named solutions engineer",
      "SSO / SOC 2 packaging",
    ],
    cta: "Contact us",
    featured: false,
    icon: Building2,
  },
];

export default function PricingClient() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [activeId, setActiveId] = useState<PricingCard["id"]>("PREMIUM");

  const activeCard = useMemo(
    () => CARDS.find((card) => card.id === activeId) ?? CARDS[1]!,
    [activeId]
  );

  const selectPaidPlan = (plan: CheckoutPlan) => {
    trackFunnelEvent({
      event: "pricing_tier_clicked",
      plan,
      metadata: { authenticated: Boolean(user) },
    });
    storePendingCheckoutPlan(plan);

    if (user) {
      trackFunnelEvent({
        event: "redirected_to_payment",
        plan,
        metadata: { source: "pricing_authenticated" },
      });
      router.push(`/checkout?plan=${plan}`);
      return;
    }

    trackFunnelEvent({
      event: "auth_signup_clicked",
      plan,
      metadata: { source: "pricing_card" },
    });
    requestOpenAuth({ mode: "signup", plan });
  };

  const onCta = (card: PricingCard) => {
    setActiveId(card.id);
    if (card.id === "ENTERPRISE") {
      trackFunnelEvent({
        event: "pricing_tier_clicked",
        plan: "ENTERPRISE",
      });
      router.push("/contact?plan=enterprise");
      return;
    }
    selectPaidPlan(card.id);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-obsidian text-white">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-cyan-accent/[0.09] blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[320px] w-[480px] rounded-full bg-slate-500/10 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-3 py-1 text-xs font-medium text-cyan-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Transparent capacity pricing
          </p>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            ScaleSystems{" "}
            <span className="text-gradient">swarm plans</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            Start as an individual builder, unlock parallel Professional
            workers, or design a custom Enterprise fleet — all on the same
            Obsidian runtime.
          </p>
        </header>

        <section
          className="mt-14 grid gap-5 lg:grid-cols-3"
          aria-label="Pricing tiers"
        >
          {CARDS.map((card, index) => {
            const Icon = card.icon;
            const selected = activeId === card.id;
            return (
              <motion.article
                key={card.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
                onMouseEnter={() => setActiveId(card.id)}
                className={`relative flex flex-col rounded-2xl border p-6 transition ${
                  card.featured || selected
                    ? "border-cyan-accent/50 bg-cyan-accent/[0.06] shadow-[0_0_40px_rgba(0,242,254,0.08)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                {card.featured ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-cyan-accent/40 bg-[#0b0f17] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-accent">
                    Most popular
                  </span>
                ) : null}

                <div className="mb-4 inline-flex rounded-xl bg-cyan-accent/10 p-2.5">
                  <Icon className="h-5 w-5 text-cyan-accent" aria-hidden />
                </div>
                <h2 className="font-display text-lg font-semibold text-white">
                  {card.name}
                </h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold tracking-tight">
                    {card.price}
                  </span>
                  {card.cadence ? (
                    <span className="text-sm text-slate-dim">{card.cadence}</span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-muted">
                  {card.tagline}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {card.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-slate-200"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-cyan-accent"
                        aria-hidden
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={!ready && card.id !== "ENTERPRISE"}
                  onClick={() => onCta(card)}
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    card.featured
                      ? "bg-cyan-accent text-obsidian shadow-[0_0_24px_rgba(0,242,254,0.25)] hover:brightness-110"
                      : "border border-white/15 bg-white/5 text-white hover:border-cyan-accent/40 hover:text-cyan-accent"
                  } disabled:opacity-50`}
                >
                  {card.id === "ENTERPRISE" ? (
                    <Building2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <Workflow className="h-4 w-4" aria-hidden />
                  )}
                  {card.cta}
                </button>
              </motion.article>
            );
          })}
        </section>

        <aside className="mx-auto mt-10 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <p className="text-sm text-slate-muted">
            Selected:{" "}
            <span className="font-medium text-cyan-accent">
              {activeCard.name}
            </span>
            {" — "}
            unauthenticated checkout opens the Sign Up modal, then routes to{" "}
            <code className="font-mono text-xs text-slate-200">/checkout</code>{" "}
            with your plan retained.
          </p>
          <p className="mt-3 text-sm text-slate-dim">
            Need a walkthrough?{" "}
            <Link href="/contact" className="text-cyan-accent hover:underline">
              Talk to our team
            </Link>
            .
          </p>
        </aside>
      </div>
    </main>
  );
}
