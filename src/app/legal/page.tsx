import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  FileText,
  Shield,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Legal & Compliance",
  description:
    "Corporate compliance and legal framework for ScaleSystems: multi-tenant data isolation, agentic zero-retention pipeline, and terms of service with API token guardrails.",
};

const SECTIONS = [
  {
    id: "multi-tenant-isolation",
    icon: Database,
    title: "Multi-Tenant Data Isolation Protocol",
    summary:
      "Every corporate tenant operates within a strictly isolated virtual database schema, ensuring complete separation of data, credentials, and operational context.",
    paragraphs: [
      "ScaleSystems provisions each enterprise tenant into a dedicated virtual database schema at onboarding. Schema boundaries are enforced at the connection layer — no shared tables, no cross-tenant query paths, and no ambient access to neighboring tenant data.",
      "All read and write operations are scoped to the authenticated tenant context. Connection pools, ORM middleware, and Route Handler guards resolve the caller's tenant identifier before any data access occurs, preventing bleed between organizational boundaries.",
      "Schema isolation extends to backups, replication streams, and audit logs. Each tenant's data lifecycle — retention, export, and deletion — is managed independently, satisfying enterprise data residency and segregation requirements.",
    ],
    bullets: [
      "Dedicated virtual schema per corporate tenant",
      "Connection-layer enforcement with zero shared data tables",
      "Independent backup, audit, and deletion lifecycles",
    ],
  },
  {
    id: "zero-retention-pipeline",
    icon: Shield,
    title: "Agentic Zero-Retention Pipeline",
    summary:
      "Raw enterprise inputs are processed exclusively in transient memory states and are never persisted for model retraining or cross-customer utilization.",
    paragraphs: [
      "Enterprise prompts, documents, and operational payloads enter the agent runtime through a zero-retention ingestion pipeline. Inputs are held in ephemeral, in-memory buffers for the duration of a single execution cycle and are purged upon task completion or session termination.",
      "ScaleSystems does not utilize customer-provided data to retrain, fine-tune, or improve foundational language models. Inference is performed against pre-trained model endpoints with strict no-logging policies on raw input content.",
      "Telemetry collected during agent execution is limited to operational metadata — latency, token counts, and error codes — without capturing the substance of enterprise inputs. This architecture ensures proprietary business data remains confidential and non-contributory to any shared model corpus.",
    ],
    bullets: [
      "Transient in-memory processing with automatic purge on completion",
      "No customer data used for foundational model retraining",
      "Operational telemetry only — no raw input content logging",
    ],
  },
  {
    id: "terms-and-guardrails",
    icon: FileText,
    title: "Terms of Service & API Token Guardrails",
    summary:
      "Structural liability limitations govern platform usage, with automatic engine freezing when API consumption patterns breach defined threshold parameters.",
    paragraphs: [
      "Use of the ScaleSystems platform is governed by our Terms of Service, which establish structural liability limitations appropriate to an infrastructure provider. ScaleSystems provides agent orchestration and execution services on an as-is basis, with liability capped to the fees paid during the preceding billing period.",
      "API token guardrails enforce rate limits, throughput ceilings, and anomaly detection thresholds per plan tier. When usage patterns exceed configured parameters — including burst rates, sustained token consumption, or unauthorized endpoint access — the execution engine is automatically frozen to protect platform integrity and neighboring tenants.",
      "Engine freeze events trigger immediate notification to the account administrator. Service restoration requires acknowledgment of the breach event and, where applicable, plan tier adjustment or explicit override approval. Repeated threshold violations may result in permanent suspension under the Terms of Service.",
    ],
    bullets: [
      "Liability capped to fees paid in the preceding billing period",
      "Automatic engine freeze on threshold breach detection",
      "Administrator notification and restoration workflow on freeze events",
    ],
  },
] as const;

const NAV_ITEMS = SECTIONS.map(({ id, title }) => ({
  id,
  label: title,
}));

export default function LegalPage() {
  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-1/4 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/5 blur-[150px]" />
        <div className="absolute bottom-1/4 left-1/4 h-[400px] w-[500px] rounded-full bg-blue-500/5 blur-[130px]" />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-muted transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to home
        </Link>

        <header className="mt-8">
          <p className="text-sm font-medium tracking-wide text-cyan-accent">
            Legal &amp; Compliance
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Corporate Compliance &amp;{" "}
            <span className="text-gradient">Legal Framework</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed tracking-wide text-slate-muted sm:text-base">
            Authoritative reference for data isolation, retention policy, and
            platform usage guardrails governing the ScaleSystems enterprise
            agent infrastructure.
          </p>
        </header>

        <nav
          aria-label="Legal framework sections"
          className="glass mt-10 rounded-2xl p-4 sm:p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-muted">
            On this page
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block rounded-lg px-3 py-2 text-sm tracking-wide text-slate-100 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 flex flex-col gap-6">
          {SECTIONS.map((section, index) => {
            const Icon = section.icon;
            return (
              <article
                key={section.id}
                id={section.id}
                className="glass scroll-mt-28 rounded-2xl p-6 sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <span className="shrink-0 rounded-xl border border-white/10 bg-black/30 p-2.5">
                    <Icon
                      className="h-5 w-5 text-cyan-accent"
                      aria-hidden
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-muted">
                      Section {index + 1}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
                      {section.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed tracking-wide text-slate-muted">
                      {section.summary}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 40)}
                      className="text-sm leading-relaxed tracking-wide text-slate-100/90"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-6">
                  {section.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2.5 text-sm tracking-wide text-slate-100"
                    >
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-accent"
                        aria-hidden
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="glass mt-10 flex flex-col items-center gap-4 rounded-2xl p-6 text-center sm:p-8">
          <p className="text-sm leading-relaxed tracking-wide text-slate-muted">
            Questions about compliance, data handling, or platform terms?
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-white/10"
          >
            Contact our team
          </Link>
        </div>
      </div>
    </main>
  );
}
