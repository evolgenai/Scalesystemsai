"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  DollarSign,
  Globe,
  HeartPulse,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  type LucideIcon,
} from "lucide-react";

export type AgentCategory =
  | "Web Scraping"
  | "SRE Diagnostics"
  | "E-Commerce Automation"
  | "Financial Scraper"
  | "AI Summarizer";

type MarketplaceAgent = {
  id: string;
  title: string;
  author: string;
  category: AgentCategory;
  rating: number;
  installs: string;
  blurb: string;
  icon: LucideIcon;
  paletteId: string;
};

const CATEGORIES: AgentCategory[] = [
  "Web Scraping",
  "SRE Diagnostics",
  "E-Commerce Automation",
  "Financial Scraper",
  "AI Summarizer",
];

const AGENTS: MarketplaceAgent[] = [
  {
    id: "playwright-scout",
    title: "Playwright Scout",
    author: "Scale Systems",
    category: "Web Scraping",
    rating: 4.9,
    installs: "12.4k",
    blurb: "Headless crawl + structured extract with anti-bot pacing.",
    icon: Globe,
    paletteId: "agent-scraper",
  },
  {
    id: "dom-harvester",
    title: "DOM Harvester",
    author: "Obsidian Labs",
    category: "Web Scraping",
    rating: 4.6,
    installs: "8.1k",
    blurb: "Selector-stable DOM harvest for product and listing pages.",
    icon: Globe,
    paletteId: "agent-scraper",
  },
  {
    id: "meta-sre-healer",
    title: "Meta-SRE Healer",
    author: "Scale Systems",
    category: "SRE Diagnostics",
    rating: 4.8,
    installs: "9.7k",
    blurb: "Diagnose degraded lanes and apply policy-safe remediations.",
    icon: HeartPulse,
    paletteId: "agent-sre",
  },
  {
    id: "latency-sentinel",
    title: "Latency Sentinel",
    author: "Neon Ops",
    category: "SRE Diagnostics",
    rating: 4.5,
    installs: "5.2k",
    blurb: "Sparkline-aware p95 watcher with auto-ticket drafting.",
    icon: HeartPulse,
    paletteId: "agent-sre",
  },
  {
    id: "cart-orchestrator",
    title: "Cart Orchestrator",
    author: "Commerce Guild",
    category: "E-Commerce Automation",
    rating: 4.7,
    installs: "6.9k",
    blurb: "Checkout funnel automation with stock-aware retries.",
    icon: ShoppingBag,
    paletteId: "action-inventory",
  },
  {
    id: "merch-restocker",
    title: "Merch Restocker",
    author: "Scale Systems",
    category: "E-Commerce Automation",
    rating: 4.4,
    installs: "3.8k",
    blurb: "Inventory sync agent that reorders low-stock SKUs.",
    icon: ShoppingBag,
    paletteId: "action-inventory",
  },
  {
    id: "ticker-pulse",
    title: "Ticker Pulse",
    author: "Ledger AI",
    category: "Financial Scraper",
    rating: 4.6,
    installs: "7.3k",
    blurb: "Market page scraper with anomaly flags for ops briefs.",
    icon: DollarSign,
    paletteId: "agent-scraper",
  },
  {
    id: "fx-watchdog",
    title: "FX Watchdog",
    author: "Obsidian Labs",
    category: "Financial Scraper",
    rating: 4.3,
    installs: "2.9k",
    blurb: "Currency & rate table extractor with Discord alert hooks.",
    icon: DollarSign,
    paletteId: "agent-scraper",
  },
  {
    id: "ops-summarizer",
    title: "Ops Brief Summarizer",
    author: "Scale Systems",
    category: "AI Summarizer",
    rating: 4.9,
    installs: "15.1k",
    blurb: "Condense swarm logs into actionable operator briefs.",
    icon: Sparkles,
    paletteId: "agent-summarizer",
  },
  {
    id: "incident-digest",
    title: "Incident Digest",
    author: "Neon Ops",
    category: "AI Summarizer",
    rating: 4.7,
    installs: "4.4k",
    blurb: "Turn multi-agent traces into a single heal checklist.",
    icon: Bot,
    paletteId: "agent-summarizer",
  },
];

const INSTALL_KEY = "scalesystems.marketplace.install";

export default function AgentMarketplace() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AgentCategory | "All">("All");
  const [installed, setInstalled] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AGENTS.filter((a) => {
      if (category !== "All" && a.category !== category) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.blurb.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  const addToCanvas = (agent: MarketplaceAgent) => {
    try {
      window.localStorage.setItem(
        INSTALL_KEY,
        JSON.stringify({
          paletteId: agent.paletteId,
          agentId: agent.id,
          title: agent.title,
          at: Date.now(),
        })
      );
    } catch {
      /* ignore */
    }
    setInstalled((prev) => new Set(prev).add(agent.id));
    router.push("/dashboard?view=builder");
  };

  return (
    <div className="space-y-6" style={{ backgroundColor: "#040907" }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            <Store className="h-3 w-3" aria-hidden />
            Agent marketplace
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">
            Pre-built agent nodes
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-muted">
            Browse curated agents by category, then install straight onto the
            workflow canvas.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, authors, categories…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-white outline-none backdrop-blur-xl placeholder:text-slate-dim focus:border-emerald-500/40"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("All")}
          className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
            category === "All"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
              : "border-white/10 bg-white/[0.03] text-slate-muted hover:text-white"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
              category === cat
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                : "border-white/10 bg-white/[0.03] text-slate-muted hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((agent) => {
          const Icon = agent.icon;
          const isInstalled = installed.has(agent.id);
          return (
            <article
              key={agent.id}
              className="flex flex-col rounded-xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur-xl transition hover:border-emerald-500/35"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-emerald-400">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-white">
                    {agent.title}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-dim">
                    by{" "}
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-medium text-slate-muted">
                      {agent.author}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-cyan-accent/25 bg-cyan-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-accent">
                  {agent.category}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                  <Star className="h-3 w-3 fill-amber-300" aria-hidden />
                  {agent.rating.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-dim">
                  {agent.installs} installs
                </span>
              </div>

              <p className="mt-3 flex-1 text-[12px] leading-relaxed text-slate-muted">
                {agent.blurb}
              </p>

              <button
                type="button"
                onClick={() => addToCanvas(agent)}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
              >
                <Bot className="h-3.5 w-3.5" aria-hidden />
                {isInstalled ? "Added · Open Canvas" : "Install / Add to Canvas"}
              </button>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-dim">
          No agents match your filters.
        </p>
      ) : null}
    </div>
  );
}
