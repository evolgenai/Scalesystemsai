"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown, Plus, UserRound } from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { getActiveOrgId, setActiveOrgId } from "@/lib/org/activeOrg";
import type { OrgSummary } from "@/lib/org/types";

type WorkspaceSwitcherProps = {
  enabled: boolean;
};

export default function WorkspaceSwitcher({ enabled }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrgId, setActive] = useState<string | null>(null);
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
    void loadOrgs();

    const onOrgChanged = () => {
      setActive(getActiveOrgId());
      void loadOrgs();
    };
    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    return () =>
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
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

  const selectPersonal = () => {
    setActiveOrgId(null);
    setActive(null);
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
        className="inline-flex max-w-[14rem] items-center gap-2 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] px-2.5 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan-accent/40 hover:shadow-[0_0_20px_rgba(0,242,254,0.08)]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
      >
        {activeOrg ? (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-cyan-accent" aria-hidden />
        ) : (
          <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-muted" aria-hidden />
        )}
        <span className="min-w-0 truncate text-xs font-medium text-white">
          {activeOrg ? activeOrg.name : "Personal Account"}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-dim transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-cyan-accent/20 bg-[#0b0f17] shadow-[0_0_48px_rgba(0,242,254,0.14)]"
        >
          <div className="border-b border-white/10 bg-gradient-to-r from-cyan-accent/[0.08] to-transparent px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-accent/80">
              Workspace
            </p>
          </div>

          <button
            type="button"
            role="option"
            aria-selected={!activeOrgId}
            onClick={selectPersonal}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition ${
              !activeOrgId
                ? "bg-cyan-accent/10 text-white"
                : "hover:bg-white/[0.04]"
            }`}
          >
            <UserRound className="h-3.5 w-3.5 text-slate-muted" aria-hidden />
            <span className="flex-1 text-slate-100">Personal Account</span>
            {!activeOrgId ? (
              <Check className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
            ) : null}
          </button>

          {orgs.length > 0 ? (
            <div className="border-t border-white/10 px-2 py-1.5">
              <p className="px-1 py-1 text-[10px] uppercase tracking-wider text-slate-dim">
                Organizations
              </p>
              {orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={activeOrgId === org.id}
                  onClick={() => selectOrg(org.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition ${
                    activeOrgId === org.id
                      ? "bg-cyan-accent/15 text-white"
                      : "hover:bg-cyan-accent/10"
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-slate-100">
                    {org.name}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-dim">
                    {org.role}
                  </span>
                  {activeOrgId === org.id ? (
                    <Check className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="border-t border-white/10 px-3 py-3">
              <p className="text-[11px] leading-relaxed text-slate-dim">
                No team workspaces yet. Create one to collaborate and share credits.
              </p>
            </div>
          )}

          <div className="border-t border-white/10 p-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-3 py-2 text-xs font-semibold text-cyan-accent transition hover:bg-cyan-accent/20 hover:shadow-[0_0_20px_rgba(0,242,254,0.15)]"
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
