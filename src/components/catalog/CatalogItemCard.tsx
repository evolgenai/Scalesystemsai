"use client";

import { motion } from "framer-motion";
import { ArrowRight, Plug, Rocket } from "lucide-react";
import type { CatalogItem } from "@/components/catalog/catalogData";

const ACCENT: Record<string, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

type CatalogItemCardProps = {
  item: CatalogItem;
  featured?: boolean;
  onAction: (item: CatalogItem) => void;
};

export default function CatalogItemCard({
  item,
  featured = false,
  onAction,
}: CatalogItemCardProps) {
  const Icon = item.icon;
  const accent = ACCENT[item.accent] ?? ACCENT.emerald;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.28 }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-bio-moss/50 bg-gradient-to-b from-slate-950 via-zinc-900 to-emerald-950/25 p-5 shadow-bio-inset transition hover:border-[#00ffaa]/35 ${
        featured ? "sm:col-span-1 lg:min-h-[280px]" : ""
      }`}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            item.accent === "cyan"
              ? "rgba(34,211,238,0.18)"
              : item.accent === "amber"
                ? "rgba(245,158,11,0.16)"
                : "rgba(16,185,129,0.18)",
        }}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${accent}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {item.badge ? (
          <span className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-300">
            {item.badge}
          </span>
        ) : null}
      </div>

      <h3 className="relative mt-4 font-display text-lg font-semibold tracking-tight text-white">
        {item.name}
      </h3>
      <p className="relative mt-2 text-sm leading-relaxed text-slate-muted">
        {featured ? item.description : item.tagline}
      </p>

      {featured ? (
        <ul className="relative mt-4 space-y-1.5">
          {item.highlights.slice(0, 3).map((h) => (
            <li
              key={h}
              className="flex items-center gap-2 text-xs text-slate-400"
            >
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
              {h}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative mt-auto flex items-center gap-2 pt-5">
        <button
          type="button"
          onClick={() => onAction(item)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/20 active:scale-[0.98]"
        >
          {item.cta === "deploy" ? (
            <Rocket className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plug className="h-3.5 w-3.5" aria-hidden />
          )}
          {item.cta === "deploy" ? "Deploy" : "Connect"}
          <ArrowRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}
