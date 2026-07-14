"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Crown, X, Zap } from "lucide-react";
import { trackFunnelEvent } from "@/lib/analytics/funnel";

type CapacityLimitModalProps = {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
};

export default function CapacityLimitModal({
  open,
  onClose,
  onCheckout,
}: CapacityLimitModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      trackFunnelEvent({ event: "checkout_modal_open" });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#050507]/90 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="capacity-limit-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-cyan-accent/30 bg-[#0b0f17] shadow-[0_0_60px_rgba(0,242,254,0.2)]"
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-300" aria-hidden />
            <h3
              id="capacity-limit-title"
              className="font-display text-sm font-bold tracking-wide text-white"
            >
              SWARM CAPACITY LIMIT REACHED
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              trackFunnelEvent({ event: "checkout_cancel" });
              onClose();
            }}
            className="rounded-lg p-1 text-slate-muted hover:text-white"
            aria-label="Close capacity modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-relaxed text-slate-muted">
            You&apos;ve exhausted your free daily sandbox compute units.
            Upgrade to unlock continuous multi-agent orchestration with
            Stripe or BVNK crypto checkout.
          </p>

          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-slate-dim">
            HTTP 402 · PAYMENT_REQUIRED · FREE_STREAM_QUOTA
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                trackFunnelEvent({ event: "checkout_cancel" });
                onClose();
              }}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-muted transition hover:text-white"
            >
              Cancel &amp; Close
            </button>
            <button
              type="button"
              onClick={() => {
                trackFunnelEvent({ event: "checkout_proceed" });
                onCheckout();
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-accent/50 bg-cyan-accent/20 px-4 py-2.5 text-xs font-semibold text-cyan-accent shadow-[0_0_24px_rgba(0,242,254,0.35)] transition hover:bg-cyan-accent/30"
            >
              <Crown className="h-3.5 w-3.5" aria-hidden />
              Proceed to Checkout
            </button>
          </div>
        </div>
      </div>
    </div>,
    // Render inside nearest positioned ancestor when available; portal to body as fallback.
    document.body
  );
}
