"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

export type ApiKeyStatus = "active" | "revoked";

export type ApiKeyRow = {
  id: string;
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: ApiKeyStatus;
};

type RevealState = {
  token: string;
  id: string;
} | null;

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "Never";
  try {
    return new Date(raw).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return raw;
  }
}

function normalizeKeys(payload: unknown): ApiKeyRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { keys?: unknown; apiKeys?: unknown; items?: unknown };
  const list = Array.isArray(root.keys)
    ? root.keys
    : Array.isArray(root.apiKeys)
      ? root.apiKeys
      : Array.isArray(root.items)
        ? root.items
        : [];

  const rows: ApiKeyRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? row.keyId ?? "").trim();
    if (!id) continue;

    const maskedKey = String(
      row.maskedKey ??
        row.masked ??
        row.prefix ??
        row.lastFour ??
        `sk_live_••••••••${String(row.suffix ?? "xyz")}`
    );

    rows.push({
      id,
      maskedKey,
      createdAt: String(row.createdAt ?? row.created ?? ""),
      lastUsedAt: row.lastUsedAt
        ? String(row.lastUsedAt)
        : row.lastUsed
          ? String(row.lastUsed)
          : null,
      status:
        row.status === "revoked" || row.revoked === true ? "revoked" : "active",
    });
  }
  return rows;
}

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealState>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/orgs/apikeys", {
        headers: { Accept: "application/json", ...getClientAuthHeaders() },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `Unable to load API keys (HTTP ${response.status})`;
        setError(message);
        setKeys([]);
        return;
      }
      setKeys(normalizeKeys(payload));
    } catch {
      setError("Network error while loading API keys.");
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/orgs/apikeys", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        key?: { id?: string; token?: string };
        token?: string;
        id?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? payload.message ?? "Failed to generate API key.");
        return;
      }

      const token =
        payload.key?.token ?? payload.token ?? "";
      const id = payload.key?.id ?? payload.id ?? "";

      if (!token) {
        setError("Key created but token was not returned.");
        await loadKeys();
        return;
      }

      setReveal({ token, id });
      setCopied(false);
      await loadKeys();
    } catch {
      setError("Network error while generating API key.");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevokingId(keyId);
    setError(null);
    try {
      const response = await fetch("/api/orgs/apikeys", {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ id: keyId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Failed to revoke API key.";
        setError(message);
        return;
      }
      setKeys((prev) =>
        prev.map((row) =>
          row.id === keyId ? { ...row, status: "revoked" as const } : row
        )
      );
    } catch {
      setError("Network error while revoking API key.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopyReveal = async () => {
    if (!reveal?.token) return;
    try {
      await navigator.clipboard.writeText(reveal.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const dismissReveal = () => {
    setReveal(null);
    setCopied(false);
  };

  const activeKeys = keys.filter((row) => row.status === "active");

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-accent/20 bg-white/[0.03] shadow-glow-sm backdrop-blur-md">
      <header className="flex flex-col gap-3 border-b border-white/10 bg-black/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-cyan-accent/30 bg-cyan-accent/10 p-2">
            <KeyRound className="h-4 w-4 text-cyan-accent" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Developer API Keys
            </h2>
            <p className="mt-0.5 text-xs text-slate-muted">
              Provision programmatic tokens for swarm orchestration
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-accent px-4 py-2.5 text-xs font-semibold text-obsidian shadow-glow-sm transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-70"
        >
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Generating…
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Generate New Key
            </>
          )}
        </button>
      </header>

      <div className="p-5">
        {error ? (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-dim">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-accent" aria-hidden />
            Loading API keys…
          </div>
        ) : activeKeys.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-dim">
            No active API keys. Generate one to enable programmatic swarm access.
          </p>
        ) : (
          <ul className="space-y-2">
            {activeKeys.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-mono text-sm text-cyan-accent">
                    {row.maskedKey}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-dim">
                    <span>Created {formatDate(row.createdAt)}</span>
                    <span>Last used {formatDate(row.lastUsedAt)}</span>
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(row.id)}
                  disabled={revokingId === row.id}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-60"
                >
                  {revokingId === row.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-3 w-3" aria-hidden />
                  )}
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}

        {keys.some((row) => row.status === "revoked") ? (
          <p className="mt-4 text-[11px] text-slate-dim">
            {keys.filter((row) => row.status === "revoked").length} revoked key
            {keys.filter((row) => row.status === "revoked").length === 1 ? "" : "s"}{" "}
            hidden from active list.
          </p>
        ) : null}
      </div>

      <AnimatePresence>
        {reveal ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-key-reveal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-accent/35 bg-obsidian shadow-glow-amber"
            >
              <div className="border-b border-white/10 bg-gradient-to-r from-amber-accent/10 via-cyan-accent/5 to-transparent px-5 py-4">
                <h3
                  id="api-key-reveal-title"
                  className="font-display text-lg font-semibold text-white"
                >
                  Save your API key
                </h3>
                <p className="mt-1 text-xs text-slate-muted">
                  This is the only time the full key will be displayed.
                </p>
              </div>

              <div className="space-y-4 p-5">
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={reveal.token}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 pr-28 font-mono text-xs text-white"
                    aria-label="Full API key"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyReveal()}
                    className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-lg border border-cyan-accent/30 bg-cyan-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-accent"
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

                <div className="flex items-start gap-3 rounded-xl border border-amber-accent/25 bg-amber-accent/10 px-4 py-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-accent" aria-hidden />
                  <p className="text-xs leading-relaxed text-amber-100/90">
                    Store this key securely. It cannot be retrieved again after you
                    close this dialog.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={dismissReveal}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-accent/40"
                >
                  I&apos;ve saved my key
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
