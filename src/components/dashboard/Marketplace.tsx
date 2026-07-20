"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Cable,
  Code2,
  Copy,
  Check,
  BookOpen,
  ExternalLink,
  Store,
  Webhook,
  CreditCard,
  Database,
  Cpu,
  Sparkles,
  Upload,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type ListingKind = "agent" | "mcp";
type Pricing = "lease" | "purchase";
type PublishKind = "agent" | "mcp";
type PublishState = "idle" | "submitting" | "done";

const SCHEMA_PLACEHOLDER = `{
  "name": "my-extension",
  "tools": [{ "name": "run", "inputSchema": { "type": "object" } }]
}`;


type MarketplaceListing = {
  id: string;
  kind: ListingKind;
  pricing: Pricing;
  name: string;
  tagline: string;
  price: string;
  icon: LucideIcon;
  tags: string[];
};

const LISTINGS: MarketplaceListing[] = [
  {
    id: "db-janitor",
    kind: "agent",
    pricing: "lease",
    name: "Database Janitor Agent",
    tagline:
      "Vacuum, reindex, and prune orphan rows on a schedule — Neon-aware.",
    price: "$29/mo",
    icon: Database,
    tags: ["Postgres", "Neon", "Cron"],
  },
  {
    id: "stripe-webhook-monitor",
    kind: "agent",
    pricing: "purchase",
    name: "Advanced Stripe Webhook Monitor",
    tagline:
      "Replay-safe webhook sink with signature audit trails and dead-letter queues.",
    price: "$149",
    icon: CreditCard,
    tags: ["Stripe", "Webhooks", "Audit"],
  },
  {
    id: "modbus-plc",
    kind: "mcp",
    pricing: "purchase",
    name: "Physical Modbus PLC Relay Adapter",
    tagline:
      "MCP server bridging Modbus TCP coils to Scale Systems tool calls.",
    price: "$249",
    icon: Cable,
    tags: ["Modbus", "IoT", "MCP"],
  },
  {
    id: "lead-sentinel",
    kind: "agent",
    pricing: "lease",
    name: "Lead Sentinel Scout",
    tagline: "Scrapes, scores, and pushes warm leads into your CRM swarm lane.",
    price: "$49/mo",
    icon: Bot,
    tags: ["CRM", "Scoring", "Outbound"],
  },
  {
    id: "obsidian-sync-mcp",
    kind: "mcp",
    pricing: "lease",
    name: "Obsidian Vault Sync MCP",
    tagline: "Bidirectional note sync between agent memory banks and vaults.",
    price: "$19/mo",
    icon: Cpu,
    tags: ["Obsidian", "Memory", "MCP"],
  },
  {
    id: "swarm-debugger",
    kind: "agent",
    pricing: "purchase",
    name: "Swarm Trace Debugger",
    tagline:
      "Flamegraph-style tool-call timelines for multi-agent debate sessions.",
    price: "$99",
    icon: Sparkles,
    tags: ["Debug", "Telemetry", "Swarm"],
  },
];

const DEVKIT_DOCS = [
  {
    title: "Extension SDK",
    href: "/docs",
    blurb: "Register custom agents & MCP hosts against the control plane.",
  },
  {
    title: "Webhook Events",
    href: "/docs",
    blurb: "Subscribe to swarm.lifecycle and tool.invoke payloads.",
  },
  {
    title: "Auth & Scopes",
    href: "/docs",
    blurb: "Workspace-scoped API keys with least-privilege tool grants.",
  },
];

const MOCK_WEBHOOKS = [
  {
    label: "Agent lifecycle",
    method: "POST",
    path: "/api/extensions/webhooks/agent.lifecycle",
  },
  {
    label: "MCP tool invoke",
    method: "POST",
    path: "/api/extensions/webhooks/mcp.invoke",
  },
  {
    label: "Marketplace install",
    method: "POST",
    path: "/api/extensions/webhooks/marketplace.install",
  },
];

type Filter = "all" | ListingKind;

export default function Marketplace() {
  const [filter, setFilter] = useState<Filter>("all");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [publishKind, setPublishKind] = useState<PublishKind>("agent");
  const [publishName, setPublishName] = useState("");
  const [pricePerRun, setPricePerRun] = useState("0.05");
  const [schemaJson, setSchemaJson] = useState("");
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<PublishState>("idle");

  const visible =
    filter === "all" ? LISTINGS : LISTINGS.filter((l) => l.kind === filter);

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(
        `https://api.scalesystems.ai${path}`
      );
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1800);
    } catch {
      /* clipboard may be blocked in some embeds */
    }
  };

  const handlePublish = async () => {
    setSchemaError(null);
    if (!publishName.trim()) {
      setSchemaError("Name is required.");
      return;
    }
    const price = Number(pricePerRun);
    if (!Number.isFinite(price) || price < 0) {
      setSchemaError("Pricing per run must be a non-negative number.");
      return;
    }
    try {
      JSON.parse(schemaJson || "{}");
    } catch {
      setSchemaError("Capability schema must be valid JSON.");
      return;
    }
    setPublishState("submitting");
    await new Promise((r) => setTimeout(r, 900));
    setPublishState("done");
    setTimeout(() => setPublishState("idle"), 2200);
  };

  return (
    <section
      aria-labelledby="marketplace-heading"
      className="space-y-8"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-1.5 text-xs font-medium text-emerald-400">
            <Hover3DIcon intensity={16}>
              <Store className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Developer Marketplace
          </div>
          <h2
            id="marketplace-heading"
            className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            Extension{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
              Portal
            </span>
          </h2>
          <p className="max-w-xl text-sm text-slate-muted">
            Lease or purchase agent templates and MCP servers built for Scale
            Systems — mount them into your active workspace in one click.
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border border-white/5 bg-[#121212] p-1"
          role="tablist"
          aria-label="Listing filter"
        >
          {(
            [
              { id: "all", label: "All" },
              { id: "agent", label: "Agents" },
              { id: "mcp", label: "MCP Servers" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                filter === tab.id
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-slate-muted hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {visible.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.article
                key={item.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: index * 0.04, duration: 0.28 }}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-white/5 bg-[#121212] p-4 transition hover:border-emerald-500/35"
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent opacity-0 transition group-hover:opacity-100"
                  aria-hidden
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/5 bg-black/40 text-emerald-400">
                    <Hover3DIcon intensity={18}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </Hover3DIcon>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-dim">
                      {item.kind === "agent" ? "Agent" : "MCP"}
                    </span>
                    <span className="font-mono text-sm font-semibold text-emerald-400">
                      {item.price}
                    </span>
                  </div>
                </div>

                <h3 className="relative mt-3 font-display text-sm font-semibold text-white">
                  {item.name}
                </h3>
                <p className="relative mt-1.5 flex-1 text-xs leading-relaxed text-slate-muted">
                  {item.tagline}
                </p>

                <div className="relative mt-3 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-dim"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  className="relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                >
                  {item.pricing === "lease" ? "Lease for workspace" : "Purchase & install"}
                </button>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Developer plugin publisher */}
      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <Hover3DIcon intensity={16}>
                <Upload className="h-5 w-5" aria-hidden />
              </Hover3DIcon>
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Publish Extension
              </h3>
              <p className="text-xs text-slate-muted">
                Register agent templates or MCP tool schemas
              </p>
            </div>
          </div>
          <div
            className="inline-flex rounded-lg border border-white/5 bg-black/40 p-0.5"
            role="tablist"
            aria-label="Publish type"
          >
            {(
              [
                { id: "agent" as const, label: "Agent template" },
                { id: "mcp" as const, label: "MCP schema" },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={publishKind === tab.id}
                onClick={() => setPublishKind(tab.id)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  publishKind === tab.id
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-slate-muted hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form
          className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePublish();
          }}
        >
          <div className="space-y-3">
            <div>
              <label
                htmlFor="pub-name"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-dim"
              >
                Name
              </label>
              <input
                id="pub-name"
                value={publishName}
                onChange={(e) => setPublishName(e.target.value)}
                placeholder={
                  publishKind === "agent"
                    ? "Fleet Log Scrubber"
                    : "modbus-relay-mcp"
                }
                className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 text-xs text-white placeholder:text-slate-dim/50 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label
                htmlFor="pub-price"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-dim"
              >
                Pricing per run (USD)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-emerald-400">
                  $
                </span>
                <input
                  id="pub-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={pricePerRun}
                  onChange={(e) => setPricePerRun(e.target.value)}
                  className="w-full rounded-lg border border-white/5 bg-black/40 py-2.5 pl-7 pr-3 font-mono text-xs text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="pub-schema"
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-dim"
            >
              JSON capability schema
            </label>
            <textarea
              id="pub-schema"
              value={schemaJson}
              onChange={(e) => setSchemaJson(e.target.value)}
              placeholder={SCHEMA_PLACEHOLDER}
              spellCheck={false}
              rows={8}
              className="min-h-[9rem] flex-1 resize-y rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300/90 placeholder:text-slate-dim/40 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex flex-col gap-2 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
            {schemaError ? (
              <p className="text-[11px] text-rose-400">{schemaError}</p>
            ) : (
              <p className="text-[11px] text-slate-dim">
                Submissions are staged for marketplace review.
              </p>
            )}
            <button
              type="submit"
              disabled={publishState === "submitting"}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {publishState === "submitting" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Publishing…
                </>
              ) : publishState === "done" ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Queued
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Submit for review
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Developer DevKit */}
      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <Hover3DIcon intensity={16}>
                <Code2 className="h-5 w-5" aria-hidden />
              </Hover3DIcon>
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Developer DevKit
              </h3>
              <p className="text-xs text-slate-muted">
                Docs & mock webhook endpoints for building on Scale Systems
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-2">
          <div className="space-y-3 border-b border-white/5 p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              Documentation
            </p>
            <ul className="space-y-2">
              {DEVKIT_DOCS.map((doc) => (
                <li key={doc.title}>
                  <a
                    href={doc.href}
                    className="group flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2.5 transition hover:border-emerald-500/30"
                  >
                    <div>
                      <p className="text-xs font-medium text-white group-hover:text-emerald-400">
                        {doc.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-dim">
                        {doc.blurb}
                      </p>
                    </div>
                    <ExternalLink
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-dim group-hover:text-emerald-400"
                      aria-hidden
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
              <Webhook className="h-3.5 w-3.5" aria-hidden />
              Mock webhook endpoints
            </p>
            <ul className="space-y-2">
              {MOCK_WEBHOOKS.map((hook) => {
                const copied = copiedPath === hook.path;
                return (
                  <li
                    key={hook.path}
                    className="rounded-lg border border-white/5 bg-black/30 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white">
                        {hook.label}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyPath(hook.path)}
                        className="inline-flex items-center gap-1 rounded border border-white/5 px-2 py-1 text-[10px] text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400"
                        aria-label={`Copy ${hook.label} endpoint`}
                      >
                        {copied ? (
                          <Check className="h-3 w-3 text-emerald-400" aria-hidden />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-1.5 break-all font-mono text-[11px] text-emerald-400/90">
                      <span className="mr-2 text-slate-dim">{hook.method}</span>
                      {hook.path}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
