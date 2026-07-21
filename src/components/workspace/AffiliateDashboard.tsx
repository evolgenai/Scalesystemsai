"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Gift,
  Link2,
  Linkedin,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";

const CODE_KEY = "scalesystems.affiliate.code";
const TRACK_KEY = "scalesystems.affiliate.tracking";
const REFERRAL_BASE = "https://scalesystemsai.vercel.app/signup";
const REWARD_RATE = 0.15;

type ReferralEvent = {
  id: string;
  email: string;
  signedUpAt: string;
  gasSpend: number;
  rewardEarned: number;
};

type TrackingState = {
  signups: ReferralEvent[];
  lastTickAt: string;
};

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "SS";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function readCode(): string {
  if (typeof window === "undefined") return "SS------";
  try {
    const existing = window.localStorage.getItem(CODE_KEY);
    if (existing) return existing;
    const next = randomCode();
    window.localStorage.setItem(CODE_KEY, next);
    return next;
  } catch {
    return randomCode();
  }
}

function readTracking(): TrackingState {
  if (typeof window === "undefined") {
    return { signups: [], lastTickAt: new Date().toISOString() };
  }
  try {
    const raw = window.localStorage.getItem(TRACK_KEY);
    if (!raw) return { signups: [], lastTickAt: new Date().toISOString() };
    return JSON.parse(raw) as TrackingState;
  } catch {
    return { signups: [], lastTickAt: new Date().toISOString() };
  }
}

function writeTracking(state: TrackingState) {
  try {
    window.localStorage.setItem(TRACK_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const FAKE_EMAILS = [
  "nova@orbit.dev",
  "kai@swarm.io",
  "mira@lattice.ai",
  "jax@flux.run",
  "rio@helix.co",
];

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.739L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

export default function AffiliateDashboard() {
  const [code, setCode] = useState("SS------");
  const [tracking, setTracking] = useState<TrackingState>({
    signups: [],
    lastTickAt: new Date().toISOString(),
  });
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState(true);

  const referralLink = `${REFERRAL_BASE}?ref=${code}`;

  useEffect(() => {
    setCode(readCode());
    setTracking(readTracking());
  }, []);

  // Simulated real-time referral + recurring 15% gas reward ticks
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      setTracking((prev) => {
        const next: TrackingState = {
          ...prev,
          lastTickAt: new Date().toISOString(),
          signups: prev.signups.map((s) => {
            const burn = Math.floor(80 + Math.random() * 420);
            return {
              ...s,
              gasSpend: s.gasSpend + burn,
              rewardEarned: Math.round((s.gasSpend + burn) * REWARD_RATE),
            };
          }),
        };

        if (Math.random() < 0.28 && next.signups.length < 12) {
          const email =
            FAKE_EMAILS[next.signups.length % FAKE_EMAILS.length] ??
            `partner${next.signups.length}@scalesystems.ai`;
          const gasSpend = Math.floor(200 + Math.random() * 800);
          next.signups = [
            {
              id: `ref-${Date.now()}`,
              email,
              signedUpAt: new Date().toISOString(),
              gasSpend,
              rewardEarned: Math.round(gasSpend * REWARD_RATE),
            },
            ...next.signups,
          ];
        }

        writeTracking(next);
        return next;
      });
    }, 4500);
    return () => window.clearInterval(id);
  }, [live]);

  const totals = useMemo(() => {
    const signups = tracking.signups.length;
    const gasSpend = tracking.signups.reduce((a, s) => a + s.gasSpend, 0);
    const rewards = tracking.signups.reduce((a, s) => a + s.rewardEarned, 0);
    return { signups, gasSpend, rewards };
  }, [tracking.signups]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [referralLink]);

  const regenerate = useCallback(() => {
    const next = randomCode();
    try {
      window.localStorage.setItem(CODE_KEY, next);
    } catch {
      /* ignore */
    }
    setCode(next);
  }, []);

  const shareText = encodeURIComponent(
    `Join Scale Systems with my referral link and claim free Gas credits: ${referralLink}`
  );
  const twitterHref = `https://twitter.com/intent/tweet?text=${shareText}`;
  const linkedInHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Scale Systems affiliate — 15% recurring Gas rewards")}`;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-[#059669]/25 bg-gradient-to-br from-[#05110d] via-[#0a1f18] to-[#05110d] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#10B981]">
              Growth · Affiliate
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-white">
              Affiliate Program
            </h2>
            <p className="mt-2 max-w-xl text-sm text-slate-muted">
              Share your unique link. Earn{" "}
              <span className="font-semibold text-[#10B981]">15% recurring</span>{" "}
              Gas credit rewards on referred workspace spend.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-muted">
            <span
              className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}
            />
            {live ? "Live tracking" : "Paused"}
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className="ml-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:border-[#10B981]/40"
            >
              {live ? "Pause" : "Resume"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat
            icon={Users}
            label="Referred signups"
            value={String(totals.signups)}
          />
          <Stat
            icon={Gift}
            label="Gas spent by refs"
            value={totals.gasSpend.toLocaleString()}
          />
          <Stat
            icon={RefreshCw}
            label="Your 15% rewards"
            value={totals.rewards.toLocaleString()}
            accent
          />
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Link2 className="h-4 w-4 text-[#10B981]" aria-hidden />
          Your referral link
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-[#6EE7B7] sm:text-sm">
            {referralLink}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#047857]"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={regenerate}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-[#10B981]/40"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            New code
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-dim">
          Code <span className="font-mono text-[#10B981]">{code}</span> · format{" "}
          <span className="font-mono">scalesystemsai.vercel.app/signup?ref=YOUR_CODE</span>
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={twitterHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#10B981]/40 hover:text-white"
          >
            <TwitterIcon className="h-3.5 w-3.5" />
            Twitter / X
          </a>
          <a
            href={linkedInHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#10B981]/40 hover:text-white"
          >
            <Linkedin className="h-3.5 w-3.5" aria-hidden />
            LinkedIn
          </a>
          <a
            href={telegramHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#10B981]/40 hover:text-white"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            Telegram
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="border-b border-white/5 px-5 py-4 sm:px-6">
          <h3 className="font-display text-base font-semibold text-white">
            Referral activity
          </h3>
          <p className="mt-0.5 text-xs text-slate-dim">
            Updated {new Date(tracking.lastTickAt).toLocaleTimeString()} · 15%
            recurring Gas credit on every burn
          </p>
        </div>
        {tracking.signups.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-muted sm:px-6">
            No referrals yet — share your link to start earning.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-dim">
                  <th className="px-5 py-3 font-semibold sm:px-6">Signup</th>
                  <th className="px-3 py-3 font-semibold">Joined</th>
                  <th className="px-3 py-3 font-semibold">Gas spend</th>
                  <th className="px-5 py-3 font-semibold sm:px-6">Your reward</th>
                </tr>
              </thead>
              <tbody>
                {tracking.signups.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-white/[0.04] text-slate-200 last:border-0"
                  >
                    <td className="px-5 py-3 font-mono text-xs sm:px-6">
                      {s.email}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-muted">
                      {new Date(s.signedUpAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {s.gasSpend.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[#10B981] sm:px-6">
                      +{s.rewardEarned.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-dim">
        <Icon className="h-3.5 w-3.5 text-[#10B981]" aria-hidden />
        {label}
      </div>
      <p
        className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${
          accent ? "text-[#10B981]" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
