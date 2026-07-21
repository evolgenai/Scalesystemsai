"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, Users, XCircle } from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { getActiveOrgId } from "@/lib/org/activeOrg";
import type { OrgSummary } from "@/lib/org/types";

type ToastTone = "success" | "error" | "info";

type ToastState = {
  tone: ToastTone;
  message: string;
} | null;

const TOAST_STYLES: Record<ToastTone, string> = {
  success: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  info: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

export default function TeamMembersInviteCard() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const activeOrg = orgs.find((org) => org.id === activeOrgId) ?? null;
  const canInvite =
    activeOrg?.role === "OWNER" || activeOrg?.role === "ADMIN";

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
      // Keep last known list; invite form still works with active org id.
    }
  }, []);

  useEffect(() => {
    setActiveOrgIdState(getActiveOrgId());
    void loadOrgs();

    const onOrgChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ orgId: string | null }>).detail;
      setActiveOrgIdState(detail?.orgId ?? getActiveOrgId());
      void loadOrgs();
    };

    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    return () =>
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
  }, [loadOrgs]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeOrgId) {
      showToast(
        "info",
        "Select an organization workspace in the header before inviting members."
      );
      return;
    }
    if (!canInvite) {
      showToast("error", "Only OWNER or ADMIN can invite members.");
      return;
    }

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setPending(true);
    setToast(null);

    try {
      const response = await fetch("/api/orgs/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ orgId: activeOrgId, email: trimmed }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        membership?: { user?: { email?: string; name?: string } };
      };

      if (response.ok && payload.success) {
        const invited =
          payload.membership?.user?.email ??
          payload.membership?.user?.name ??
          trimmed;
        showToast("success", `Invite sent — ${invited} joined the workspace.`);
        setEmail("");
        return;
      }

      if (response.status === 404) {
        showToast(
          "error",
          payload.error ??
            "User not found. Ask them to sign up for ScaleSystems first."
        );
        return;
      }

      if (response.status === 409) {
        showToast(
          "info",
          payload.error ?? "That user is already a member of this organization."
        );
        return;
      }

      showToast("error", payload.error ?? "Unable to send invite.");
    } catch {
      showToast("error", "Network error — invite could not be sent.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-accent/30 bg-cyan-accent/10">
          <Users className="h-4 w-4 text-cyan-accent" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold text-white">
            Team Members
          </h2>
          <p className="mt-1 text-xs text-slate-dim">
            {activeOrg
              ? `Invite operators to ${activeOrg.name}.`
              : "Switch to an organization workspace to invite teammates."}
          </p>
        </div>
      </div>

      {!activeOrgId ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-slate-muted">
          No active organization. Use the workspace switcher in the header to
          create or select a team workspace.
        </p>
      ) : !canInvite ? (
        <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/90">
          You are a {activeOrg?.role ?? "MEMBER"} on this workspace. Only OWNER
          or ADMIN roles can send invites.
        </p>
      ) : (
        <form onSubmit={inviteMember} className="mt-4 space-y-3">
          <label className="block text-xs text-slate-dim">
            Member email
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
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-accent/40 focus:ring-1 focus:ring-cyan-accent/20"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={pending || !email.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-4 py-2.5 text-xs font-semibold text-cyan-accent transition hover:bg-cyan-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Inviting…
              </>
            ) : (
              "Invite"
            )}
          </button>
        </form>
      )}

      {toast ? (
        <div
          role="status"
          className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${TOAST_STYLES[toast.tone]}`}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </section>
  );
}
