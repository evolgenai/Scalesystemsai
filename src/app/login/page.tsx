"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  Sparkles,
} from "lucide-react";

const inputClassName =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim transition-colors focus:border-cyan-accent/50 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass rounded-3xl border border-white/10 p-8 shadow-glow-sm sm:p-10"
    >
      <form onSubmit={handleSubmit} className="space-y-5" aria-label="Login form">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
            <p className="text-sm text-rose-200">{error}</p>
          </div>
        )}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white">
            Email Address
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-[calc(50%+4px)] h-4 w-4 -translate-y-1/2 text-slate-dim"
              aria-hidden
            />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClassName} pl-10`}
              placeholder="you@company.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white">
            Password
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-[calc(50%+4px)] h-4 w-4 -translate-y-1/2 text-slate-dim"
              aria-hidden
            />
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClassName} pl-10`}
              placeholder="Enter your password"
            />
          </div>
        </div>

        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-accent px-5 py-3.5 text-sm font-bold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-cyan-accent transition-colors hover:text-cyan-accent/80"
        >
          Create one
        </Link>
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative min-h-[calc(100vh-12rem)] px-4 py-16 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-cyan-accent/[0.06] blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[320px] w-[480px] rounded-full bg-purple-500/[0.05] blur-[100px]" />
      </div>

      <div className="mx-auto w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            ScaleSystems Client Portal
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Welcome <span className="text-gradient">back</span>
          </h1>
          <p className="mt-3 text-sm text-slate-muted">
            Sign in to access your workforce command center and manage deployed
            AI agents.
          </p>
        </motion.div>

        <Suspense
          fallback={
            <div className="glass rounded-3xl border border-white/10 p-10 text-center text-sm text-slate-muted">
              Loading sign-in...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
