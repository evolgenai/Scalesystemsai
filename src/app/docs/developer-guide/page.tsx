"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  KeyRound,
  Server,
  Webhook,
  Layers,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

const SIDEBAR_NAV: NavItem[] = [
  { id: "authentication-protocol", label: "Authentication Protocol", icon: KeyRound },
  { id: "agent-provisioning-nodes", label: "Agent Provisioning Nodes", icon: Server },
  { id: "multi-rail-ledger", label: "Multi-Rail Ledger Processing", icon: Layers },
  { id: "system-telemetry-webhooks", label: "System Telemetry Webhooks", icon: Webhook },
];

const CURL_PROVISION_AGENT = `curl -X POST https://api.scalesystems.ai/api/v1/agents \\
  -H "Authorization: Bearer ss_live_7f3a9c2e1b8d4f6a0c5e9b2d7a1f4c8" \\
  -H "Content-Type: application/json" \\
  -H "X-SS-Idempotency-Key: prov_8c4f2a91e7b3d605" \\
  -d '{
    "agentType": "lead-sentinel",
    "runtime": {
      "region": "us-east-1",
      "modelTier": "production",
      "maxConcurrency": 4
  },
    "entitlements": {
      "planTier": "STARTER",
      "tokenBudget": 500000
    },
    "integrations": {
      "hubspot": true,
      "slackWebhook": "https://hooks.slack.com/services/T00/B00/XXXX"
    }
  }'`;

const RESPONSE_201_CREATED = `HTTP/1.1 201 Created
Content-Type: application/json
X-SS-Request-Id: req_9f2c8a1e4b7d3f60
X-SS-RateLimit-Remaining: 98

{
  "id": "agt_4k9m2x7p1q8w3n6r",
  "status": "PROVISIONING",
  "agentType": "lead-sentinel",
  "nodeId": "node_us-east-1a_ss-prod-07",
  "apiKeyPrefix": "ss_live_7f3a",
  "createdAt": "2026-07-12T11:36:00.000Z",
  "runtime": {
    "region": "us-east-1",
    "heartbeatIntervalMs": 30000,
    "langGraphCluster": "lg-cluster-7f3a9c"
  },
  "billing": {
    "ledgerRail": "stripe",
    "planTier": "STARTER",
    "quotaRemaining": {
      "agents": 4,
      "tokens": 500000
    }
  },
  "_links": {
    "self": "/api/v1/agents/agt_4k9m2x7p1q8w3n6r",
    "telemetry": "/api/v1/agents/agt_4k9m2x7p1q8w3n6r/events"
  }
}`;

const CURL_AUTH_VERIFY = `curl -X GET https://api.scalesystems.ai/api/v1/auth/verify \\
  -H "Authorization: Bearer ss_live_7f3a9c2e1b8d4f6a0c5e9b2d7a1f4c8" \\
  -H "X-SS-Timestamp: 1720784160" \\
  -H "X-SS-Signature: sha256=8f14e45fceea167a5a36dedd4bea2543"`;

const WEBHOOK_PAYLOAD = `{
  "event": "agent.execution.completed",
  "timestamp": "2026-07-12T11:36:42.812Z",
  "deliveryId": "wh_del_3a9f1c8e2b7d4a60",
  "data": {
    "agentId": "agt_4k9m2x7p1q8w3n6r",
    "runId": "ss-run-m2x7p1q8-9f2c8a1e",
    "status": "RESOLVED_AND_SYNCED",
    "computeTokensSpent": 1847,
    "executionPath": [
      { "node": "ingress", "durationMs": 12 },
      { "node": "langgraph-orchestrator", "durationMs": 2840 },
      { "node": "downstream-sync", "durationMs": 186 }
    ]
  },
  "signature": "v1=9c2e1b8d4f6a0c5e9b2d7a1f4c87f3a"
}`;

function CodeBlock({
  label,
  code,
  language = "bash",
}: {
  label: string;
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [code]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" aria-hidden />
          <span className="ml-2 font-mono text-[11px] text-slate-dim">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-dim sm:inline">
            {language}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-muted transition-colors hover:border-cyan-accent/30 hover:text-cyan-accent"
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-300 sm:text-[13px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function PillarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-muted">
        {children}
      </div>
    </article>
  );
}

export default function DeveloperGuidePage() {
  const [activeSection, setActiveSection] = useState(SIDEBAR_NAV[0].id);

  useEffect(() => {
    const sectionIds = SIDEBAR_NAV.map((item) => item.id);
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]?.target.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  }, []);

  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-0 top-0 h-[520px] w-[720px] rounded-full bg-cyan-accent/[0.04] blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[420px] w-[640px] rounded-full bg-purple-500/[0.05] blur-[120px]" />
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:gap-12 lg:px-8 lg:py-16">
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-64 lg:self-start">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-4">
              <BookOpen className="h-4 w-4 text-cyan-accent" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-dim">
                Developer Guide
              </span>
            </div>
            <nav aria-label="Documentation sections">
              <ul className="space-y-1">
                {SIDEBAR_NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => scrollToSection(item.id)}
                        className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          isActive
                            ? "border border-cyan-accent/25 bg-cyan-accent/10 text-cyan-accent"
                            : "border border-transparent text-slate-muted hover:border-white/10 hover:bg-white/[0.03] hover:text-white"
                        }`}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? "text-cyan-accent" : "text-slate-dim group-hover:text-slate-muted"
                          }`}
                          aria-hidden
                        />
                        <span className="leading-snug">{item.label}</span>
                        {isActive && (
                          <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-4 border-t border-white/10 pt-4">
              <Link
                href="/docs"
                className="inline-flex items-center gap-1.5 text-xs text-slate-dim transition-colors hover:text-cyan-accent"
              >
                <ChevronRight className="h-3 w-3 rotate-180" aria-hidden />
                API Reference Index
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-16">
          <header className="border-b border-white/10 pb-10">
            <p className="text-sm font-medium text-cyan-accent">
              Interactive Technical Documentation
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              ScaleSystems Developer Guide
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-muted">
              Authoritative reference for integrating with the ScaleSystems autonomous
              workforce platform. Covers cryptographic API authentication, agent
              provisioning nodes, dual-rail ledger settlement, and real-time
              telemetry webhook delivery.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs font-medium text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              API v1 — Production Stable
            </div>
          </header>

          <section
            id="authentication-protocol"
            className="scroll-mt-28 space-y-6"
          >
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                Authentication Protocol
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-muted">
                Every programmatic request to the ScaleSystems control plane is
                authenticated with a bearer token using the{" "}
                <code className="rounded border border-white/10 bg-slate-900/80 px-1.5 py-0.5 font-mono text-xs text-cyan-accent">
                  ss_live_
                </code>{" "}
                key prefix. Live keys are 256-bit entropy identifiers hashed with
                SHA-256 at issuance and stored only as HMAC-derived fingerprints in
                the tenant vault — the full secret is shown exactly once at creation.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PillarCard title="Key Syntax &amp; Scoping">
                <p>
                  Production keys follow the pattern{" "}
                  <code className="font-mono text-cyan-accent">ss_live_</code>
                  followed by 32 hexadecimal characters. Sandbox keys use{" "}
                  <code className="font-mono text-purple-400">ss_test_</code> and
                  route to isolated runtime sandboxes with synthetic ledger entries.
                </p>
                <p>
                  Each key is bound to a tenant scope:{" "}
                  <span className="text-white">agents:write</span>,{" "}
                  <span className="text-white">agents:read</span>,{" "}
                  <span className="text-white">billing:read</span>, and{" "}
                  <span className="text-white">webhooks:manage</span>. Requests
                  outside the granted scope return{" "}
                  <code className="font-mono text-xs text-amber-300">403 SCOPE_DENIED</code>.
                </p>
              </PillarCard>
              <PillarCard title="Request Signing (HMAC-SHA256)">
                <p>
                  Mutating endpoints require an additional{" "}
                  <code className="font-mono text-xs">X-SS-Signature</code> header
                  computed over the canonical request string: HTTP method, path,
                  timestamp, and SHA-256 body digest — all joined with newlines and
                  signed with the key&apos;s HMAC secret.
                </p>
                <p>
                  Timestamps must fall within a ±300 second clock-skew window.
                  Replay attempts outside this window are rejected with{" "}
                  <code className="font-mono text-xs text-amber-300">401 STALE_TIMESTAMP</code>.
                </p>
              </PillarCard>
            </div>

            <CodeBlock
              label="Verify authentication scope"
              code={CURL_AUTH_VERIFY}
              language="bash"
            />
          </section>

          <section
            id="agent-provisioning-nodes"
            className="scroll-mt-28 space-y-6"
          >
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                Agent Provisioning Nodes
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-muted">
                Agent deployments are provisioned through regional compute nodes
                orchestrated by the LangGraph cluster manager. A{" "}
                <code className="rounded border border-white/10 bg-slate-900/80 px-1.5 py-0.5 font-mono text-xs text-cyan-accent">
                  POST /api/v1/agents
                </code>{" "}
                request allocates a dedicated runtime slot, binds integration
                credentials, and enforces plan-tier quota guards before the
                provisioning pipeline begins.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Quota Guard",
                  body: "Validates active agent count and token budget against the caller's plan tier before accepting the provision request.",
                },
                {
                  step: "02",
                  title: "Node Allocation",
                  body: "Selects the lowest-latency regional node with available LangGraph cluster capacity in the requested region.",
                },
                {
                  step: "03",
                  title: "Heartbeat Bind",
                  body: "Registers a 30-second heartbeat cycle and wires downstream integration sync targets from the payload.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-5"
                >
                  <span className="font-mono text-xs font-semibold text-cyan-accent">
                    {item.step}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-dim">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <CodeBlock
              label="POST /api/v1/agents — provision request"
              code={CURL_PROVISION_AGENT}
              language="bash"
            />

            <CodeBlock
              label="201 Created — provisioning response"
              code={RESPONSE_201_CREATED}
              language="http"
            />
          </section>

          <section id="multi-rail-ledger" className="scroll-mt-28 space-y-6">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                Multi-Rail Ledger Processing
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-muted">
                ScaleSystems billing operates on a{" "}
                <span className="font-medium text-white">dual-rail ledger</span>{" "}
                architecture. Both settlement paths — Stripe fiat checkout and BVNK
                crypto gateway — resolve to a unified entitlement record on the
                tenant&apos;s Auth.js session, ensuring identical quota enforcement
                regardless of how the customer pays.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-black/30 text-slate-muted">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Ledger Rail</th>
                    <th className="px-5 py-3 font-semibold">Settlement Path</th>
                    <th className="hidden px-5 py-3 font-semibold sm:table-cell">
                      Reconciliation
                    </th>
                    <th className="px-5 py-3 font-semibold">Entitlement Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-muted">
                  <tr className="bg-white/[0.01]">
                    <td className="px-5 py-4">
                      <span className="rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-1 font-mono text-xs font-semibold text-blue-300">
                        stripe
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      Checkout Session → Subscription webhook
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <code className="font-mono text-xs text-slate-dim">
                        checkout.session.completed
                      </code>
                    </td>
                    <td className="px-5 py-4 text-emerald-300">JWT plan claim</td>
                  </tr>
                  <tr className="bg-white/[0.01]">
                    <td className="px-5 py-4">
                      <span className="rounded-md border border-purple-400/20 bg-purple-400/10 px-2 py-1 font-mono text-xs font-semibold text-purple-300">
                        bvnk
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      Hawk-signed quote → On-chain confirmation
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <code className="font-mono text-xs text-slate-dim">
                        POST /api/v1/pay/summary
                      </code>
                    </td>
                    <td className="px-5 py-4 text-emerald-300">JWT plan claim</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PillarCard title="Ledger Idempotency Rules">
                <p>
                  Every settlement event carries a rail-specific idempotency key.
                  Stripe events are deduplicated on{" "}
                  <code className="font-mono text-xs">event.id</code>; BVNK events
                  on{" "}
                  <code className="font-mono text-xs">transactionRef</code>. Duplicate
                  deliveries update the ledger audit trail but do not double-apply
                  entitlements.
                </p>
              </PillarCard>
              <PillarCard title="Cross-Rail Quota Enforcement">
                <p>
                  The unified entitlement record drives runtime guards: agent
                  deployment limits, monthly token throughput ceilings, and
                  concurrent inference slot allocation. A downgrade on either rail
                  propagates to all active provisioning nodes within one heartbeat
                  cycle (≤30s).
                </p>
              </PillarCard>
            </div>
          </section>

          <section
            id="system-telemetry-webhooks"
            className="scroll-mt-28 space-y-6"
          >
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                System Telemetry Webhooks
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-muted">
                Real-time execution telemetry is delivered to your registered
                endpoint via signed webhook payloads. Configure delivery URLs in the
                dashboard API Key Portal or programmatically through{" "}
                <code className="rounded border border-white/10 bg-slate-900/80 px-1.5 py-0.5 font-mono text-xs text-cyan-accent">
                  POST /api/v1/webhooks
                </code>
                . Events include agent lifecycle transitions, inference run
                completions, quota threshold warnings, and ledger settlement
                confirmations.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
              <h3 className="text-sm font-semibold text-white">
                Supported Event Types
              </h3>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  "agent.provisioning.started",
                  "agent.provisioning.completed",
                  "agent.execution.completed",
                  "agent.execution.failed",
                  "quota.threshold.warning",
                  "ledger.settlement.confirmed",
                ].map((event) => (
                  <li
                    key={event}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 font-mono text-xs text-slate-muted"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-accent" aria-hidden />
                    {event}
                  </li>
                ))}
              </ul>
            </div>

            <CodeBlock
              label="agent.execution.completed — webhook payload"
              code={WEBHOOK_PAYLOAD}
              language="json"
            />

            <PillarCard title="Webhook Verification">
              <p>
                Verify every inbound delivery by recomputing the{" "}
                <code className="font-mono text-xs">signature</code> field using
                HMAC-SHA256 over the raw request body with your webhook signing
                secret (<code className="font-mono text-xs">whsec_</code> prefix).
                Reject payloads where the computed digest does not match the
                declared{" "}
                <code className="font-mono text-xs">v1=</code> signature prefix.
              </p>
              <p>
                Failed deliveries are retried with exponential backoff across 72
                hours (attempts at 1m, 5m, 30m, 2h, 8h, 24h). Use the{" "}
                <code className="font-mono text-xs">deliveryId</code> for
                idempotent processing on your receiver.
              </p>
            </PillarCard>
          </section>

          <footer className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-8">
            <Link
              href="/docs"
              className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-sm font-medium text-slate-muted transition-colors hover:border-cyan-accent/30 hover:text-cyan-accent"
            >
              Full API Reference
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg bg-cyan-accent px-4 py-2 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow"
            >
              Open Dashboard
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
