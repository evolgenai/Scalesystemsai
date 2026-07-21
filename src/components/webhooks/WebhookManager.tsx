"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Braces,
  Check,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Webhook,
  X,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type InboundWebhook = {
  id: string;
  name: string;
  endpoint: string;
  secret: string;
  createdAt: string;
  lastPayload: string | null;
  lastReceivedAt: string | null;
};

const STORAGE_KEY = "scalesystems.webhooks.inbound";
const ENDPOINT_BASE = "https://scalesystemsai.vercel.app/api/v1/webhooks";

function randomId(prefix: string, bytes = 8): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return `${prefix}${Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function samplePayload(name: string): string {
  return JSON.stringify(
    {
      event: "inbound.webhook.received",
      webhook: name,
      receivedAt: new Date().toISOString(),
      headers: {
        "content-type": "application/json",
        "x-scalesystems-signature": "sha256=demo",
      },
      body: {
        source: "external-system",
        action: "sync",
        records: [
          { id: "rec_01", status: "ok" },
          { id: "rec_02", status: "queued" },
        ],
      },
    },
    null,
    2
  );
}

function readWebhooks(): InboundWebhook[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InboundWebhook[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWebhooks(rows: InboundWebhook[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function CopyBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [value]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-black/40">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-muted transition hover:border-blue-500/30 hover:text-blue-300"
        >
          {copied ? (
            <Check className="h-3 w-3 text-blue-400" aria-hidden />
          ) : (
            <Copy className="h-3 w-3" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="block break-all px-3 py-2.5 font-mono text-[11px] leading-relaxed text-blue-300/90">
        {value}
      </code>
    </div>
  );
}

export default function WebhookManager() {
  const [webhooks, setWebhooks] = useState<InboundWebhook[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setWebhooks(readWebhooks());
    setMounted(true);
  }, []);

  const persist = useCallback((rows: InboundWebhook[]) => {
    setWebhooks(rows);
    writeWebhooks(rows);
  }, []);

  const createWebhook = useCallback(() => {
    const name = nameDraft.trim() || `Inbound ${webhooks.length + 1}`;
    const id = randomId("wh_");
    const row: InboundWebhook = {
      id,
      name,
      endpoint: `${ENDPOINT_BASE}/${id}`,
      secret: randomId("whsec_", 16),
      createdAt: new Date().toISOString(),
      lastPayload: samplePayload(name),
      lastReceivedAt: new Date().toISOString(),
    };
    persist([row, ...webhooks]);
    setNameDraft("");
    setCreateOpen(false);
    setInspectorId(id);
  }, [nameDraft, persist, webhooks]);

  const removeWebhook = useCallback(
    (id: string) => {
      persist(webhooks.filter((w) => w.id !== id));
      if (inspectorId === id) setInspectorId(null);
    },
    [inspectorId, persist, webhooks]
  );

  const simulatePayload = useCallback(
    (id: string) => {
      const next = webhooks.map((w) =>
        w.id === id
          ? {
              ...w,
              lastPayload: samplePayload(w.name),
              lastReceivedAt: new Date().toISOString(),
            }
          : w
      );
      persist(next);
      setInspectorId(id);
    },
    [persist, webhooks]
  );

  const inspector = useMemo(
    () => webhooks.find((w) => w.id === inspectorId) ?? null,
    [inspectorId, webhooks]
  );

  const createDrawer =
    mounted && createOpen
      ? createPortal(
          <div className="fixed inset-0 z-[80] flex justify-end">
            <button
              type="button"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Close create webhook drawer"
              onClick={() => setCreateOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal
              aria-labelledby="create-webhook-title"
              className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#09090B]/95 shadow-[-24px_0_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
            >
              <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div>
                  <h2
                    id="create-webhook-title"
                    className="font-display text-base font-bold text-white"
                  >
                    Create Inbound Webhook
                  </h2>
                  <p className="mt-1 text-xs text-slate-dim">
                    Generates a public endpoint and signing secret for this workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>
              <div className="flex-1 space-y-4 px-5 py-5">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                    Display name
                  </span>
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Shopify orders · Stripe events"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/30"
                    autoFocus
                  />
                </label>
                <p className="rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-3 text-[11px] leading-relaxed text-slate-dim">
                  Endpoint format:{" "}
                  <span className="font-mono text-blue-300/80">
                    {ENDPOINT_BASE}/wh_…
                  </span>
                </p>
              </div>
              <footer className="border-t border-white/5 px-5 py-4">
                <button
                  type="button"
                  onClick={createWebhook}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-3.5 py-2.5 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/25"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Generate endpoint
                </button>
              </footer>
            </aside>
          </div>,
          document.body
        )
      : null;

  const inspectorDrawer =
    mounted && inspector
      ? createPortal(
          <div className="fixed inset-0 z-[80] flex justify-end">
            <button
              type="button"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Close payload inspector"
              onClick={() => setInspectorId(null)}
            />
            <aside
              role="dialog"
              aria-modal
              aria-labelledby="payload-inspector-title"
              className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#09090B]/95 shadow-[-24px_0_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
            >
              <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10">
                    <Braces className="h-5 w-5 text-blue-400" aria-hidden />
                  </span>
                  <div>
                    <h2
                      id="payload-inspector-title"
                      className="font-display text-base font-bold text-white"
                    >
                      Payload Inspector
                    </h2>
                    <p className="mt-1 text-xs text-slate-dim">{inspector.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectorId(null)}
                  className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <CopyBlock value={inspector.endpoint} label="Inbound endpoint" />
                <div className="overflow-hidden rounded-xl border border-white/5 bg-black/40">
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
                      Signing secret
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedSecrets((prev) => ({
                          ...prev,
                          [inspector.id]: !prev[inspector.id],
                        }))
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-muted transition hover:border-blue-500/30 hover:text-blue-300"
                    >
                      {revealedSecrets[inspector.id] ? (
                        <EyeOff className="h-3 w-3" aria-hidden />
                      ) : (
                        <Eye className="h-3 w-3" aria-hidden />
                      )}
                      {revealedSecrets[inspector.id] ? "Hide" : "Reveal"}
                    </button>
                  </div>
                  <code className="block break-all px-3 py-2.5 font-mono text-[11px] text-blue-300/90">
                    {revealedSecrets[inspector.id]
                      ? inspector.secret
                      : "•".repeat(Math.min(inspector.secret.length, 36))}
                  </code>
                </div>

                <div className="overflow-hidden rounded-xl border border-blue-500/20 bg-black/50 shadow-[0_0_28px_rgba(0, 102, 255,0.08)]">
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80">
                      Live JSON HTTP payload
                    </span>
                    <span className="font-mono text-[10px] text-slate-dim">
                      {inspector.lastReceivedAt
                        ? new Date(inspector.lastReceivedAt).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <pre className="max-h-[min(52vh,480px)] overflow-auto px-3 py-3 font-mono text-[11px] leading-relaxed text-blue-200/90">
                    {inspector.lastPayload ?? "{\n  \"awaiting\": \"first request\"\n}"}
                  </pre>
                </div>
              </div>

              <footer className="flex gap-2 border-t border-white/5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => simulatePayload(inspector.id)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-3.5 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/25"
                >
                  Simulate inbound POST
                </button>
              </footer>
            </aside>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-5 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10">
            <Hover3DIcon intensity={14}>
              <Webhook className="h-5 w-5 text-blue-400" aria-hidden />
            </Hover3DIcon>
          </span>
          <div>
            <h1 className="font-display text-lg font-bold tracking-wide text-white">
              Inbound Webhooks
            </h1>
            <p className="mt-1 text-xs text-slate-dim">
              Create endpoints, manage secrets, and inspect live JSON payloads.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-3.5 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/25"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Create Inbound Webhook
        </button>
      </header>

      {webhooks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center backdrop-blur-xl">
          <Webhook className="mx-auto h-8 w-8 text-blue-400/70" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-white">No inbound webhooks yet</p>
          <p className="mt-1 text-xs text-slate-dim">
            Generate an endpoint to start receiving external HTTP events.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Inbound webhooks">
          {webhooks.map((hook) => {
            const revealed = Boolean(revealedSecrets[hook.id]);
            return (
              <li
                key={hook.id}
                className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur-xl"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{hook.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-dim">
                      {hook.id} · created {new Date(hook.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectorId(hook.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] font-semibold text-slate-muted transition hover:border-blue-500/30 hover:text-blue-300"
                    >
                      <Braces className="h-3.5 w-3.5" aria-hidden />
                      Inspect payload
                    </button>
                    <button
                      type="button"
                      onClick={() => removeWebhook(hook.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Delete
                    </button>
                  </div>
                </div>

                <CopyBlock value={hook.endpoint} label="Endpoint URL" />

                <div className="overflow-hidden rounded-xl border border-white/5 bg-black/40">
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
                      Secret key
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedSecrets((prev) => ({
                          ...prev,
                          [hook.id]: !prev[hook.id],
                        }))
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-muted transition hover:border-blue-500/30 hover:text-blue-300"
                    >
                      {revealed ? (
                        <EyeOff className="h-3 w-3" aria-hidden />
                      ) : (
                        <Eye className="h-3 w-3" aria-hidden />
                      )}
                      {revealed ? "Hide" : "Reveal"}
                    </button>
                  </div>
                  <code className="block break-all px-3 py-2.5 font-mono text-[11px] text-blue-300/90">
                    {revealed
                      ? hook.secret
                      : "•".repeat(Math.min(hook.secret.length, 36))}
                  </code>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createDrawer}
      {inspectorDrawer}
    </div>
  );
}
