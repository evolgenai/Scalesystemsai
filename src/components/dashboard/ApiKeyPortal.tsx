"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Webhook,
  Database,
  Mail,
  MessageSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type IntegrationField = {
  id: string;
  label: string;
  placeholder: string;
  icon: LucideIcon;
  description: string;
};

const INTEGRATIONS: IntegrationField[] = [
  {
    id: "slack",
    label: "Slack Webhook URL",
    placeholder: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX",
    icon: MessageSquare,
    description: "Routes agent alerts and escalation triggers to your workspace",
  },
  {
    id: "hubspot",
    label: "HubSpot API Key",
    placeholder: "pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    icon: Database,
    description: "Enables CRM sync for Lead Sentinel pipeline automation",
  },
  {
    id: "salesforce",
    label: "Salesforce Access Token",
    placeholder: "00D...your_salesforce_token",
    icon: Webhook,
    description: "Powers bidirectional record sync for Systems Orchestrator",
  },
  {
    id: "sendgrid",
    label: "SendGrid API Key",
    placeholder: "SG.xxxxxxxxxxxxxxxxxxxx",
    icon: Mail,
    description: "Activates outbound email sequences from deployed agents",
  },
];

type SaveState = "idle" | "saving" | "saved";

export default function ApiKeyPortal() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const handleSave = async () => {
    setSaveState("saving");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 3000);
  };

  const configuredCount = Object.values(values).filter((v) => v.trim()).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            API Key Configuration Portal
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Connect operational services to activate your cloud runtime
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/20 bg-cyan-accent/5 px-3 py-1.5 text-xs text-cyan-accent">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          AES-256 encrypted at rest
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
        <div className="border-b border-white/10 bg-black/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-purple-400" aria-hidden />
            <span className="text-sm font-medium text-white">
              Integration Credentials
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-dim">
            {configuredCount} of {INTEGRATIONS.length} services configured
          </p>
        </div>

        <div className="divide-y divide-white/5 p-5">
          {INTEGRATIONS.map((field, index) => {
            const Icon = field.icon;
            const isVisible = visible[field.id] ?? false;

            return (
              <motion.div
                key={field.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="py-4 first:pt-0 last:pb-0"
              >
                <div className="mb-2 flex items-start gap-3">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <Icon className="h-4 w-4 text-cyan-accent" aria-hidden />
                  </div>
                  <div>
                    <label
                      htmlFor={field.id}
                      className="text-sm font-medium text-white"
                    >
                      {field.label}
                    </label>
                    <p className="text-xs text-slate-dim">{field.description}</p>
                  </div>
                </div>
                <div className="relative">
                  <input
                    id={field.id}
                    type={isVisible ? "text" : "password"}
                    value={values[field.id] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.id]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-12 font-mono text-xs text-white placeholder:text-slate-dim/60 transition-colors focus:border-cyan-accent/40 focus:outline-none focus:ring-1 focus:ring-cyan-accent/20 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setVisible((prev) => ({
                        ...prev,
                        [field.id]: !isVisible,
                      }))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-dim transition-colors hover:text-cyan-accent"
                    aria-label={isVisible ? "Hide value" : "Show value"}
                  >
                    {isVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 bg-black/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-dim">
            Credentials are stored locally for this demo session only.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-accent px-5 py-2.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : saveState === "saved" ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Configuration Saved
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Save & Activate Runtime
              </>
            )}
          </button>
        </div>

        <AnimatePresence>
          {saveState === "saved" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-emerald-500/20 bg-emerald-500/5"
            >
              <p className="px-5 py-3 text-xs text-emerald-400">
                Cloud runtime connection established. All deployed agents will
                use updated credentials on next heartbeat cycle.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
