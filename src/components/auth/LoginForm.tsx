"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

type LoginFormProps = {
  onSuccess?: () => void;
  onNeedAccount?: () => void;
  info?: string | null;
};

/**
 * Flexible sign-in: email ("Superadmin@scalesystemsai.com") or username ("Superadmin").
 * Matching is case-insensitive on the server.
 */
export default function LoginForm({
  onSuccess,
  onNeedAccount,
  info = null,
}: LoginFormProps) {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await signIn({
      email: identifier.trim(),
      password,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Authentication failed.");
      return;
    }
    onSuccess?.();
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <label className="block text-xs text-slate-dim">
        Email or username
        <input
          required
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/40"
          autoComplete="username"
          placeholder="Superadmin or Superadmin@scalesystemsai.com"
          spellCheck={false}
        />
      </label>
      <label className="block text-xs text-slate-dim">
        Password
        <input
          required
          type="password"
          minLength={1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/40"
          autoComplete="current-password"
        />
      </label>
      {info ? (
        <p className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
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
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/25 disabled:opacity-50"
      >
        <UserRound className="h-4 w-4" aria-hidden />
        {pending ? "Working…" : "Sign In"}
      </button>
      {onNeedAccount ? (
        <p className="text-center text-xs text-slate-dim">
          Need an account?{" "}
          <button
            type="button"
            className="text-blue-400 hover:underline"
            onClick={onNeedAccount}
          >
            Sign up
          </button>
        </p>
      ) : null}
    </form>
  );
}
