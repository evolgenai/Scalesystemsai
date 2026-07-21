"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Check,
  ChevronDown,
  Cpu,
  Plus,
  UserRound,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { getActiveOrgId, setActiveOrgId } from "@/lib/org/activeOrg";
import {
  WORKSPACE_PRESETS,
  getActiveWorkspaceKey,
  getWorkspacePreset,
  setActiveWorkspaceKey,
} from "@/lib/org/workspacePresets";
import type { OrgSummary } from "@/lib/org/types";

type WorkspaceSwitcherProps = {
  enabled: boolean;
};

/** Demo compute consumption keyed by preset / org slug — UI-only. */
const PRESET_COMPUTE: Record<
  string,
  { loadPct: number; label: string; tone: "idle" | "moderate" | "hot" }
> = {
  personal: { loadPct: 12, label: "12% CPU", tone: "idle" },
  meerendal: { loadPct: 68, label: "68% CPU", tone: "moderate" },
  production: { loadPct: 91, label: "91% CPU", tone: "hot" },
};

function computeForOrg(slug: string): {
  loadPct: number;
  label: string;
  tone: "idle" | "moderate" | "hot";
} {
  const hash = slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const loadPct = 18 + (hash % 72);
  const tone =
    loadPct >= 80 ? "hot" : loadPct >= 45 ? "moderate" : "idle";
  return { loadPct, label: `${loadPct}% CPU`, tone };
}

function ComputeBadge({
  loadPct,
  label,
  tone,
}: {
  loadPct: number;
  label: string;
  tone: "idle" | "moderate" | "hot";
}) {
  const toneClass =
    tone === "hot"
      ? "border-amber-400/35 bg-amber-400/10 text-amber-300"
      : tone === "moderate"
        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
        : "border-white/10 bg-white/[0.04] text-zinc-400";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${toneClass}`}
      title={`Active compute · ${loadPct}%`}
    >
      <Cpu className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

export default function WorkspaceSwitcher({ enabled }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrgId, setActive] = useState<string | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState("personal");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadOrgs = useCallback(async () => {
    if (!enabled) {
      setOrgs([]);
      return;
    }
    try {
      const response = await fetch("/api/orgs", {
        headers: { Accept: "application/json", ...getClientAuthHeaders() },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        organizations?: OrgSummary[];
      };
      if (response.ok && payload.success) {
        setOrgs(payload.organizations ?? []);
      }
    } catch {
      // Silent — header switcher stays personal-only.
    }
  }, [enabled]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setActive(getActiveOrgId());
    setWorkspaceKey(getActiveWorkspaceKey());
    void loadOrgs();

    const onOrgChanged = () => {
      setActive(getActiveOrgId());
      void loadOrgs();
    };
    const onWorkspaceChanged = () => {
      setWorkspaceKey(getActiveWorkspaceKey());
    };
    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    window.addEventListener(
      "scalesystems:workspace-changed",
      onWorkspaceChanged
    );
    return () => {
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
      window.removeEventListener(
        "scalesystems:workspace-changed",
        onWorkspaceChanged
      );
    };
  }, [loadOrgs]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreateOpen(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen]);

  const activeOrg = orgs.find((org) => org.id === activeOrgId) ?? null;
  const activePreset = getWorkspacePreset(workspaceKey);
  const label = activeOrg ? activeOrg.name : activePreset.name;

  const selectPreset = (key: string) => {
    setActiveWorkspaceKey(key);
    setWorkspaceKey(key);
    // Preset tenancy is orthogonal to org membership — clear org scope for personal.
    if (key === "personal") {
      setActiveOrgId(null);
      setActive(null);
    }
    setOpen(false);
  };

  const selectOrg = (orgId: string) => {
    setActiveOrgId(orgId);
    setActive(orgId);
    setOpen(false);
  };

  const openCreateModal = () => {
    setOpen(false);
    setCreateOpen(true);
    setError(null);
    setName("");
  };

  const createOrg = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/orgs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        organization?: OrgSummary;
      };
      if (!response.ok || !payload.success || !payload.organization) {
        setError(payload.error ?? "Create failed.");
        setPending(false);
        return;
      }

      setActiveOrgId(payload.organization.id);
      setActive(payload.organization.id);
      await loadOrgs();
      setName("");
      setCreateOpen(false);
      setOpen(false);
    } catch {
      setError("Network error creating organization.");
    } finally {
      setPending(false);
    }
  };

  if (!enabled) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex max-w-[14rem] items-center gap-2 rounded-lg border border-white/5 bg-[#121212] px-2.5 py-1.5 text-left transition hover:border-emerald-500/30"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
      >
        {activeOrg ? (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
        ) : (
          <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-muted" aria-hidden />
        )}
        <span className="min-w-0 truncate text-xs font-medium text-white">
          {label}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-dim transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-lg border border-white/5 bg-[#121212] shadow-2xl"
        >
          <div className="border-b border-white/5 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
              Tenancy workspace
            </p>
          </div>

          <div className="px-2 py-1.5">
            <p className="px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Isolated scopes
            </p>
            {WORKSPACE_PRESETS.map((preset) => {
              const selected =
                !activeOrgId && workspaceKey === preset.key;
              const compute =
                PRESET_COMPUTE[preset.key] ?? PRESET_COMPUTE.personal!;
              return (
                <button
                  key={preset.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectPreset(preset.key)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition ${
                    selected
                      ? "border-l-2 border-l-emerald-400 bg-emerald-500/10 text-white"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <UserRound
                    className={`h-3.5 w-3.5 shrink-0 ${
                      selected ? "text-emerald-400" : "text-slate-muted"
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block min-w-0 truncate text-slate-100">
                        {preset.name}
                      </span>
                      <ComputeBadge {...compute} />
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                      {preset.blurb}
                    </span>
                  </span>
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>

          {orgs.length > 0 ? (
            <div className="border-t border-white/5 px-2 py-1.5">
              <p className="px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Organizations
              </p>
              {orgs.map((org) => {
                const compute = computeForOrg(org.slug);
                return (
                  <button
                    key={org.id}
                    type="button"
                    role="option"
                    aria-selected={activeOrgId === org.id}
                    onClick={() => selectOrg(org.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition ${
                      activeOrgId === org.id
                        ? "border-l-2 border-l-emerald-400 bg-emerald-500/10 text-white"
                        : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <Building2
                      className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block min-w-0 truncate text-slate-100">
                          {org.name}
                        </span>
                        <ComputeBadge {...compute} />
                      </span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
                        {org.role}
                      </span>
                    </span>
                    {activeOrgId === org.id ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="border-t border-white/5 p-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create Organization
            </button>
          </div>
        </div>
      ) : null}

      {mounted && createOpen
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-[#050507]/85 backdrop-blur-md"
                aria-label="Close create organization"
                onClick={() => {
                  setCreateOpen(false);
                  setError(null);
                }}
              />
              <form
                onSubmit={createOrg}
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-org-title"
                className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-cyan-accent/25 bg-[#0b0f17] shadow-[0_0_60px_rgba(0,242,254,0.18)]"
              >
                <div className="border-b border-white/10 bg-gradient-to-r from-cyan-accent/[0.1] to-transparent px-5 py-4">
                  <h3
                    id="create-org-title"
                    className="font-display text-sm font-semibold text-white"
                  >
                    Create Organization
                  </h3>
                  <p className="mt-1 text-xs text-slate-dim">
                    You become the OWNER — team streams bill against your plan
                    pool.
                  </p>
                </div>
                <div className="p-5">
                  <label className="block text-xs text-slate-dim">
                    Organization name
                    <input
                      required
                      minLength={2}
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-accent/40 focus:ring-1 focus:ring-cyan-accent/20"
                      placeholder="Acme Swarm Lab"
                    />
                  </label>
                  {error ? (
                    <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                      {error}
                    </p>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateOpen(false);
                        setError(null);
                      }}
                      className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-muted transition hover:border-white/20 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending || name.trim().length < 2}
                      className="flex-1 rounded-xl border border-cyan-accent/40 bg-cyan-accent/15 px-3 py-2 text-xs font-semibold text-cyan-accent transition hover:bg-cyan-accent/25 disabled:opacity-50"
                    >
                      {pending ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
