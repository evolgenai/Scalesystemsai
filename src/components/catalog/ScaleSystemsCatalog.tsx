"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import { Layers, Search } from "lucide-react";
import {
  CATALOG_ITEMS,
  CATALOG_TABS,
  countByCategory,
  filterCatalogItems,
  type CatalogCategory,
  type CatalogItem,
} from "@/components/catalog/catalogData";
import CatalogItemCard from "@/components/catalog/CatalogItemCard";
import CatalogPreviewDrawer from "@/components/catalog/CatalogPreviewDrawer";

export default function ScaleSystemsCatalog() {
  const [category, setCategory] = useState<CatalogCategory>("all");
  const [query, setQuery] = useState("");
  const [drawerItem, setDrawerItem] = useState<CatalogItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const byTab = filterCatalogItems(CATALOG_ITEMS, category);
    const q = query.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.tagline.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [category, query]);

  const featured = useMemo(
    () => filtered.filter((item) => item.featured),
    [filtered]
  );
  const rest = useMemo(
    () => filtered.filter((item) => !item.featured),
    [filtered]
  );

  const openPreview = (item: CatalogItem) => {
    setDrawerItem(item);
  };

  const confirmAction = (item: CatalogItem) => {
    setDrawerItem(null);
    setToast(
      item.cta === "deploy"
        ? `${item.name} queued for deploy`
        : `${item.name} connection initiated`
    );
    window.setTimeout(() => setToast(null), 2800);
  };

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-1/4 top-0 h-[420px] w-[620px] rounded-full bg-[#00ffaa]/8 blur-[140px]" />
        <div className="absolute bottom-1/4 left-1/5 h-[320px] w-[480px] rounded-full bg-bio-moss/40 blur-[120px]" />
      </div>

      <header className="bio-metallic-surface max-w-3xl rounded-2xl p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ffaa]/90">
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Scale Systems AI · Catalog
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Deploy agents, tools &amp; sandboxes
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-muted sm:text-lg">
          Production-ready blueprints for Meta-SRE healing, Sentry MCP
          telemetry, persistent runtimes, and SSE diagnostics — with one-click
          Deploy / Connect previews.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Catalog categories"
          className="flex flex-wrap gap-2"
        >
          {CATALOG_TABS.map((tab) => {
            const active = category === tab.id;
            const count = countByCategory(CATALOG_ITEMS, tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  startTransition(() => {
                    setCategory(tab.id);
                  })
                }
                className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "border-[#00ffaa]/45 bg-[#00ffaa]/12 text-[#00ffaa] shadow-glow-sm"
                    : "border-bio-moss/40 bg-bio-gunmetal/60 text-slate-muted hover:border-[#00ffaa]/25 hover:text-slate-200"
                }`}
              >
                {tab.label}
                <span className="ml-2 font-mono text-[10px] opacity-70">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search catalog</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blueprints…"
            className="w-full rounded-xl border border-bio-moss/50 bg-bio-gunmetal/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-[#00ffaa]/40 focus:shadow-glow-sm"
          />
        </label>
      </div>

      {featured.length > 0 ? (
        <section className="mt-10" aria-labelledby="featured-heading">
          <h2
            id="featured-heading"
            className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-slate-400"
          >
            Featured
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {featured.map((item) => (
                <CatalogItemCard
                  key={item.id}
                  item={item}
                  featured
                  onAction={openPreview}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="all-items-heading">
        <h2
          id="all-items-heading"
          className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-slate-400"
        >
          {featured.length > 0
            ? "More in this category"
            : category === "all"
              ? "All items"
              : CATALOG_TABS.find((t) => t.id === category)?.label}
        </h2>
        {filtered.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-muted">
            No catalog items match this filter.
          </p>
        ) : rest.length === 0 && featured.length > 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Featured items above cover this filter.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {(featured.length > 0 ? rest : filtered).map((item) => (
                <CatalogItemCard
                  key={`grid-${item.id}`}
                  item={item}
                  onAction={openPreview}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <CatalogPreviewDrawer
        item={drawerItem}
        onClose={() => setDrawerItem(null)}
        onConfirm={confirmAction}
      />

      <AnimatePresence>
        {toast ? (
          <div
            role="status"
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-[#0a1611] px-4 py-2.5 text-sm text-emerald-300 shadow-lg shadow-black/40"
          >
            {toast}
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
