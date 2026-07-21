"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Loader2,
  Mail,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { getActiveOrgId } from "@/lib/org/activeOrg";
import type { OrgSummary } from "@/lib/org/types";

type SeatRole = "Admin" | "Developer" | "Member";

type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: SeatRole;
  status: "active" | "pending";
};

type ToastTone = "success" | "error" | "info";

const STORAGE_KEY = "scalesystems.workspace.teamInvites";
const SEAT_CAP = 10;

const ROLE_TO_ORG: Record<SeatRole, "ADMIN" | "MEMBER"> = {
  Admin: "ADMIN",
  Developer: "MEMBER",
  Member: "MEMBER",
};

const TOAST_STYLES: Record<ToastTone, string> = {
  success: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  info: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

const DEFAULT_MEMBERS: TeamMember[] = [
  {
    id: "owner-self",
    email: "Superadmin@scalesystemsai.com",
    name: "Superadmin",
    role: "Admin",
    status: "active",
  },
];

function readPending(): TeamMember[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TeamMember[];
    return Array.isArray(parsed) ? parsed.filter((m) => m.status === "pending") : [];
  } catch {
    return [];
  }
}

function writePending(members: TeamMember[]): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(members.filter((m) => m.status === "pending"))
    );
  } catch {
    /* ignore */
  }
}

export default function TeamManager() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>(DEFAULT_MEMBERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SeatRole>("Member");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(
    null
  );

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
  const canInvite =
    !activeOrg || activeOrg.role === "OWNER" || activeOrg.role === "ADMIN";

  const activeCount = useMemo(
    () => members.filter((m) => m.status === "active").length,
    [members]
  );
  const pendingCount = useMemo(
    () => members.filter((m) => m.status === "pending").length,
    [members]
  );

  const showToast = useCallback((tone: ToastTone, message: string) => {
    setToast({ tone, message });
  }, []);

  const loadOrgs = useCallback(async () => {
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
      /* keep local roster */
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setActiveOrgId(getActiveOrgId());
    setMembers((prev) => {
      const pendingInvites = readPending();
      const ids = new Set(prev.map((m) => m.id));
      return [
        ...prev,
        ...pendingInvites.filter((m) => !ids.has(m.id)),
      ];
    });
    void loadOrgs();

    const onOrgChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ orgId: string | null }>).detail;
      setActiveOrgId(detail?.orgId ?? getActiveOrgId());
      void loadOrgs();
    };
    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    return () =>
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
  }, [loadOrgs]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canInvite) {
      showToast("error", "Only Admin seats can invite teammates.");
      return;
    }

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    if (members.some((m) => m.email.toLowerCase() === trimmed)) {
      showToast("info", "That person is already on this workspace.");
      return;
    }

    setPending(true);
    setToast(null);

    const localInvite: TeamMember = {
      id: `invite-${Date.now()}`,
      email: trimmed,
      name: trimmed.split("@")[0] || "Invitee",
      role,
      status: "pending",
    };

    try {
      if (activeOrgId) {
        const response = await fetch("/api/orgs/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...getClientAuthHeaders(),
          },
          body: JSON.stringify({
            orgId: activeOrgId,
            email: trimmed,
            role: ROLE_TO_ORG[role],
          }),
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          membership?: { user?: { email?: string; name?: string } };
        };

        if (response.ok && payload.success) {
          const invited: TeamMember = {
            id: `active-${trimmed}`,
            email: payload.membership?.user?.email ?? trimmed,
            name: (payload.membership?.user?.name ?? trimmed.split("@")[0]) || "Member",
            role,
            status: "active",
          };
          setMembers((prev) => [...prev, invited]);
          showToast("success", `Invite accepted — ${invited.email} joined.`);
          setEmail("");
          setDrawerOpen(false);
          setPending(false);
          return;
        }

        if (response.status === 404) {
          // User not registered yet — keep as pending invitation badge.
          setMembers((prev) => {
            const next = [...prev, localInvite];
            writePending(next);
            return next;
          });
          showToast(
            "info",
            "Invitation queued. They’ll join once they create a ScaleSystems account."
          );
          setEmail("");
          setDrawerOpen(false);
          setPending(false);
          return;
        }

        if (response.status === 409) {
          showToast("info", payload.error ?? "Already a workspace member.");
          setPending(false);
          return;
        }

        if (response.status !== 401 && response.status !== 403) {
          showToast("error", payload.error ?? "Unable to send invite.");
          setPending(false);
          return;
        }
      }

      // Local / unauthenticated fallback — pending invite badge.
      setMembers((prev) => {
        const next = [...prev, localInvite];
        writePending(next);
        return next;
      });
      showToast("success", `Invitation sent to ${trimmed}.`);
      setEmail("");
      setDrawerOpen(false);
    } catch {
      setMembers((prev) => {
        const next = [...prev, localInvite];
        writePending(next);
        return next;
      });
      showToast("success", `Invitation queued for ${trimmed}.`);
      setEmail("");
      setDrawerOpen(false);
    } finally {
      setPending(false);
    }
  };

  const revokePending = (id: string) => {
    setMembers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      writePending(next);
      return next;
    });
    showToast("info", "Pending invitation revoked.");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-5 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10">
            <Users className="h-5 w-5 text-blue-400" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold tracking-wide text-white">
              Team Members
            </h1>
            <p className="mt-1 text-xs text-slate-dim">
              {activeOrg
                ? `Manage seats for ${activeOrg.name}.`
                : "Invite operators to this workspace and track pending seats."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-[11px] text-slate-muted">
            <span className="text-blue-400">{activeCount}</span>
            <span className="text-slate-600">/</span>
            <span>{SEAT_CAP}</span>
            <span className="ml-1 text-slate-dim">active seats</span>
          </span>
          {pendingCount > 0 ? (
            <span className="inline-flex items-center rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200">
              {pendingCount} pending
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            disabled={!canInvite}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-3.5 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Invite member
          </button>
        </div>
      </header>

      {!canInvite ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90">
          You are a {activeOrg?.role ?? "MEMBER"} on this workspace. Only OWNER
          or ADMIN roles can send invites.
        </p>
      ) : null}

      <ul className="space-y-2" aria-label="Workspace members">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3.5 backdrop-blur-xl"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-white">
                  {member.name}
                </p>
                {member.status === "pending" ? (
                  <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                    Pending
                  </span>
                ) : (
                  <span className="rounded-md border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-dim">
                {member.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-slate-muted">
                {member.role}
              </span>
              {member.status === "pending" ? (
                <button
                  type="button"
                  onClick={() => revokePending(member.id)}
                  className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-dim transition hover:border-rose-500/30 hover:text-rose-300"
                >
                  Revoke
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {toast ? (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${TOAST_STYLES[toast.tone]}`}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span>{toast.message}</span>
        </div>
      ) : null}

      {mounted && drawerOpen
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#050507]/90 p-4 backdrop-blur-md sm:items-center">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close invite drawer"
                onClick={() => setDrawerOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="invite-member-title"
                className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#09090B]/95 shadow-[0_0_48px_rgba(0, 102, 255,0.12)] backdrop-blur-xl"
              >
                <div className="flex items-start justify-between border-b border-white/5 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10">
                      <UserPlus className="h-4 w-4 text-blue-400" aria-hidden />
                    </span>
                    <div>
                      <h3
                        id="invite-member-title"
                        className="font-display text-sm font-bold tracking-wide text-white"
                      >
                        Invite team member
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-dim">
                        Email · role · seat allocation
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={inviteMember} className="space-y-4 px-5 py-5">
                  <label className="block text-xs text-slate-dim">
                    Email
                    <div className="relative mt-1.5">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim"
                        aria-hidden
                      />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="teammate@company.com"
                        autoComplete="email"
                        className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/40"
                      />
                    </div>
                  </label>

                  <label className="block text-xs text-slate-dim">
                    Role
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as SeatRole)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/40"
                    >
                      <option value="Admin">Admin</option>
                      <option value="Developer">Developer</option>
                      <option value="Member">Member</option>
                    </select>
                  </label>

                  <button
                    type="submit"
                    disabled={pending || !email.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/25 disabled:opacity-50"
                  >
                    {pending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" aria-hidden />
                        Send invitation
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
