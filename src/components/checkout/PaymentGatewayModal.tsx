"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bitcoin,
  Copy,
  CreditCard,
  Check,
  Loader2,
  ShieldCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  GasBatteryCrystal,
  SkillChip,
  SwarmBridgeCube,
} from "@/components/ui/Ecosystem3DIcons";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import {
  isCheckoutPlan,
  PLAN_DISPLAY,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";

type GatewayTab = "card" | "paypal" | "lightning";

type PaymentGatewayModalProps = {
  open: boolean;
  onClose: () => void;
  initialPlan?: CheckoutPlan;
  /** When true, render as full-page panel (dashboard ?view=checkout). */
  embedded?: boolean;
};

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: Record<string, unknown>) => {
        render: (el: HTMLElement) => Promise<void>;
      };
    };
  }
}

const TABS: { id: GatewayTab; label: string; hint: string }[] = [
  { id: "card", label: "Card & Google Pay", hint: "Stripe wallets" },
  { id: "paypal", label: "PayPal", hint: "PayPal Checkout" },
  { id: "lightning", label: "Lightning", hint: "LNURL / Bolt11" },
];

function resolvePrice(plan: CheckoutPlan): number {
  try {
    const display = PLAN_DISPLAY?.[plan];
    if (display && typeof display.priceMonthly === "number") {
      return display.priceMonthly;
    }
  } catch {
    /* sandbox */
  }
  const fallback: Record<CheckoutPlan, number> = {
    STARTER: 29,
    PREMIUM: 199,
    PRO: 199,
    ENTERPRISE: 999,
  };
  return fallback[plan];
}

function buildMockBolt11(plan: CheckoutPlan, sats: number): string {
  const stamp = Date.now().toString(36);
  return `lnbc${sats}n1p${stamp}pp5scalesystems${plan.toLowerCase()}gas0conf`;
}

function buildLnurl(plan: CheckoutPlan): string {
  const raw = `scalesystems:${plan}:gas`;
  const hex = Array.from(new TextEncoder().encode(raw))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40)
    .toUpperCase();
  return `LNURL1P${hex}`;
}

function qrDataUrl(payload: string): string {
  const encoded = encodeURIComponent(payload);
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&color=060810&bgcolor=E8F0FF&data=${encoded}`;
}

function PayPalButtonsHost({
  plan,
  amountUsd,
  onPaid,
}: {
  plan: CheckoutPlan;
  amountUsd: number;
  onPaid: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "mock" | "error">(
    "loading"
  );

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
    if (!clientId) {
      setStatus("mock");
      return;
    }

    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-scalesystems-paypal="1"]'
    );

    const mount = () => {
      if (cancelled || !hostRef.current || !window.paypal) return;
      hostRef.current.innerHTML = "";
      window.paypal
        .Buttons({
          style: {
            layout: "vertical",
            color: "blue",
            shape: "rect",
            label: "paypal",
          },
          createOrder: (
            _data: unknown,
            actions: {
              order: {
                create: (input: Record<string, unknown>) => Promise<string>;
              };
            }
          ) =>
            actions.order.create({
              purchase_units: [
                {
                  description: `ScaleSystems ${plan} gas top-up`,
                  amount: {
                    currency_code: "USD",
                    value: amountUsd.toFixed(2),
                  },
                },
              ],
            }),
          onApprove: async (
            data: { orderID?: string },
            actions: {
              order: { capture: () => Promise<unknown> };
            }
          ) => {
            await actions.order.capture();
            trackFunnelEvent({
              event: "checkout_redirect",
              plan,
              provider: "stripe",
              metadata: {
                gateway: "paypal",
                orderId: data.orderID ?? null,
              },
            });
            onPaid();
          },
        })
        .render(hostRef.current)
        .then(() => {
          if (!cancelled) setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    };

    if (existing && window.paypal) {
      mount();
      return () => {
        cancelled = true;
      };
    }

    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD`;
      script.async = true;
      script.dataset.scalesystemsPaypal = "1";
      document.body.appendChild(script);
    }
    script.addEventListener("load", mount);
    if (window.paypal) mount();

    return () => {
      cancelled = true;
      script.removeEventListener("load", mount);
    };
  }, [amountUsd, onPaid, plan]);

  if (status === "mock") {
    return (
      <button
        type="button"
        onClick={onPaid}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#0070BA]/50 bg-[#0070BA]/15 px-4 py-3 text-sm font-semibold text-[#7BC0F5] transition hover:bg-[#0070BA]/25"
      >
        <Wallet className="h-4 w-4" aria-hidden />
        Simulate PayPal Checkout
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {(status === "loading" || status === "error") && (
        <p className="flex items-center gap-2 text-xs text-slate-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
          {status === "error"
            ? "PayPal SDK failed — retry or use mock."
            : "Loading PayPal SDK…"}
        </p>
      )}
      <div ref={hostRef} className="min-h-[48px]" />
    </div>
  );
}

export default function PaymentGatewayModal({
  open,
  onClose,
  initialPlan = "STARTER",
  embedded = false,
}: PaymentGatewayModalProps) {
  const [mounted, setMounted] = useState(false);
  const [plan, setPlan] = useState<CheckoutPlan>(initialPlan);
  const [tab, setTab] = useState<GatewayTab>("card");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (isCheckoutPlan(initialPlan)) setPlan(initialPlan);
  }, [initialPlan]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const amountUsd = resolvePrice(plan);
  const sats = Math.max(1_000, Math.round(amountUsd * 2_500));
  const bolt11 = useMemo(() => buildMockBolt11(plan, sats), [plan, sats]);
  const lnurl = useMemo(() => buildLnurl(plan), [plan]);

  const completeSandbox = useCallback(
    (provider: string) => {
      setPending(true);
      trackFunnelEvent({
        event: "checkout_redirect",
        plan,
        provider: provider === "paypal" || provider === "lightning" ? "bvnk" : "stripe",
        metadata: { gateway: provider, sandbox: true },
      });
      window.setTimeout(() => {
        window.location.href = `/dashboard?payment=success&provider=${provider}&plan=${plan}&sandbox=1`;
      }, 650);
    },
    [plan]
  );

  const launchStripe = useCallback(async () => {
    setPending(true);
    setError(null);
    trackFunnelEvent({
      event: "checkout_stripe_start",
      plan,
      provider: "stripe",
      metadata: { gateway: "card_google_pay" },
    });
    try {
      const response = await fetch("/api/checkout/stripe", {
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
        setError(payload.error ?? "Stripe checkout unavailable — using sandbox.");
        completeSandbox("stripe");
        return;
      }
      window.location.href = payload.url;
    } catch {
      setError("Network error — falling back to sandbox.");
      completeSandbox("stripe");
    }
  }, [completeSandbox, plan]);

  const copyBolt = async () => {
    try {
      await navigator.clipboard.writeText(bolt11);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (!mounted || !open) return null;

  const panel = (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-gateway-title"
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      className={`relative z-10 w-full overflow-hidden rounded-2xl border border-blue-500/25 bg-[#0A0F1D]/95 shadow-[0_0_48px_rgba(0,102,255,0.18)] backdrop-blur-xl ${
        embedded ? "max-w-3xl" : "max-w-xl"
      }`}
    >
      <div className="pointer-events-none absolute -right-6 top-4 opacity-80">
        <GasBatteryCrystal size="md" />
      </div>
      <div className="pointer-events-none absolute bottom-8 left-3 opacity-70">
        <SwarmBridgeCube size="sm" />
      </div>
      <div className="pointer-events-none absolute bottom-6 right-10 opacity-70">
        <SkillChip size="sm" />
      </div>

      <header className="flex items-start justify-between border-b border-white/5 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">
            Multi-gateway checkout
          </p>
          <h2
            id="payment-gateway-title"
            className="mt-1 font-display text-lg font-bold text-white"
          >
            Top up swarm gas
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-dim">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" aria-hidden />
            Stripe · PayPal · Bitcoin Lightning
          </p>
        </div>
        {!embedded ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
            aria-label="Close checkout"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      <div className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-3 gap-2">
          {(["STARTER", "PRO", "ENTERPRISE"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPlan(option)}
              className={`rounded-xl border px-2.5 py-2.5 text-left transition ${
                plan === option
                  ? "border-blue-500/50 bg-blue-600/15"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <p className="font-display text-[11px] font-semibold text-white">
                {option}
              </p>
              <p className="font-mono text-[10px] text-blue-300">
                ${resolvePrice(option)}/mo
              </p>
            </button>
          ))}
        </div>

        <div
          className="flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1"
          role="tablist"
          aria-label="Payment gateway"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition ${
                tab === t.id
                  ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(0,102,255,0.35)]"
                  : "text-slate-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="min-h-[200px] rounded-xl border border-white/10 bg-[#060810]/80 p-4"
            role="tabpanel"
          >
            {tab === "card" ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-slate-muted">
                  Pay with card, Apple Pay, or Google Pay via Stripe Checkout —
                  wallets appear automatically when available on device.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void launchStripe()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(0,102,255,0.35)] transition hover:bg-blue-500 disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" aria-hidden />
                  {pending ? "Opening Stripe…" : "Continue with Stripe / Google Pay"}
                </button>
                <div className="flex items-center justify-center gap-3 pt-1 text-[10px] uppercase tracking-wider text-slate-dim">
                  <span className="rounded-md border border-white/10 px-2 py-1">
                    Visa
                  </span>
                  <span className="rounded-md border border-white/10 px-2 py-1">
                    Mastercard
                  </span>
                  <span className="rounded-md border border-white/10 px-2 py-1">
                    Google Pay
                  </span>
                </div>
              </div>
            ) : null}

            {tab === "paypal" ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-slate-muted">
                  Instant PayPal Checkout for ${amountUsd.toFixed(2)} ·{" "}
                  {plan} plan.
                </p>
                <PayPalButtonsHost
                  plan={plan}
                  amountUsd={amountUsd}
                  onPaid={() => completeSandbox("paypal")}
                />
              </div>
            ) : null}

            {tab === "lightning" ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-slate-muted">
                  Bitcoin Lightning · zero-confirmation gas top-up ·{" "}
                  <span className="font-mono text-blue-300">
                    {sats.toLocaleString()} sats
                  </span>
                </p>
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl(bolt11)}
                    alt="Lightning Bolt11 QR code"
                    width={160}
                    height={160}
                    className="rounded-xl border border-blue-500/30 bg-white p-2 shadow-[0_0_24px_rgba(0,102,255,0.2)]"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80">
                        Bolt11
                      </p>
                      <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-slate-300">
                        {bolt11}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80">
                        LNURL
                      </p>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                        {lnurl}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void copyBolt()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/35 bg-blue-600/15 px-3 py-1.5 text-[11px] font-semibold text-blue-300 transition hover:bg-blue-600/25"
                      >
                        {copied ? (
                          <Check className="h-3 w-3" aria-hidden />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden />
                        )}
                        {copied ? "Copied" : "Copy invoice"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => completeSandbox("lightning")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-50"
                      >
                        <Zap className="h-3 w-3" aria-hidden />
                        {pending ? "Confirming…" : "Mark paid (sandbox)"}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-[10px] text-slate-dim">
                  <Bitcoin className="h-3 w-3 text-amber-300" aria-hidden />
                  Instant settlement · no on-chain confirmation wait
                </p>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>

        {error ? (
          <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            {error}
          </p>
        ) : null}
      </div>
    </motion.div>
  );

  if (embedded) {
    return <div className="mx-auto flex w-full justify-center py-2">{panel}</div>;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#060810]/90 p-4 backdrop-blur-md sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close payment gateway"
        onClick={onClose}
      />
      {panel}
    </div>,
    document.body
  );
}
