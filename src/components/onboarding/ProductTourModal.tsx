"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Code2,
  Fuel,
  Layers3,
  Orbit,
  UserRound,
  X,
  Zap,
} from "lucide-react";

export const PRODUCT_TOUR_STORAGE_KEY = "scalesystems.productTour.v1";

export function isProductTourComplete(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(PRODUCT_TOUR_STORAGE_KEY);
    return v === "1" || v === "skipped";
  } catch {
    return true;
  }
}

export function markProductTourComplete(status: "1" | "skipped" = "1"): void {
  try {
    window.localStorage.setItem(PRODUCT_TOUR_STORAGE_KEY, status);
    window.dispatchEvent(
      new CustomEvent("scalesystems:product-tour-complete", { detail: { status } })
    );
  } catch {
    /* ignore */
  }
}

const STEPS = [
  {
    id: "runtime",
    title: "The Obsidian Runtime",
    eyebrow: "Dual-Mode Control Plane",
    body: "Switch between User Mode for natural-language swarm launches and Developer Mode for the full Obsidian kernel — blueprints, CLI, chaos, and vault.",
    tip: "Toggle User ↔ Developer in the header anytime. Same stream, two minds.",
    icon: Layers3,
    highlight: "mode-toggle",
    bullets: [
      { icon: UserRound, label: "User Mode — digests, templates, marketplace" },
      { icon: Code2, label: "Developer Mode — canvas, MCP, SRE heal" },
    ],
  },
  {
    id: "swarm",
    title: "Visual Swarm Builder",
    eyebrow: "Drag · Drop · Wire",
    body: "Compose Router → Worker fleets on the blueprint canvas. Drag nodes, connect edges, and simulate before you burn gas.",
    tip: "Open Builder from the console nav, then drag a Worker node onto the canvas.",
    icon: Boxes,
    highlight: "builder",
    bullets: [
      { icon: Boxes, label: "Drag nodes from the palette" },
      { icon: ArrowRight, label: "Wire edges to define execution order" },
    ],
  },
  {
    id: "gas",
    title: "Gas Metering Economy",
    eyebrow: "⚡ Execution Fuel",
    body: "Every swarm run spends Gas. Creators earn a 70/30 revenue split when their marketplace agents execute — 70% to the author, 30% to the platform.",
    tip: "Watch the Gas meter pulse on each run. Recharge packs live in the header pill.",
    icon: Fuel,
    highlight: "gas-meter",
    bullets: [
      { icon: Zap, label: "Gas powers every agent execution" },
      { icon: Fuel, label: "70% creator · 30% platform on marketplace runs" },
    ],
  },
  {
    id: "spatial",
    title: "Spatial Inspection Deck",
    eyebrow: "3D WebGL Navigation",
    body: "Enter the Universe Deck to orbit your agent mesh in 3D. Pan, zoom, and inspect live nodes without leaving Obsidian glass.",
    tip: "Open Universe in the sidebar, then drag to orbit and scroll to zoom.",
    icon: Orbit,
    highlight: "universe",
    bullets: [
      { icon: Orbit, label: "Orbit · pan · zoom the agent mesh" },
      { icon: Layers3, label: "Click nodes for live inspection panels" },
    ],
  },
] as const;

type ProductTourModalProps = {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
};

export default function ProductTourModal({
  open,
  onClose,
  onComplete,
}: ProductTourModalProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markProductTourComplete("skipped");
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const finish = useCallback(
    (status: "1" | "skipped") => {
      markProductTourComplete(status);
      if (status === "1") onComplete?.();
      onClose();
    },
    [onClose, onComplete]
  );

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-4 sm:p-6"
          role="presentation"
        >
          <motion.button
            type="button"
            aria-label="Dismiss tour backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={() => finish("skipped")}
          />

          {/* Soft highlight rings for glassmorphic tooltips */}
          <motion.div
            key={`glow-${current.id}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0"
            aria-hidden
          >
            <div className="absolute left-1/2 top-[18%] h-40 w-40 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[80px]" />
            <div className="absolute bottom-[12%] right-[18%] h-32 w-48 rounded-full bg-cyan-accent/15 blur-[70px]" />
          </motion.div>

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-tour-title"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#040907]/92 shadow-[0_0_64px_rgba(16, 185, 129,0.14)] backdrop-blur-xl"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />

            <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/80">
                  Product tour · {step + 1} / {STEPS.length}
                </p>
                <h2
                  id="product-tour-title"
                  className="mt-1 font-display text-lg font-semibold text-white"
                >
                  {current.title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => finish("skipped")}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-muted transition hover:bg-white/5 hover:text-white"
                >
                  Skip Tour
                </button>
                <button
                  type="button"
                  onClick={() => finish("skipped")}
                  className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
                  aria-label="Close tour"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Progress dots */}
            <div
              className="flex items-center gap-1.5 px-5 pt-4"
              role="progressbar"
              aria-valuenow={step + 1}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-label="Tour progress"
            >
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  aria-current={i === step ? "step" : undefined}
                  className={`h-1.5 flex-1 rounded-full transition ${
                    i === step
                      ? "bg-emerald-400 shadow-[0_0_12px_rgba(16, 185, 129,0.55)]"
                      : i < step
                        ? "bg-emerald-500/45"
                        : "bg-white/10"
                  }`}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.22 }}
                className="space-y-4 px-5 py-5"
              >
                <div className="flex items-start gap-4">
                  <div className="inline-flex shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-[0_0_24px_rgba(16, 185, 129,0.12)]">
                    <Icon className="h-6 w-6 text-emerald-400" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">
                      {current.eyebrow}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-muted">
                      {current.body}
                    </p>
                  </div>
                </div>

                <ul className="space-y-2">
                  {current.bullets.map((b) => (
                    <li
                      key={b.label}
                      className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                    >
                      <b.icon
                        className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                        aria-hidden
                      />
                      <span className="text-xs text-white/90">{b.label}</span>
                    </li>
                  ))}
                </ul>

                {/* Glassmorphic highlight tooltip */}
                <div
                  className="relative overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(16, 185, 129,0.15)] backdrop-blur-sm"
                  data-tour-highlight={current.highlight}
                >
                  <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-400/20 blur-2xl" />
                  <p className="relative text-[11px] font-medium leading-relaxed text-emerald-100/90">
                    <span className="mr-1.5 inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                      Tip
                    </span>
                    {current.tip}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>

            <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-muted transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Back
              </button>

              {isLast ? (
                <button
                  type="button"
                  onClick={() => finish("1")}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_24px_rgba(16, 185, 129,0.35)] transition hover:bg-emerald-400"
                >
                  Launch Console
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_24px_rgba(16, 185, 129,0.35)] transition hover:bg-emerald-400"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
