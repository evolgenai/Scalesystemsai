"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Settings, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthModal from "@/components/auth/AuthModal";
import WorkspaceSwitcher from "@/components/navigation/WorkspaceSwitcher";
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
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

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
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-[#09090b]/80 px-4 backdrop-blur-xl md:px-6">
        <div className="hidden items-center gap-5 text-xs text-slate-dim md:flex">
          <Link href="/" className="hover:text-cyan-accent">
            Home
          </Link>
          <Link href="/features" className="hover:text-cyan-accent">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-cyan-accent">
            Pricing
          </Link>
          <Link href="/docs" className="hover:text-cyan-accent">
            Docs
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!ready ? (
            <div className="h-8 w-28 animate-pulse rounded-lg bg-white/5" />
          ) : user ? (
            <>
              <WorkspaceSwitcher enabled />
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
                className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-muted transition hover:border-cyan-accent/30 hover:text-cyan-accent"
                aria-label="Open account settings"
              >
                <Settings className="h-4 w-4" aria-hidden />
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
    </>
  );
}
