"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, UserRound, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { trackFunnelEvent } from "@/lib/analytics/funnel";

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
  /** Called after a successful auth so callers can redirect (e.g. checkout). */
  onSuccess?: () => void;
};

export default function AuthModal({
  open,
  onClose,
  initialMode = "signin",
  onSuccess,
}: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
    trackFunnelEvent({
      event: "auth_modal_open",
      metadata: { mode: initialMode },
    });
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result =
      mode === "signin"
        ? await signIn({ email, password })
        : await signUp({ firstName, lastName, email, password });

    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Authentication failed.");
      return;
    }
    onClose();
    onSuccess?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close authentication modal"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17] shadow-[0_0_50px_rgba(0,242,254,0.12)]"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-cyan-accent" aria-hidden />
            <h2
              id="auth-modal-title"
              className="font-display text-sm font-semibold text-white"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-muted hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          {mode === "signup" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-dim">
                Name
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
                  autoComplete="given-name"
                />
              </label>
              <label className="block text-xs text-slate-dim">
                Surname
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
                  autoComplete="family-name"
                />
              </label>
            </div>
          )}

          <label className="block text-xs text-slate-dim">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
              autoComplete="email"
            />
          </label>

          <label className="block text-xs text-slate-dim">
            Password
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-accent/40 bg-cyan-accent/15 px-4 py-2.5 text-sm font-semibold text-cyan-accent transition hover:bg-cyan-accent/25 disabled:opacity-50"
          >
            <UserRound className="h-4 w-4" aria-hidden />
            {pending
              ? "Working…"
              : mode === "signin"
                ? "Sign In"
                : "Sign Up"}
          </button>

          <p className="text-center text-xs text-slate-dim">
            {mode === "signin" ? (
              <>
                Need an account?{" "}
                <button
                  type="button"
                  className="text-cyan-accent hover:underline"
                  onClick={() => {
                    setMode("signup");
                    trackFunnelEvent({ event: "auth_signup_clicked" });
                  }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button
                  type="button"
                  className="text-cyan-accent hover:underline"
                  onClick={() => {
                    setMode("signin");
                    trackFunnelEvent({ event: "auth_signin_clicked" });
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>,
    document.body
  );
}
