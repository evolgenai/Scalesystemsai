"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Store, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import AgentMarketplaceCatalog from "@/components/org/AgentMarketplaceCatalog";
import ApiKeyManager from "@/components/org/ApiKeyManager";
import MemoryBankCard from "@/components/org/MemoryBankCard";
import TeamMembersInviteCard from "@/components/org/TeamMembersInviteCard";

type SettingsTab = "account" | "workspace";

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "workspace", label: "Workspace", icon: Store },
];

export default function SettingsPage() {
  const { user, signOut, ready } = useAuth();
  const [tab, setTab] = useState<SettingsTab>("workspace");

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
    <main
      className={`mx-auto space-y-6 py-10 text-white ${
        tab === "workspace" ? "max-w-5xl" : "max-w-3xl"
      }`}
    >
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-slate-muted">
          Manage your operator profile, API keys, and agent marketplace templates.
        </p>
      </div>

      <nav
        className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1"
        aria-label="Settings sections"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
              tab === id
                ? "bg-cyan-accent/15 text-cyan-accent ring-1 ring-cyan-accent/30"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {tab === "account" ? (
        <>
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
          <MemoryBankCard />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-dim">
            <KeyRound className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
            <span>Token provisioning &amp; programmatic swarm access</span>
          </div>
          <ApiKeyManager />
          <AgentMarketplaceCatalog />
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-muted hover:text-white"
        >
          Back to dashboard
        </Link>
        <Link
          href="/analytics"
          className="rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-4 py-2 text-xs font-semibold text-cyan-accent"
        >
          Analytics
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
