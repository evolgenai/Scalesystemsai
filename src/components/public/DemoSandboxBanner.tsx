"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, FlaskConical, LayoutTemplate, Sparkles, Zap } from "lucide-react";
import {
  GAS_BALANCE_KEY,
  TENANT_STORAGE_KEY,
  type OnboardingTenant,
} from "@/components/onboarding/OnboardingWizard";

export const DEMO_SANDBOX_STORAGE_KEY = "scalesystems.demoSandbox.v1";
export const DEMO_SANDBOX_GAS = 10_000;

export type DemoSandboxWorkspace = {
  name: string;
  slug: string;
  template: OnboardingTenant["template"];
  gasClaimed: number;
  provisionedAt: string;
  isDemo: true;
};

const DEMO_TEMPLATES: OnboardingTenant["template"][] = [
  "ecom-scraper",
  "sre-monitor",
  "content-swarm",
];

export function provisionDemoSandbox(): DemoSandboxWorkspace {
  const workspace: DemoSandboxWorkspace = {
    name: "Demo Sandbox",
    slug: "demo-sandbox",
    template: "content-swarm",
    gasClaimed: DEMO_SANDBOX_GAS,
    provisionedAt: new Date().toISOString(),
    isDemo: true,
  };

  try {
    const tenant: OnboardingTenant = {
      name: workspace.name,
      slug: workspace.slug,
      template: workspace.template,
      gasClaimed: workspace.gasClaimed,
      completedAt: workspace.provisionedAt,
    };

    window.localStorage.setItem(DEMO_SANDBOX_STORAGE_KEY, JSON.stringify(workspace));
    window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(tenant));
    window.localStorage.setItem(GAS_BALANCE_KEY, String(DEMO_SANDBOX_GAS));
    window.localStorage.setItem(
      "scalesystems.demo.templates",
      JSON.stringify(DEMO_TEMPLATES)
    );

    window.dispatchEvent(
      new CustomEvent("scalesystems:demo-sandbox", { detail: workspace })
    );
    window.dispatchEvent(
      new CustomEvent("scalesystems:gas-balance", {
        detail: { balance: DEMO_SANDBOX_GAS },
      })
    );
  } catch {
    /* ignore quota / private mode */
  }

  return workspace;
}

export function readDemoSandbox(): DemoSandboxWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SANDBOX_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoSandboxWorkspace;
  } catch {
    return null;
  }
}

type DemoSandboxBannerProps = {
  className?: string;
};

export default function DemoSandboxBanner({ className = "" }: DemoSandboxBannerProps) {
  const router = useRouter();
  const [provisioning, setProvisioning] = useState(false);

  const handleTryDemo = useCallback(() => {
    setProvisioning(true);
    provisionDemoSandbox();
    // Soft delay so the glass CTA pulse reads as intentional
    window.setTimeout(() => {
      router.push("/dashboard?demo=1&tour=true");
    }, 280);
  }, [router]);

  return (
    <motion.aside
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08 }}
      className={`relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/[0.12] via-white/[0.03] to-cyan-accent/[0.08] p-4 shadow-[0_0_40px_rgba(0, 102, 255,0.12)] backdrop-blur-xl sm:p-5 ${className}`}
      aria-label="Demo sandbox offer"
    >
      <div
        className="pointer-events-none absolute -left-10 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-blue-400/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-accent/15 blur-2xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="inline-flex shrink-0 rounded-xl border border-blue-500/35 bg-blue-500/15 p-2.5 shadow-[0_0_20px_rgba(0, 102, 255,0.2)]">
            <FlaskConical className="h-5 w-5 text-blue-400" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400/90">
              Instant demo · no credit card
            </p>
            <p className="mt-1 font-display text-base font-semibold text-white sm:text-lg">
              Try Demo Sandbox
            </p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-muted">
              One click provisions a temporary workspace with{" "}
              <span className="font-mono text-blue-300">
                ⚡ {DEMO_SANDBOX_GAS.toLocaleString("en-US")} GAS
              </span>{" "}
              and pre-built swarm templates.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] text-blue-300/90">
                <Zap className="h-3 w-3" aria-hidden />
                {DEMO_SANDBOX_GAS.toLocaleString("en-US")} GAS
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] text-slate-muted">
                <LayoutTemplate className="h-3 w-3 text-blue-400" aria-hidden />
                3 templates
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] text-slate-muted">
                <Sparkles className="h-3 w-3 text-blue-400" aria-hidden />
                Ephemeral
              </span>
            </div>
          </div>
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: provisioning ? 1 : 1.02 }}
          whileTap={{ scale: provisioning ? 1 : 0.98 }}
          disabled={provisioning}
          onClick={handleTryDemo}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(0, 102, 255,0.4)] transition hover:bg-blue-400 disabled:cursor-wait disabled:opacity-80"
        >
          {provisioning ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#09090B]/30 border-t-[#09090B]" />
              Provisioning…
            </>
          ) : (
            <>
              Try Demo Sandbox
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </motion.button>
      </div>

    </motion.aside>
  );
}
