"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Github,
  Layers,
  Link2,
  MessageSquare,
  Sheet,
  ShoppingBag,
  Unplug,
  X,
  type LucideIcon,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type ConnectorId = "shopify" | "slack-discord" | "google-sheets" | "github";

type ConnectorConfig = {
  apiKey: string;
  channelOrRepo: string;
  syncEnabled: boolean;
  notes: string;
};

type ConnectorState = {
  connected: boolean;
  config: ConnectorConfig;
  connectedAt: string | null;
};

type ConnectorDef = {
  id: ConnectorId;
  name: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  fields: { key: keyof ConnectorConfig; label: string; placeholder: string; secret?: boolean }[];
};

const STORAGE_KEY = "scalesystems.integrations.connectors";

const EMPTY_CONFIG: ConnectorConfig = {
  apiKey: "",
  channelOrRepo: "",
  syncEnabled: true,
  notes: "",
};

const CONNECTORS: ConnectorDef[] = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Auto-sync product inventory & order triggers into agent workflows.",
    icon: ShoppingBag,
    accent: "from-lime-400/20 to-emerald-500/10",
    fields: [
      {
        key: "apiKey",
        label: "Admin API access token",
        placeholder: "shpat_················",
        secret: true,
      },
      {
        key: "channelOrRepo",
        label: "Store domain",
        placeholder: "your-store.myshopify.com",
      },
      {
        key: "notes",
        label: "Webhook topics",
        placeholder: "orders/create, inventory_levels/update",
      },
    ],
  },
  {
    id: "slack-discord",
    name: "Slack / Discord",
    description: "Instant channel alerts & interactive bot hooks for swarm events.",
    icon: MessageSquare,
    accent: "from-indigo-400/20 to-emerald-500/10",
    fields: [
      {
        key: "apiKey",
        label: "Bot token / webhook URL",
        placeholder: "xoxb-… or https://discord.com/api/webhooks/…",
        secret: true,
      },
      {
        key: "channelOrRepo",
        label: "Default channel",
        placeholder: "#ops-alerts or #sre-bot",
      },
      {
        key: "notes",
        label: "Event routing",
        placeholder: "incident, heal_complete, quota_threshold",
      },
    ],
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Row appended / updated event triggers for spreadsheet pipelines.",
    icon: Sheet,
    accent: "from-emerald-400/25 to-teal-500/10",
    fields: [
      {
        key: "apiKey",
        label: "Service account JSON / OAuth token",
        placeholder: "Paste credentials or OAuth refresh token",
        secret: true,
      },
      {
        key: "channelOrRepo",
        label: "Spreadsheet ID",
        placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      },
      {
        key: "notes",
        label: "Watch sheet / range",
        placeholder: "Leads!A:Z",
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Push events & PR auto-remediation triggers for repo watchers.",
    icon: Github,
    accent: "from-zinc-300/15 to-emerald-500/10",
    fields: [
      {
        key: "apiKey",
        label: "Personal access token",
        placeholder: "ghp_················",
        secret: true,
      },
      {
        key: "channelOrRepo",
        label: "Repository",
        placeholder: "org/repo",
      },
      {
        key: "notes",
        label: "Events",
        placeholder: "push, pull_request, workflow_run",
      },
    ],
  },
];

function defaultStates(): Record<ConnectorId, ConnectorState> {
  return {
    shopify: { connected: false, config: { ...EMPTY_CONFIG }, connectedAt: null },
    "slack-discord": {
      connected: false,
      config: { ...EMPTY_CONFIG },
      connectedAt: null,
    },
    "google-sheets": {
      connected: false,
      config: { ...EMPTY_CONFIG },
      connectedAt: null,
    },
    github: { connected: false, config: { ...EMPTY_CONFIG }, connectedAt: null },
  };
}

function readStates(): Record<ConnectorId, ConnectorState> {
  if (typeof window === "undefined") return defaultStates();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStates();
    const parsed = JSON.parse(raw) as Partial<Record<ConnectorId, ConnectorState>>;
    const base = defaultStates();
    for (const id of Object.keys(base) as ConnectorId[]) {
      const row = parsed[id];
      if (!row) continue;
      base[id] = {
        connected: Boolean(row.connected),
        connectedAt: typeof row.connectedAt === "string" ? row.connectedAt : null,
        config: {
          ...EMPTY_CONFIG,
          ...(row.config ?? {}),
        },
      };
    }
    return base;
  } catch {
    return defaultStates();
  }
}

function writeStates(states: Record<ConnectorId, ConnectorState>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    /* ignore */
  }
}

function StatusBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.35)]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
      Not Connected
    </span>
  );
}

export default function IntegrationsHub() {
  const [states, setStates] = useState<Record<ConnectorId, ConnectorState>>(defaultStates);
  const [activeId, setActiveId] = useState<ConnectorId | null>(null);
  const [draft, setDraft] = useState<ConnectorConfig>(EMPTY_CONFIG);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStates(readStates());
    setMounted(true);
  }, []);

  const activeDef = useMemo(
    () => CONNECTORS.find((c) => c.id === activeId) ?? null,
    [activeId]
  );
  const ActiveIcon = activeDef?.icon ?? Layers;

  const openDrawer = useCallback(
    (id: ConnectorId) => {
      setActiveId(id);
      setDraft({ ...EMPTY_CONFIG, ...states[id].config });
    },
    [states]
  );

  const closeDrawer = useCallback(() => {
    setActiveId(null);
  }, []);

  const persist = useCallback(
    (next: Record<ConnectorId, ConnectorState>) => {
      setStates(next);
      writeStates(next);
    },
    []
  );

  const saveConnection = useCallback(() => {
    if (!activeId) return;
    setSaving(true);
    const next: Record<ConnectorId, ConnectorState> = {
      ...states,
      [activeId]: {
        connected: true,
        connectedAt: new Date().toISOString(),
        config: { ...draft },
      },
    };
    persist(next);
    window.setTimeout(() => {
      setSaving(false);
      setActiveId(null);
    }, 420);
  }, [activeId, draft, persist, states]);

  const disconnect = useCallback(() => {
    if (!activeId) return;
    const next: Record<ConnectorId, ConnectorState> = {
      ...states,
      [activeId]: {
        connected: false,
        connectedAt: null,
        config: { ...EMPTY_CONFIG },
      },
    };
    persist(next);
    setDraft({ ...EMPTY_CONFIG });
    setActiveId(null);
  }, [activeId, persist, states]);

  const connectedCount = useMemo(
    () => Object.values(states).filter((s) => s.connected).length,
    [states]
  );

  const drawer =
    mounted && activeDef && activeId
      ? createPortal(
          <div className="fixed inset-0 z-[80] flex justify-end">
            <button
              type="button"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Close connector drawer"
              onClick={closeDrawer}
            />
            <aside
              role="dialog"
              aria-modal
              aria-labelledby="connector-drawer-title"
              className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#09090B]/95 shadow-[-24px_0_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
            >
              <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-gradient-to-br ${activeDef.accent}`}
                  >
                    <ActiveIcon className="h-5 w-5 text-emerald-300" aria-hidden />
                  </span>
                  <div>
                    <h2
                      id="connector-drawer-title"
                      className="font-display text-base font-bold text-white"
                    >
                      {states[activeId].connected ? "Configure" : "Connect"}{" "}
                      {activeDef.name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-dim">{activeDef.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <StatusBadge connected={states[activeId].connected} />

                {activeDef.fields.map((field) => (
                  <label key={field.key} className="block space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-dim">
                      {field.label}
                    </span>
                    <input
                      type={field.secret ? "password" : "text"}
                      value={String(draft[field.key] ?? "")}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30"
                      autoComplete="off"
                    />
                  </label>
                ))}

                <label className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-3">
                  <span className="text-xs text-slate-muted">Enable live sync</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.syncEnabled}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, syncEnabled: !prev.syncEnabled }))
                    }
                    className={`relative h-6 w-11 rounded-full border transition ${
                      draft.syncEnabled
                        ? "border-emerald-500/50 bg-emerald-500/30"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition ${
                        draft.syncEnabled
                          ? "left-[22px] shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                          : "left-0.5"
                      }`}
                    />
                  </button>
                </label>
              </div>

              <footer className="flex flex-wrap items-center gap-2 border-t border-white/5 px-5 py-4">
                {states[activeId].connected ? (
                  <button
                    type="button"
                    onClick={disconnect}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                  >
                    <Unplug className="h-3.5 w-3.5" aria-hidden />
                    Disconnect
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={saveConnection}
                  disabled={saving || !draft.apiKey.trim()}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {states[activeId].connected ? "Save configuration" : "Connect"}
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
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <Hover3DIcon intensity={14}>
              <Layers className="h-5 w-5 text-emerald-400" aria-hidden />
            </Hover3DIcon>
          </span>
          <div>
            <h1 className="font-display text-lg font-bold tracking-wide text-white">
              Integrations Hub
            </h1>
            <p className="mt-1 text-xs text-slate-dim">
              Native connectors for commerce, chat, sheets, and source control.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-[11px] text-slate-muted">
          <span className="text-emerald-400">{connectedCount}</span>
          <span className="text-slate-600">/</span>
          <span>{CONNECTORS.length}</span>
          <span className="ml-1 text-slate-dim">connected</span>
        </span>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CONNECTORS.map((connector) => {
          const Icon = connector.icon;
          const state = states[connector.id];
          return (
            <article
              key={connector.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-5 backdrop-blur-xl transition hover:border-emerald-500/25"
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${connector.accent} opacity-60`}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/40">
                  <Hover3DIcon intensity={16}>
                    <Icon className="h-5 w-5 text-emerald-300" aria-hidden />
                  </Hover3DIcon>
                </span>
                <StatusBadge connected={state.connected} />
              </div>
              <h2 className="relative mt-4 font-display text-base font-bold text-white">
                {connector.name}
              </h2>
              <p className="relative mt-2 flex-1 text-xs leading-relaxed text-slate-dim">
                {connector.description}
              </p>
              <button
                type="button"
                onClick={() => openDrawer(connector.id)}
                className="relative mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition group-hover:bg-emerald-500/20"
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                {state.connected ? "Configure" : "Connect"}
              </button>
            </article>
          );
        })}
      </div>

      {drawer}
    </div>
  );
}
