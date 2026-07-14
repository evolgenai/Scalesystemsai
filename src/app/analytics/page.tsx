"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import TelemetryDashboard from "@/components/analytics/TelemetryDashboard";

export default function AnalyticsPage() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <p className="text-sm text-slate-dim">Loading analytics…</p>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl py-10 text-white">
        <h1 className="font-display text-2xl font-bold">Analytics</h1>
        <p className="mt-3 text-sm text-slate-muted">
          Sign in from the top-right header to view swarm telemetry for your
          workspace.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex text-sm text-cyan-accent hover:underline"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="relative mx-auto max-w-6xl py-8 text-white sm:py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-1/2 top-0 h-[360px] w-[640px] -translate-x-1/2 rounded-full bg-cyan-accent/[0.06] blur-[120px]" />
      </div>
      <TelemetryDashboard />
    </main>
  );
}
