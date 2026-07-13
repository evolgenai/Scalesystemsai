"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Copy,
  Check,
  ShieldAlert,
  Lock,
  Sparkles,
} from "lucide-react";
import { generateAPIKey } from "@/lib/generateAPIKey";

export default function ApiKeyManagementPanel() {
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setCopied(false);

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const token = await generateAPIKey();
      setGeneratedKey(token);
      setIsVisible(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedKey) return;

    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDismiss = () => {
    setGeneratedKey(null);
    setIsVisible(false);
    setCopied(false);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Production API Key Management
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Issue scoped runtime tokens for secure agent orchestration
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/20 bg-cyan-accent/5 px-3 py-1.5 text-xs text-cyan-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Cryptographic issuance
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
        <div className="border-b border-white/10 bg-black/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-cyan-accent" aria-hidden />
            <span className="text-sm font-medium text-white">
              Live Production Token
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-dim">
            Single-exposure issuance · memory-only display
          </p>
        </div>

        <div className="space-y-5 p-5">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-accent px-5 py-3 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Generating secure token...
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" aria-hidden />
                Generate Live Production Token
              </>
            )}
          </button>

          <AnimatePresence>
            {generatedKey && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                <div className="relative">
                  <input
                    type={isVisible ? "text" : "password"}
                    readOnly
                    value={generatedKey}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-24 font-mono text-xs text-white sm:text-sm"
                    aria-label="Generated production API key"
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsVisible((v) => !v)}
                      className="rounded-md p-1.5 text-slate-dim transition-colors hover:text-cyan-accent"
                      aria-label={isVisible ? "Hide token" : "Show token"}
                    >
                      {isVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-accent/30 bg-cyan-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-accent transition-colors hover:bg-cyan-accent/20"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-cyan-accent/5 to-cyan-accent/10 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                    <p className="text-xs leading-relaxed text-amber-100/90">
                      <span className="font-semibold text-amber-300">
                        Security Alert:
                      </span>{" "}
                      This production key will only be shown once. Secure it
                      immediately. ScaleSystems does not store unhashed raw keys
                      on cloud ledgers.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-rose-500/40 hover:text-rose-200"
                >
                  <Lock className="h-4 w-4" aria-hidden />
                  Dismiss &amp; Lock
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
