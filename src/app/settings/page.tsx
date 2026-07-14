"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import TeamMembersInviteCard from "@/components/org/TeamMembersInviteCard";

export default function SettingsPage() {
  const { user, signOut, ready } = useAuth();

  if (!ready) {
    return <p className="text-sm text-slate-dim">Loading account…</p>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl py-10 text-white">
        <h1 className="font-display text-2xl font-bold">Account Settings</h1>
        <p className="mt-3 text-sm text-slate-muted">
          Sign in from the top-right header to manage your ScaleSystems profile.
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
    <main className="mx-auto max-w-xl space-y-6 py-10 text-white">
      <div>
        <h1 className="font-display text-2xl font-bold">Account Settings</h1>
        <p className="mt-2 text-sm text-slate-muted">
          Profile configuration for your ScaleSystems operator identity.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-dim">Display name</span>
          <span className="font-medium text-white">{user.name}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-dim">Email</span>
          <span className="font-mono text-xs text-cyan-accent">{user.email}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-dim">User ID</span>
          <span className="font-mono text-[11px] text-slate-muted">{user.id}</span>
        </div>
      </div>

      <TeamMembersInviteCard />

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-muted hover:text-white"
        >
          Back to dashboard
        </Link>
        <Link
          href="/checkout"
          className="rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-4 py-2 text-xs font-semibold text-cyan-accent"
        >
          Manage billing
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
