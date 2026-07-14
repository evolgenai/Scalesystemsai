"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Lock, ShieldCheck, UserRound, X } from "lucide-react";
import { useAuth, type AuthUser } from "@/components/auth/AuthProvider";
import { trackFunnelEvent } from "@/lib/analytics/funnel";

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
  /** Called after a successful auth so callers can redirect (e.g. checkout). */
  onSuccess?: () => void;
};

type UiMode = "signin" | "signup" | "verify" | "recover";

export default function AuthModal({
  open,
  onClose,
  initialMode = "signin",
  onSuccess,
}: AuthModalProps) {
  const {
    signIn,
    signUp,
    activateSession,
    verifyDualCodes,
    resetPasswordWithCodes,
  } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<UiMode>(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [codesUnlocked, setCodesUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
    setInfo(null);
    setCodesUnlocked(false);
    setPendingUser(null);
    setEmailCode("");
    setSmsCode("");
    setNewPassword("");
    setConfirmPassword("");
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

  const finishSuccess = () => {
    onClose();
    onSuccess?.();
  };

  const submitSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await signIn({ email, password });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Authentication failed.");
      return;
    }
    finishSuccess();
  };

  const submitSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
    const result = await signUp({
      firstName,
      lastName,
      email,
      phone,
      password,
    });
    setPending(false);
    if (result.emailExists) {
      setMode("recover");
      setCodesUnlocked(false);
      setInfo(
        "This email is already registered. Enter both verification codes to reset your password."
      );
      return;
    }
    if (!result.ok || !result.user) {
      setError(result.error ?? "Sign up failed.");
      return;
    }
    setPendingUser(result.user);
    setMode("verify");
    setInfo(
      "We sent verification codes to your email and phone. Enter both to activate your account."
    );
  };

  const submitVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingUser) {
      setError("Missing pending registration session.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await verifyDualCodes({
      email,
      phone: phone || pendingUser.phone || "",
      emailCode,
      smsCode,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Verification failed.");
      return;
    }
    activateSession(result.user ?? pendingUser);
    finishSuccess();
  };

  const unlockRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await verifyDualCodes({
      email,
      phone,
      emailCode,
      smsCode,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Both verification codes are required.");
      return;
    }
    setCodesUnlocked(true);
    setInfo("Codes verified. Choose a new password.");
  };

  const submitRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await resetPasswordWithCodes({
      email,
      phone,
      emailCode,
      smsCode,
      newPassword,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Password reset failed.");
      return;
    }
    setMode("signin");
    setPassword("");
    setInfo("Password updated. Sign in with your new credentials.");
  };

  const title =
    mode === "signin"
      ? "Sign in"
      : mode === "signup"
        ? "Create account"
        : mode === "verify"
          ? "Dual verification"
          : "Password recovery";

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
            {mode === "verify" || mode === "recover" ? (
              <ShieldCheck className="h-4 w-4 text-cyan-accent" aria-hidden />
            ) : (
              <Lock className="h-4 w-4 text-cyan-accent" aria-hidden />
            )}
            <h2
              id="auth-modal-title"
              className="font-display text-sm font-semibold text-white"
            >
              {title}
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

        {mode === "signin" ? (
          <form onSubmit={submitSignIn} className="space-y-4 p-5">
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
                autoComplete="current-password"
              />
            </label>
            {info ? (
              <p className="rounded-xl border border-cyan-accent/25 bg-cyan-accent/10 px-3 py-2 text-xs text-cyan-accent">
                {info}
              </p>
            ) : null}
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
              {pending ? "Working…" : "Sign In"}
            </button>
            <p className="text-center text-xs text-slate-dim">
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
            </p>
          </form>
        ) : null}

        {mode === "signup" ? (
          <form onSubmit={submitSignUp} className="space-y-4 p-5">
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
              Phone
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
                autoComplete="tel"
                placeholder="+1 555 0100"
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
                autoComplete="new-password"
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
              {pending ? "Working…" : "Continue to verification"}
            </button>
            <p className="text-center text-xs text-slate-dim">
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
            </p>
          </form>
        ) : null}

        {mode === "verify" ? (
          <form onSubmit={submitVerify} className="space-y-4 p-5">
            {info ? (
              <p className="rounded-xl border border-cyan-accent/25 bg-cyan-accent/10 px-3 py-2 text-xs text-cyan-accent">
                {info}
              </p>
            ) : null}
            <label className="block text-xs text-slate-dim">
              Email Verification Code
              <input
                required
                inputMode="numeric"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-accent/40"
                placeholder="6-digit email code"
              />
            </label>
            <label className="block text-xs text-slate-dim">
              SMS Verification Code
              <input
                required
                inputMode="numeric"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-accent/40"
                placeholder="6-digit SMS code"
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
              <ShieldCheck className="h-4 w-4" aria-hidden />
              {pending ? "Verifying…" : "Verify & activate"}
            </button>
          </form>
        ) : null}

        {mode === "recover" ? (
          <form
            onSubmit={codesUnlocked ? submitRecovery : unlockRecovery}
            className="space-y-4 p-5"
          >
            {info ? (
              <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                {info}
              </p>
            ) : null}
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
              Phone on file
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
                autoComplete="tel"
              />
            </label>
            <label className="block text-xs text-slate-dim">
              Email Verification Code
              <input
                required
                inputMode="numeric"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                disabled={codesUnlocked}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-accent/40 disabled:opacity-60"
              />
            </label>
            <label className="block text-xs text-slate-dim">
              SMS Verification Code
              <input
                required
                inputMode="numeric"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                disabled={codesUnlocked}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-accent/40 disabled:opacity-60"
              />
            </label>
            {codesUnlocked ? (
              <>
                <label className="block text-xs text-slate-dim">
                  New password
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
                    autoComplete="new-password"
                  />
                </label>
                <label className="block text-xs text-slate-dim">
                  Confirm new password
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-accent/40"
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : null}
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
              <KeyRound className="h-4 w-4" aria-hidden />
              {pending
                ? "Working…"
                : codesUnlocked
                  ? "Update password"
                  : "Unlock with both codes"}
            </button>
            <p className="text-center text-xs text-slate-dim">
              <button
                type="button"
                className="text-cyan-accent hover:underline"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            </p>
          </form>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
