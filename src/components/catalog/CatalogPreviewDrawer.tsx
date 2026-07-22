"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight, Terminal, Link2 } from "lucide-react";
import type { CatalogItem } from "@/components/catalog/catalogData";

type CatalogPreviewDrawerProps = {
  item: CatalogItem | null;
  onClose: () => void;
  onConfirm: (item: CatalogItem) => void;
};

export default function CatalogPreviewDrawer({
  item,
  onClose,
  onConfirm,
}: CatalogPreviewDrawerProps) {
  return (
    <AnimatePresence>
      {item ? (
        <>
          <motion.button
            type="button"
            aria-label="Close preview"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-preview-title"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-emerald-500/25 bg-[#070f0c] shadow-2xl shadow-black/50"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400/80">
                  Interactive preview
                </p>
                <h2
                  id="catalog-preview-title"
                  className="mt-1 font-display text-lg font-semibold text-white"
                >
                  {item.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 p-2 text-slate-muted transition hover:border-emerald-500/40 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <p className="text-sm leading-relaxed text-slate-muted">
                {item.preview.headline}
              </p>

              <ol className="space-y-3">
                {item.preview.steps.map((step, i) => (
                  <li
                    key={step}
                    className="flex gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-[11px] font-semibold text-emerald-400">
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-200">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="space-y-2 rounded-xl border border-white/8 bg-black/30 p-3 font-mono text-[11px]">
                {item.preview.endpoint ? (
                  <p className="flex items-center gap-2 text-cyan-300/90">
                    <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {item.preview.endpoint}
                  </p>
                ) : null}
                {item.preview.runtime ? (
                  <p className="flex items-center gap-2 text-emerald-300/80">
                    <Terminal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {item.preview.runtime}
                  </p>
                ) : null}
              </div>

              <ul className="space-y-1.5">
                {item.highlights.map((h) => (
                  <li
                    key={h}
                    className="flex items-center gap-2 text-xs text-slate-muted"
                  >
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            <footer className="border-t border-white/5 px-5 py-4">
              <button
                type="button"
                onClick={() => onConfirm(item)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 active:scale-[0.99]"
              >
                {item.cta === "deploy" ? "Deploy" : "Connect"}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
