"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Settings, UserRound, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthModal from "@/components/auth/AuthModal";
import WorkspaceSelector from "@/components/navigation/WorkspaceSelector";
import { useNavDrawer } from "@/components/navigation/NavDrawerContext";
import TeamPresenceBar from "@/components/org/TeamPresenceBar";
import Hover3DIcon from "@/components/ui/Hover3DIcon";
import { SwarmBridgeCube, SkillChip } from "@/components/ui/Ecosystem3DIcons";
import StreamEngineToggle from "@/components/spatial/StreamEngineToggle";
import {
  SwarmTelemetryDrawer,
  SwarmTelemetryTrigger,
} from "@/components/spatial/SwarmTelemetryDrawer";
import SkillLibraryModal from "@/components/spatial/SkillLibraryModal";
import { useSwarmStream, useSwarmStreamCounters } from "@/hooks/useSwarmStream";
import { useWorkspaceScope } from "@/components/navigation/WorkspaceScopeContext";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import {
  OPEN_AUTH_EVENT,
  consumePendingCheckoutPlan,
  storePendingCheckoutPlan,
  type OpenAuthDetail,
} from "@/lib/auth/pendingCheckout";

function userInitials(name: string, firstName?: string, lastName?: string): string {
  const a = firstName?.trim()?.[0];
  const b = lastName?.trim()?.[0];
  if (a && b) return `${a}${b}`.toUpperCase();
  if (a) return a.toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

export default function TopAuthHeader() {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { open: navOpen, toggle: toggleNav } = useNavDrawer();
  const { workspaceId } = useWorkspaceScope();
  const onDashboard = pathname.startsWith("/dashboard");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  // Keep a single SSE subscription alive on dashboard for header counters + drawer
  useSwarmStream({ workspaceId, enabled: onDashboard && ready });
  const streamCounters = useSwarmStreamCounters();

  const goToPendingCheckout = useCallback(() => {
    const plan = consumePendingCheckoutPlan();
    if (!plan) return;
    trackFunnelEvent({
      event: "redirected_to_payment",
      plan,
      metadata: { source: "auth_success" },
    });
    router.push(`/checkout?plan=${plan}`);
  }, [router]);

  useEffect(() => {
    const onOpenAuth = (event: Event) => {
      const detail = (event as CustomEvent<OpenAuthDetail>).detail ?? {};
      if (detail.plan) {
        storePendingCheckoutPlan(detail.plan);
      }
      setAuthMode(detail.mode ?? "signup");
      setAuthOpen(true);
      trackFunnelEvent({
        event: "auth_signup_clicked",
        plan: detail.plan,
        metadata: { source: "open_auth_event" },
      });
    };
    window.addEventListener(OPEN_AUTH_EVENT, onOpenAuth);
    return () => window.removeEventListener(OPEN_AUTH_EVENT, onOpenAuth);
  }, []);

  useEffect(() => {
    if (pathname === "/dashboard" && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const payment = params.get("payment");
      if (payment === "success") {
        trackFunnelEvent({
          event: "payment_success_landing",
          provider: params.get("provider") ?? undefined,
          plan: params.get("plan") ?? undefined,
        });
      }
      if (payment === "cancelled") {
        trackFunnelEvent({
          event: "payment_cancelled_landing",
          provider: params.get("provider") ?? undefined,
          plan: params.get("plan") ?? undefined,
        });
      }
    }
  }, [pathname]);

  const initials = user
    ? userInitials(user.name, user.firstName, user.lastName)
    : "";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 w-full items-center gap-3 border-b border-white/5 bg-obsidian/90 px-3 backdrop-blur-xl sm:px-4 md:px-6">
        {onDashboard ? (
          <button
            type="button"
            onClick={toggleNav}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/5 bg-white/[0.03] p-2 text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400 xl:hidden"
            aria-label={navOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={navOpen}
          >
            {navOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        ) : null}

        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 font-display text-sm font-bold text-white xl:hidden"
        >
          <SwarmBridgeCube size="sm" />
          Scale<span className="text-emerald-400">Systems</span>
        </Link>

        <div className="hidden items-center gap-5 text-xs text-slate-dim xl:flex">
          <span className="mr-1 opacity-80" aria-hidden>
            <SkillChip size="sm" />
          </span>
          <Link href="/" className="hover:text-emerald-400">
            Home
          </Link>
          <Link href="/features" className="hover:text-emerald-400">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-emerald-400">
            Pricing
          </Link>
          <Link href="/docs" className="hover:text-emerald-400">
            Docs
          </Link>
          <Link href="/dashboard?view=checkout" className="hover:text-emerald-400">
            Checkout
          </Link>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {onDashboard ? (
            <>
              <div
                className="hidden items-center gap-1.5 rounded-xl border border-white/5 bg-[#050807]/6 px-2 py-1 font-mono text-[9px] text-slate-dim md:flex"
                title="Live SSE swarm counters"
                aria-live="polite"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${streamCounters.connected ? "bg-[#00ffaa]" : "bg-amber-400"}`}
                />
                <span className="text-[#00ffaa]">
                  {streamCounters.agentsOnline} ag
                </span>
                <span>·</span>
                <span>
                  gas{" "}
                  {streamCounters.gasBalance != null
                    ? streamCounters.gasBalance.toLocaleString()
                    : "—"}
                </span>
                <span>·</span>
                <span
                  className={
                    streamCounters.openIncidents > 0
                      ? "text-amber-300"
                      : undefined
                  }
                >
                  {streamCounters.openIncidents} inc
                </span>
              </div>
              <SwarmTelemetryTrigger />
              <div className="hidden sm:block">
                <StreamEngineToggle />
              </div>
            </>
          ) : null}
          <WorkspaceSelector enabled={ready} />
          {!ready ? (
            <div className="h-8 w-28 animate-pulse rounded-lg bg-white/5" />
          ) : user ? (
            <>
              <TeamPresenceBar />
              <Link
                href="/settings"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 transition hover:border-cyan-accent/30"
                title="Account settings"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-accent/15 font-mono text-[10px] font-semibold text-cyan-accent"
                  aria-hidden
                >
                  {initials}
                </span>
                <span className="max-w-[10rem] truncate text-xs font-medium text-white sm:max-w-xs">
                  {user.name}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400"
                aria-label="Open account settings"
              >
                <Hover3DIcon intensity={16}>
                  <Settings className="h-4 w-4" aria-hidden />
                </Hover3DIcon>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  trackFunnelEvent({ event: "auth_signin_clicked" });
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-muted transition hover:border-white/20 hover:text-white"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  trackFunnelEvent({ event: "auth_signup_clicked" });
                  setAuthMode("signup");
                  setAuthOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-3.5 py-2 text-xs font-semibold text-cyan-accent transition hover:bg-cyan-accent/20"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                Sign Up
              </button>
            </div>
          )}
        </div>
      </header>

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={goToPendingCheckout}
      />
      {onDashboard ? (
        <>
          <SwarmTelemetryDrawer />
          <SkillLibraryModal />
        </>
      ) : null}
    </>
  );
}
