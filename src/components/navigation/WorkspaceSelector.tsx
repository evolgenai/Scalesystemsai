"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Check,
  ChevronDown,
  Layers,
  Plus,
  UserRound,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { WORKSPACE_PRESETS } from "@/lib/org/workspacePresets";
import type { OrgSummary } from "@/lib/org/types";
import { useWorkspaceScope } from "@/components/navigation/WorkspaceScopeContext";

type WorkspaceSelectorProps = {
  enabled: boolean;
};

/**
 * Bio-metallic workspace dropdown — syncs global workspaceId for spatial/memory HUD.
 */
export default function WorkspaceSelector({ enabled }: WorkspaceSelectorProps) {
  const { workspaceId, orgId, workspaceKey, label, setPreset, setOrg } =
    useWorkspaceScope();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
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
      /* stay preset-only */
    }
  }, [enabled]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
        return;
      }
      setOrg(payload.organization.id, payload.organization.name);
      await loadOrgs();
      setCreateOpen(false);
      setOpen(false);
      setName("");
    } catch {
      setError("Network error creating organization.");
    } finally {
      setPending(false);
    }
  };

  if (!enabled) return null;

  const activeOrg = orgs.find((o) => o.id === orgId) ?? null;
  const displayLabel = activeOrg?.name ?? label;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[15rem] items-center gap-2 rounded-xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f] to-[#121e18] px-2.5 py-1.5 text-left shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition hover:border-[#00ffaa]/45"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        title={`workspaceId · ${workspaceId}`}
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-[#00ffaa]" aria-hidden />
        <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-white">
          {displayLabel}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-dim transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-[#00ffaa]/20 bg-gradient-to-b from-[#0b120f] to-[#050807] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.9)]"
        >
          <div className="border-b border-white/5 px-3 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/80">
              workspace scope
            </p>
            <p className="mt-0.5 truncate font-mono text-[9px] text-slate-dim">
              id · {workspaceId}
            </p>
          </div>

          <div className="px-2 py-1.5">
            <p className="px-1 py-1 font-mono text-[9px] uppercase tracking-wider text-slate-dim">
              Isolated scopes
            </p>
            {WORKSPACE_PRESETS.map((preset) => {
              const selected = !orgId && workspaceKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setPreset(preset.key);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition ${
                    selected
                      ? "border border-[#00ffaa]/30 bg-[#00ffaa]/10 text-white"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <UserRound
                    className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-[#00ffaa]" : "text-slate-muted"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-100">
                      {preset.name}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-dim">
                      {preset.blurb}
                    </span>
                  </span>
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[#00ffaa]" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {orgs.length > 0 ? (
            <div className="border-t border-white/5 px-2 py-1.5">
              <p className="px-1 py-1 font-mono text-[9px] uppercase tracking-wider text-slate-dim">
                Organizations
              </p>
              {orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={orgId === org.id}
                  onClick={() => {
                    setOrg(org.id, org.name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition ${
                    orgId === org.id
                      ? "border border-[#00ffaa]/30 bg-[#00ffaa]/10 text-white"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-[#00ffaa]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-100">
                      {org.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase text-slate-dim">
                      {org.role}
                    </span>
                  </span>
                  {orgId === org.id ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[#00ffaa]" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="border-t border-white/5 p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
                setError(null);
                setName("");
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#00ffaa]/35 bg-[#00ffaa]/12 px-3 py-2 text-xs font-semibold text-[#00ffaa] transition hover:bg-[#00ffaa]/20"
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
                className="absolute inset-0 bg-[#050807]/85 backdrop-blur-md"
                aria-label="Close create organization"
                onClick={() => {
                  setCreateOpen(false);
                  setError(null);
                }}
              />
              <form
                onSubmit={createOrg}
                role="dialog"
                aria-modal
                aria-labelledby="ws-create-org-title"
                className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f] to-[#121e18] shadow-[0_0_48px_rgba(0,255,170,0.12)]"
              >
                <div className="border-b border-white/5 px-5 py-4">
                  <h3
                    id="ws-create-org-title"
                    className="text-sm font-semibold text-white"
                  >
                    Create Organization
                  </h3>
                  <p className="mt-1 font-mono text-[10px] text-slate-dim">
                    Becomes the active workspaceId for spatial + memory HUD.
                  </p>
                </div>
                <div className="p-5">
                  <label className="block font-mono text-[10px] text-slate-dim">
                    Organization name
                    <input
                      required
                      minLength={2}
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#050807]/8 px-3 py-2 text-sm text-white outline-none transition focus:border-[#00ffaa]/40"
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
                      className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending || name.trim().length < 2}
                      className="flex-1 rounded-xl border border-[#00ffaa]/40 bg-[#00ffaa]/15 px-3 py-2 text-xs font-semibold text-[#00ffaa] disabled:opacity-50"
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
