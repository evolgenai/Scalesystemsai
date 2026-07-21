"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Fuel, X, Zap, Sparkles } from "lucide-react";
import SubscriptionPlans from "@/components/billing/SubscriptionPlans";

const STORAGE_KEY = "scalesystems.workspace.gasBalance";
const DEFAULT_BALANCE = 42_500;
const CANVAS_RUN_EVENT = "scalesystems:canvas-run";

export type GasPack = {
  id: string;
  label: string;
  priceUsd: number;
  gas: number;
  badge?: string;
};

const GAS_PACKS: GasPack[] = [
  {
    id: "starter",
    label: "Starter Burst",
    priceUsd: 10,
    gas: 100_000,
  },
  {
    id: "scale",
    label: "Scale Pack",
    priceUsd: 50,
    gas: 600_000,
    badge: "Best value",
  },
];

function formatGas(n: number): string {
  return n.toLocaleString("en-US");
}

function readBalance(): number {
  if (typeof window === "undefined") return DEFAULT_BALANCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_BALANCE;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_BALANCE;
  } catch {
    return DEFAULT_BALANCE;
  }
}

function writeBalance(n: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    /* ignore */
  }
}

type GasMeterPillProps = {
  /** Force consume pulse (e.g. live swarm stream). */
  consuming?: boolean;
  className?: string;
};

export default function GasMeterPill({
  consuming = false,
  className = "",
}: GasMeterPillProps) {
  const [balance, setBalance] = useState(DEFAULT_BALANCE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [pulseTick, setPulseTick] = useState(0);
  const [recharging, setRecharging] = useState<string | null>(null);

  const isConsuming = consuming || canvasBusy;

  useEffect(() => {
    setMounted(true);
    setBalance(readBalance());
  }, []);

  useEffect(() => {
    const onGasBalance = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === "number" && Number.isFinite(detail.balance)) {
        const next = Math.max(0, Math.floor(detail.balance));
        writeBalance(next);
        setBalance(next);
      } else {
        setBalance(readBalance());
      }
    };
    window.addEventListener("scalesystems:gas-balance", onGasBalance);
    return () =>
      window.removeEventListener("scalesystems:gas-balance", onGasBalance);
  }, []);

  useEffect(() => {
    const onCanvasRun = (event: Event) => {
      const detail = (event as CustomEvent<{ busy?: boolean }>).detail;
      setCanvasBusy(Boolean(detail?.busy));
    };
    window.addEventListener(CANVAS_RUN_EVENT, onCanvasRun);
    return () => window.removeEventListener(CANVAS_RUN_EVENT, onCanvasRun);
  }, []);

  useEffect(() => {
    if (!isConsuming) return;
    const id = window.setInterval(() => {
      setBalance((prev) => {
        const next = Math.max(0, prev - 17);
        writeBalance(next);
        return next;
      });
      setPulseTick((t) => t + 1);
    }, 900);
    return () => window.clearInterval(id);
  }, [isConsuming]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const recharge = useCallback((pack: GasPack) => {
    setRecharging(pack.id);
    window.setTimeout(() => {
      setBalance((prev) => {
        const next = prev + pack.gas;
        writeBalance(next);
        return next;
      });
      setRecharging(null);
      setDrawerOpen(false);
    }, 650);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`Workspace gas balance ${formatGas(balance)}. Open recharge.`}
        className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border border-emerald-500/25 bg-white/[0.03] px-3.5 py-2 text-xs text-slate-muted backdrop-blur-xl transition hover:border-emerald-500/45 hover:text-white ${className}`}
      >
        <AnimatePresence>
          {isConsuming ? (
            <motion.span
              key={pulseTick}
              initial={{ opacity: 0.35, scale: 0.85 }}
              animate={{ opacity: [0.35, 0.85, 0.2], scale: [0.85, 1.35, 1.6] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 rounded-xl bg-emerald-500/15"
              aria-hidden
            />
          ) : null}
        </AnimatePresence>
        <span
          className={`relative flex h-5 w-5 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 ${
            isConsuming ? "animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.45)]" : ""
          }`}
        >
          <Zap
            className={`h-3 w-3 ${isConsuming ? "text-emerald-300" : "text-emerald-400"}`}
            aria-hidden
          />
        </span>
        <span className="relative font-mono tabular-nums text-emerald-300">
          {formatGas(balance)}
        </span>
        <span className="relative font-semibold tracking-wide text-emerald-400/90">
          GAS
        </span>
      </button>

      {mounted && drawerOpen
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#050507]/90 p-4 backdrop-blur-md sm:items-center">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close recharge drawer"
                onClick={() => setDrawerOpen(false)}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="gas-recharge-title"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#09090B]/95 shadow-[0_0_48px_rgba(16,185,129,0.12)] backdrop-blur-xl"
              >
                <div className="flex items-start justify-between border-b border-white/5 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <Fuel className="h-4 w-4 text-emerald-400" aria-hidden />
                    </span>
                    <div>
                      <h3
                        id="gas-recharge-title"
                        className="font-display text-sm font-bold tracking-wide text-white"
                      >
                        Recharge Gas Credits
                      </h3>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-dim">
                        Balance · {formatGas(balance)} GAS
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 px-5 py-5">
                  <p className="text-xs leading-relaxed text-slate-muted">
                    Gas meters swarm compute, canvas simulations, and CLI deploys.
                    Pick a pack to top up this workspace instantly.
                  </p>

                  <ul className="space-y-2.5" aria-label="Gas credit packages">
                    {GAS_PACKS.map((pack) => (
                      <li key={pack.id}>
                        <button
                          type="button"
                          disabled={recharging !== null}
                          onClick={() => recharge(pack)}
                          className="group flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-left transition hover:border-emerald-500/35 hover:bg-emerald-500/[0.06] disabled:opacity-60"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-white">
                                ${pack.priceUsd}
                              </span>
                              <span className="font-mono text-xs text-emerald-400">
                                = {formatGas(pack.gas)} GAS
                              </span>
                              {pack.badge ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                                  {pack.badge}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-dim">
                              {pack.label}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition group-hover:shadow-[0_0_16px_rgba(16,185,129,0.25)]">
                            {recharging === pack.id ? "Adding…" : "Recharge"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDrawerOpen(false);
                        setPlansOpen(true);
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                    >
                      <Crown className="h-3.5 w-3.5" aria-hidden />
                      Upgrade Workspace
                    </button>
                    <p className="mt-2 text-center text-[10px] text-slate-dim">
                      Starter · Pro · Enterprise monthly plans
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>,
            document.body
          )
        : null}

      <SubscriptionPlans open={plansOpen} onClose={() => setPlansOpen(false)} />
    </>
  );
}

/** Dispatch from BlueprintCanvas while simulate/deploy is active. */
export function emitCanvasRunBusy(busy: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CANVAS_RUN_EVENT, { detail: { busy } })
  );
}
