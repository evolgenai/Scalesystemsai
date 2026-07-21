"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Fuel,
  Globe,
  LayoutTemplate,
  Radar,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";

export const ONBOARDING_STORAGE_KEY = "scalesystems.onboarding.v1";
export const TENANT_STORAGE_KEY = "scalesystems.workspace.tenant";
export const GAS_BALANCE_KEY = "scalesystems.workspace.gasBalance";
export const FREE_GAS_CREDITS = 50_000;

export type BlueprintTemplateId =
  | "ecom-scraper"
  | "sre-monitor"
  | "content-swarm";

export type OnboardingTenant = {
  name: string;
  slug: string;
  template: BlueprintTemplateId;
  gasClaimed: number;
  completedAt: string;
};

const TEMPLATES: {
  id: BlueprintTemplateId;
  title: string;
  blurb: string;
  icon: typeof ShoppingCart;
}[] = [
  {
    id: "ecom-scraper",
    title: "E-Com Scraper",
    blurb: "Price watch · catalog extract · competitor intel",
    icon: ShoppingCart,
  },
  {
    id: "sre-monitor",
    title: "SRE Monitor",
    blurb: "Latency sparks · heal loops · Discord alerts",
    icon: Radar,
  },
  {
    id: "content-swarm",
    title: "Content Swarm",
    blurb: "Router → writers · parallel draft channels",
    icon: LayoutTemplate,
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return v === "1" || v === "skipped";
  } catch {
    return true;
  }
}

export function dismissOnboardingPermanently(): void {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "skipped");
  } catch {
    /* ignore */
  }
}

export function markOnboardingComplete(tenant: OnboardingTenant): void {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(tenant));
    window.localStorage.setItem(GAS_BALANCE_KEY, String(tenant.gasClaimed));
    window.dispatchEvent(
      new CustomEvent("scalesystems:onboarding-complete", { detail: tenant })
    );
    window.dispatchEvent(
      new CustomEvent("scalesystems:gas-balance", {
        detail: { balance: tenant.gasClaimed },
      })
    );
  } catch {
    /* ignore */
  }
}

type OnboardingWizardProps = {
  open: boolean;
  onClose: () => void;
  onComplete?: (tenant: OnboardingTenant) => void;
};

export default function OnboardingWizard({
  open,
  onClose,
  onComplete,
}: OnboardingWizardProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Meerendal Wine Estate");
  const [slug, setSlug] = useState("meerendal-wine-estate");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] =
    useState<BlueprintTemplateId>("ecom-scraper");
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setClaiming(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const nameValid = name.trim().length >= 2;
  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2;

  const canNext = useMemo(() => {
    if (step === 1) return nameValid && slugValid;
    if (step === 2) return Boolean(template);
    return true;
  }, [step, nameValid, slugValid, template]);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!slugTouched) setSlug(slugify(value) || "workspace");
    },
    [slugTouched]
  );

  const finish = useCallback(() => {
    setClaiming(true);
    const tenant: OnboardingTenant = {
      name: name.trim(),
      slug,
      template,
      gasClaimed: FREE_GAS_CREDITS,
      completedAt: new Date().toISOString(),
    };
    window.setTimeout(() => {
      markOnboardingComplete(tenant);
      setClaiming(false);
      onComplete?.(tenant);
      onClose();
    }, 650);
  }, [name, slug, template, onComplete, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end" role="presentation">
          <motion.button
            type="button"
            aria-label="Close onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#040907]/95 shadow-[0_0_64px_rgba(16, 185, 129,0.12)] backdrop-blur-xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
                  Workspace onboarding
                </p>
                <h2
                  id="onboarding-title"
                  className="mt-1 font-display text-lg font-semibold text-white"
                >
                  Provision your tenant
                </h2>
                <p className="mt-1 font-mono text-[11px] text-slate-dim">
                  Step {step} of 3
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 p-2 text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="px-5 pt-4">
              <div className="flex gap-1.5" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className={`h-1 flex-1 rounded-full transition ${
                      n <= step ? "bg-emerald-600" : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6">
              <AnimatePresence mode="wait">
                {step === 1 ? (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="space-y-5"
                  >
                    <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
                      <Globe className="h-3.5 w-3.5" aria-hidden />
                      Workspace identity
                    </div>
                    <label className="block space-y-2">
                      <span className="text-xs font-medium text-slate-muted">
                        Workspace name
                      </span>
                      <input
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="Meerendal Wine Estate"
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-dim focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30"
                        autoFocus
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-xs font-medium text-slate-muted">
                        Slug
                      </span>
                      <div className="flex overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-emerald-500/40 focus-within:ring-1 focus-within:ring-emerald-500/30">
                        <span className="border-r border-white/10 px-3 py-3 font-mono text-xs text-slate-dim">
                          /
                        </span>
                        <input
                          value={slug}
                          onChange={(e) => {
                            setSlugTouched(true);
                            setSlug(slugify(e.target.value));
                          }}
                          className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-sm text-emerald-300 outline-none"
                        />
                      </div>
                      {!slugValid ? (
                        <p className="text-[11px] text-amber-400">
                          Use lowercase letters, numbers, and hyphens.
                        </p>
                      ) : null}
                    </label>
                  </motion.div>
                ) : null}

                {step === 2 ? (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="space-y-4"
                  >
                    <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
                      <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
                      Initial template blueprint
                    </div>
                    <div className="space-y-2.5" role="radiogroup" aria-label="Template">
                      {TEMPLATES.map((t) => {
                        const selected = template === t.id;
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setTemplate(t.id)}
                            className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3.5 text-left transition ${
                              selected
                                ? "border-emerald-500/45 bg-emerald-500/[0.08] shadow-[0_0_24px_rgba(16, 185, 129,0.12)]"
                                : "border-white/10 bg-white/[0.03] hover:border-emerald-500/25"
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                selected
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                                  : "border-white/10 bg-black/40 text-slate-muted"
                              }`}
                            >
                              <Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-white">
                                {t.title}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-muted">
                                {t.blurb}
                              </span>
                            </span>
                            {selected ? (
                              <CheckCircle2
                                className="h-4 w-4 shrink-0 text-emerald-400"
                                aria-hidden
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : null}

                {step === 3 ? (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="space-y-5"
                  >
                    <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
                      <Fuel className="h-3.5 w-3.5" aria-hidden />
                      Free gas grant
                    </div>
                    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.12] to-white/[0.02] p-5 text-center shadow-[0_0_40px_rgba(16, 185, 129,0.1)]">
                      <Sparkles className="mx-auto h-8 w-8 text-emerald-400" aria-hidden />
                      <p className="mt-3 font-display text-3xl font-bold text-white">
                        {FREE_GAS_CREDITS.toLocaleString("en-US")}
                      </p>
                      <p className="mt-1 text-sm text-emerald-300">
                        Free Gas Credits
                      </p>
                      <p className="mt-3 text-xs leading-relaxed text-slate-muted">
                        Claimed into{" "}
                        <span className="font-mono text-emerald-300">{slug}</span>{" "}
                        ·{" "}
                        {TEMPLATES.find((t) => t.id === template)?.title ??
                          "blueprint"}{" "}
                        ready on the Workforce Console.
                      </p>
                    </div>
                    <ul className="space-y-2 text-xs text-slate-muted">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                        Workspace: {name.trim()}
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                        Template blueprint installed
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                        Dashboard access unlocked
                      </li>
                    </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <footer className="flex items-center gap-2 border-t border-white/10 px-5 py-4">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-muted transition hover:border-white/20 hover:text-white"
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-muted transition hover:border-white/20 hover:text-white"
                >
                  Skip
                </button>
              )}
              <div className="flex-1" />
              {step < 3 ? (
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setStep((s) => Math.min(3, s + 1))}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={claiming}
                  onClick={finish}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  {claiming ? "Claiming…" : "Claim & Access Dashboard"}
                  <Fuel className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </footer>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
