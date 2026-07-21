"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Loader2,
  Radio,
  Save,
  Smartphone,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";
import { useAlertToasts } from "@/components/dashboard/AlertToastContext";

const STORAGE_KEY = "scalesystems.admin.discordWebhookUrl";

function isDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname === "discord.com" || u.hostname === "discordapp.com") &&
      u.pathname.includes("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

function maskUrl(url: string): string {
  if (url.length < 28) return "••••••••";
  return `${url.slice(0, 42)}…${url.slice(-6)}`;
}

export default function DiscordWebhookConfig() {
  const { pushAlert } = useAlertToasts();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
      setWebhookUrl(stored);
      setSavedUrl(stored);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback(() => {
    const trimmed = webhookUrl.trim();
    if (trimmed && !isDiscordWebhook(trimmed)) {
      pushAlert({
        title: "Invalid Discord webhook",
        detail: "URL must be a discord.com/api/webhooks/… endpoint.",
        tone: "threshold",
      });
      return;
    }
    setSaving(true);
    try {
      if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed);
      else window.localStorage.removeItem(STORAGE_KEY);
      setSavedUrl(trimmed);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
      pushAlert({
        title: trimmed ? "Webhook saved" : "Webhook cleared",
        detail: trimmed
          ? "Mobile Discord alerts will use this endpoint."
          : "Discord dispatch disabled until a URL is set.",
        tone: "heal",
      });
    } finally {
      setSaving(false);
    }
  }, [pushAlert, webhookUrl]);

  const testAlert = useCallback(async () => {
    const target = (webhookUrl.trim() || savedUrl).trim();
    if (!target || !isDiscordWebhook(target)) {
      pushAlert({
        title: "Webhook required",
        detail: "Save a valid Discord webhook URL before testing.",
        tone: "threshold",
      });
      return;
    }

    setTesting(true);
    try {
      const res = await fetch("/api/admin/discord-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: target }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? `Dispatch failed (${res.status})`);
      }

      pushAlert({
        title: "Test alert dispatched",
        detail: "Check Discord on your phone for the rich embed ping.",
        tone: "heal",
      });
    } catch (err) {
      pushAlert({
        title: "Dispatch failed",
        detail:
          err instanceof Error
            ? err.message
            : "Could not reach Discord webhook.",
        tone: "incident",
      });
    } finally {
      setTesting(false);
    }
  }, [pushAlert, savedUrl, webhookUrl]);

  const dirty = webhookUrl.trim() !== savedUrl;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel overflow-hidden"
      aria-label="Discord webhook configuration"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <Hover3DIcon intensity={12}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
              <Radio className="h-4 w-4 text-emerald-400" aria-hidden />
            </span>
          </Hover3DIcon>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
              Discord dispatch
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-white">
              Mobile alert webhook
            </h3>
            <p className="mt-1 max-w-md text-[12px] text-slate-muted">
              Configure the Discord webhook URL used for Meta-SRE mobile
              alerts. Test sends a structured rich embed to your phone.
            </p>
          </div>
        </div>
        {hydrated && savedUrl ? (
          <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-400">
            armed · {maskUrl(savedUrl)}
          </span>
        ) : (
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-dim">
            not configured
          </span>
        )}
      </div>

      <div className="space-y-3 bg-[#040907]/40 p-4">
        <label
          htmlFor="discord-webhook-url"
          className="block text-[11px] font-medium text-slate-muted"
        >
          Discord Webhook URL
        </label>
        <input
          id="discord-webhook-url"
          type="url"
          autoComplete="off"
          spellCheck={false}
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          className="w-full rounded-lg border border-white/10 bg-obsidian/80 px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-dim outline-none transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30"
        />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={persist}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savedFlash ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            {savedFlash ? "Saved" : "Save webhook"}
          </button>
          <button
            type="button"
            onClick={() => void testAlert()}
            disabled={testing || !(webhookUrl.trim() || savedUrl)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-accent/30 bg-cyan-accent/10 px-3 py-2 text-xs font-semibold text-cyan-accent transition hover:bg-cyan-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Smartphone className="h-3.5 w-3.5" aria-hidden />
            )}
            {testing ? "Sending…" : "Test Mobile Alert"}
          </button>
        </div>
      </div>
    </motion.section>
  );
}
