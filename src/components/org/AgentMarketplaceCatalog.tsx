"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  Loader2,
  PenLine,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

type MarketplaceAccent = "cyan" | "amber" | "purple" | "emerald";

export type MarketplaceTemplate = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  icon: LucideIcon;
  accent: MarketplaceAccent;
};

const ACCENT_STYLES: Record<
  MarketplaceAccent,
  { border: string; glow: string; icon: string; badge: string }
> = {
  cyan: {
    border: "border-cyan-accent/30 hover:border-cyan-accent/55",
    glow: "hover:shadow-glow-sm",
    icon: "text-cyan-accent bg-cyan-accent/10 border-cyan-accent/30",
    badge: "bg-cyan-accent/10 text-cyan-accent border-cyan-accent/25",
  },
  amber: {
    border: "border-amber-accent/30 hover:border-amber-accent/55",
    glow: "hover:shadow-glow-amber-sm",
    icon: "text-amber-accent bg-amber-accent/10 border-amber-accent/30",
    badge: "bg-amber-accent/10 text-amber-accent border-amber-accent/25",
  },
  purple: {
    border: "border-violet-400/30 hover:border-violet-400/55",
    glow: "hover:shadow-[0_0_24px_rgba(167,139,250,0.2)]",
    icon: "text-violet-300 bg-violet-400/10 border-violet-400/30",
    badge: "bg-violet-400/10 text-violet-300 border-violet-400/25",
  },
  emerald: {
    border: "border-emerald-400/30 hover:border-emerald-400/55",
    glow: "hover:shadow-[0_0_24px_rgba(52,211,153,0.18)]",
    icon: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30",
    badge: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  },
};

export const MARKETPLACE_TEMPLATES: MarketplaceTemplate[] = [
  {
    id: "market-analyzer",
    name: "Market Analyzer",
    description:
      "Ingests market signals, competitor pages, and pricing feeds to produce actionable intelligence briefs.",
    systemPrompt:
      "You are a Market Analyzer agent. Synthesize competitive intelligence, trend deltas, and pricing signals into executive-ready briefs with cited sources.",
    tools: ["web_scraper", "market_data", "crm_sync"],
    icon: BarChart3,
    accent: "cyan",
  },
  {
    id: "seo-copywriter-pro",
    name: "SEO Copywriter Pro",
    description:
      "Generates search-optimized landing copy, meta descriptions, and content clusters tuned for conversion.",
    systemPrompt:
      "You are an SEO Copywriter Pro. Produce keyword-aware, conversion-focused copy with structured headings, meta tags, and internal link suggestions.",
    tools: ["web_scraper", "keyword_research", "cms_publish"],
    icon: PenLine,
    accent: "amber",
  },
  {
    id: "security-log-auditor",
    name: "Security Log Auditor",
    description:
      "Parses security logs and configs to surface anomalies, IOCs, and hardening recommendations.",
    systemPrompt:
      "You are a Security Log Auditor. Analyze logs for threat patterns, privilege escalations, and misconfigurations. Output severity-ranked findings with remediation steps.",
    tools: ["log_parser", "siem_query", "code_sandbox"],
    icon: ShieldCheck,
    accent: "purple",
  },
  {
    id: "revenue-ops-orchestrator",
    name: "Revenue Ops Orchestrator",
    description:
      "Coordinates lead scoring, enrichment, and CRM handoffs across your GTM stack.",
    systemPrompt:
      "You are a Revenue Ops Orchestrator. Route leads through enrichment, scoring models, and CRM updates with deterministic audit trails.",
    tools: ["crm_sync", "lead_scoring", "webhook_dispatch"],
    icon: Rocket,
    accent: "emerald",
  },
];

export default function AgentMarketplaceCatalog() {
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [deployedIds, setDeployedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleDeploy = async (template: MarketplaceTemplate) => {
    setDeployingId(template.id);
    setError(null);
    setSuccessId(null);

    try {
      const response = await fetch("/api/orgs/personas", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          templateId: template.id,
          name: template.name,
          description: template.description,
          systemPrompt: template.systemPrompt,
          tools: template.tools,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        success?: boolean;
      };

      if (!response.ok) {
        setError(
          payload.error ??
            payload.message ??
            `Deploy failed for ${template.name} (HTTP ${response.status})`
        );
        return;
      }

      setDeployedIds((prev) => new Set(prev).add(template.id));
      setSuccessId(template.id);
      setTimeout(() => setSuccessId(null), 3000);
    } catch {
      setError(`Network error while deploying ${template.name}.`);
    } finally {
      setDeployingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-amber-accent/30 bg-amber-accent/10 p-2">
            <Store className="h-4 w-4 text-amber-accent" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Agent Marketplace
            </h2>
            <p className="mt-0.5 text-xs text-slate-muted">
              Browse preset templates and deploy them as active workspace personas
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-accent/25 bg-cyan-accent/5 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-cyan-accent">
          <Sparkles className="h-3 w-3" aria-hidden />
          Stage 15 Catalog
        </span>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MARKETPLACE_TEMPLATES.map((template, index) => {
          const Icon = template.icon;
          const accent = ACCENT_STYLES[template.accent];
          const deployed = deployedIds.has(template.id);
          const deploying = deployingId === template.id;
          const justDeployed = successId === template.id;

          return (
            <motion.article
              key={template.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`glass flex flex-col rounded-2xl border bg-white/[0.02] p-5 transition ${accent.border} ${accent.glow}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`rounded-xl border p-2.5 ${accent.icon}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                {deployed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    Deployed
                  </span>
                ) : null}
              </div>

              <h3 className="mt-4 font-display text-base font-semibold text-white">
                {template.name}
              </h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-muted">
                {template.description}
              </p>

              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">
                  System prompt
                </p>
                <p className="line-clamp-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-muted">
                  {template.systemPrompt}
                </p>
              </div>

              <div className="mt-3">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-dim">
                  <Wrench className="h-3 w-3" aria-hidden />
                  Tool set
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {template.tools.map((tool) => (
                    <span
                      key={tool}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] ${accent.badge}`}
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleDeploy(template)}
                disabled={deploying || deployed}
                className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  deployed
                    ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "bg-gradient-to-r from-cyan-accent to-amber-accent text-obsidian shadow-glow-sm hover:shadow-glow"
                }`}
              >
                {deploying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Deploying…
                  </>
                ) : justDeployed ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Deployed to workspace
                  </>
                ) : deployed ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Active in workspace
                  </>
                ) : (
                  <>
                    <Rocket className="h-3.5 w-3.5" aria-hidden />
                    Deploy to Workspace
                  </>
                )}
              </button>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
