"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  ChevronDown,
  Code2,
  Github,
  HeartPulse,
  Layers,
  Lock,
  ShoppingBag,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";

export const RELEASE_V2_STORAGE_KEY = "scalesystems.release.v2";
export const OPEN_RELEASE_EVENT = "scalesystems:open-release-modal";

type Milestone = {
  id: string;
  title: string;
  tagline: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  integrations?: string[];
};

const MILESTONES: Milestone[] = [
  {
    id: "dual-mode",
    title: "Dual-Mode UX",
    tagline: "User · Developer surfaces",
    detail:
      "Switch between natural-language operator digests and full kernel telemetry — same swarm stream, two control planes.",
    href: "/dashboard",
    icon: UserRound,
  },
  {
    id: "spatial",
    title: "Spatial Universe 3D Inspection Deck",
    tagline: "First-person cyber grid",
    detail:
      "Walk terminal towers in WebGL, inspect live script actions on proximity, and bridge sandbox uploads from the spatial viewport.",
    href: "/dashboard?view=universe",
    icon: Box,
  },
  {
    id: "marketplace",
    title: "70/30 Creator Revenue Marketplace",
    tagline: "Install · meter · earn",
    detail:
      "Publish agent nodes to the gallery with a 70% creator / 30% platform revenue split, gas-metered invocations, and one-click canvas install.",
    href: "/dashboard?view=marketplace",
    icon: ShoppingBag,
  },
  {
    id: "integrations",
    title: "Native Integrations Hub",
    tagline: "Shopify · Slack · Discord · Sheets · GitHub",
    detail:
      "OAuth connectors for commerce, comms, spreadsheets, and repos — credentials vault-scoped per workspace with live sync badges.",
    href: "/dashboard?view=integrations",
    icon: Layers,
    integrations: ["Shopify", "Slack", "Discord", "Google Sheets", "GitHub"],
  },
  {
    id: "vault",
    title: "Encrypted AES-GCM Backup Vault",
    tagline: "Snapshot · restore · WORM",
    detail:
      "Point-in-time database snapshots encrypted with AES-GCM, immutable audit stream, and one-click restore for disaster recovery.",
    href: "/dashboard?view=security",
    icon: Lock,
  },
  {
    id: "meta-sre",
    title: "Mobile Meta-SRE Auto-Healing Deck",
    tagline: "One-touch platform heal",
    detail:
      "Live CPU and database pool telemetry with a single-tap Meta-SRE auto-heal dispatch — Discord mobile alerts and directive pipeline included.",
    href: "/dashboard?view=sre-control",
    icon: HeartPulse,
  },
];

export function isReleaseV2Seen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(RELEASE_V2_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markReleaseV2Seen(): void {
  try {
    window.localStorage.setItem(RELEASE_V2_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function openReleaseModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_RELEASE_EVENT));
}

type ReleaseSummaryModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ReleaseSummaryModal({
  open,
  onClose,
}: ReleaseSummaryModalProps) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState<string>(MILESTONES[0]!.id);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setExpanded(MILESTONES[0]!.id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const dismiss = useCallback(() => {
    markReleaseV2Seen();
    onClose();
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
          role="presentation"
        >
          <motion.button
            type="button"
            aria-label="Close release summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={dismiss}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-v2-title"
            initial={{ y: "100%", opacity: 0.9 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.9 }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            className="relative z-10 flex max-h-[min(92dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#09090B]/95 shadow-[0_0_80px_rgba(16,185,129,0.14)] backdrop-blur-xl sm:max-h-[min(88dvh,760px)] sm:rounded-2xl"
          >
            <header className="shrink-0 border-b border-white/10 px-4 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    v2.0 Release
                  </div>
                  <h2
                    id="release-v2-title"
                    className="mt-2 font-display text-xl font-bold text-white sm:text-2xl"
                  >
                    Scale Systems v2.0
                  </h2>
                  <p className="mt-1 text-sm text-slate-muted">
                    System summary · milestone capabilities · Obsidian glass runtime
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400"
                  aria-label="Dismiss release summary"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <ol className="space-y-2" aria-label="v2.0 milestones">
                {MILESTONES.map((m, index) => {
                  const Icon = m.icon;
                  const isOpen = expanded === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => (prev === m.id ? "" : m.id))
                        }
                        aria-expanded={isOpen}
                        className={`flex w-full touch-manipulation items-start gap-3 rounded-xl border px-3.5 py-3.5 text-left transition sm:px-4 ${
                          isOpen
                            ? "border-emerald-500/30 bg-emerald-500/[0.07] shadow-[0_0_24px_rgba(16,185,129,0.08)]"
                            : "border-white/5 bg-white/[0.03] hover:border-white/10"
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
                          <Icon className="h-4 w-4 text-emerald-400" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-emerald-400/80">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="truncate text-sm font-semibold text-white">
                              {m.title}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-dim">
                            {m.tagline}
                          </span>
                        </span>
                        <ChevronDown
                          className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-3 px-3 pb-3 pt-2 sm:px-4">
                              <p className="text-sm leading-relaxed text-slate-muted">
                                {m.detail}
                              </p>
                              {m.integrations ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {m.integrations.map((name) => (
                                    <span
                                      key={name}
                                      className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-cyan-accent"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <Link
                                href={m.href}
                                onClick={dismiss}
                                className="inline-flex min-h-[44px] touch-manipulation items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 active:scale-[0.98]"
                              >
                                <Code2 className="h-3.5 w-3.5" aria-hidden />
                                Open in console
                              </Link>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ol>
            </div>

            <footer className="shrink-0 border-t border-white/10 px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-[11px] text-slate-dim">
                  <Github className="h-3.5 w-3.5" aria-hidden />
                  Built on Obsidian · emerald glass · mobile-first
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-[#09090B] shadow-[0_0_28px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 active:scale-[0.98] sm:w-auto"
                >
                  Enter v2.0 workspace
                </button>
              </div>
            </footer>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
