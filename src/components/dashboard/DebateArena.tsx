"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Hammer,
  Loader2,
  Scale,
  Shield,
  XCircle,
} from "lucide-react";
import type { DebateTurn, DebateVote } from "@/lib/agents/useAgentStream";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

type DebateArenaProps = {
  turns: DebateTurn[];
  consensusPending: boolean;
  sessionId: string | null;
  lockedVote: DebateVote | null;
  onVoteRegistered: (vote: DebateVote) => void;
};

export default function DebateArena({
  turns,
  consensusPending,
  sessionId,
  lockedVote,
  onVoteRegistered,
}: DebateArenaProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const creatorTurns = turns.filter((turn) => turn.role === "creator");
  const criticTurns = turns.filter((turn) => turn.role === "critic");
  const showVote = consensusPending || lockedVote !== null;

  const castVote = async (vote: DebateVote) => {
    if (!sessionId || lockedVote || pending) return;
    setPending(true);
    setToast(null);
    try {
      const response = await fetch("/api/agents/debate/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ sessionId, vote }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || payload.success === false) {
        setToast({
          tone: "error",
          message:
            payload.error ??
            payload.message ??
            `Vote failed (HTTP ${response.status}).`,
        });
        return;
      }
      onVoteRegistered(vote);
      setToast({
        tone: "success",
        message: `Verdict registered — ${vote === "creator" ? "Creator" : "Critic"} path selected.`,
      });
    } catch {
      setToast({
        tone: "error",
        message: "Network error — vote could not be submitted.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-white/10 overflow-hidden md:grid-cols-2 md:divide-x md:divide-y-0">
        <section className="flex min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-cyan-accent/25 bg-cyan-accent/[0.06] px-3 py-2">
            <Hammer className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-accent">
              Creator Sub-Agent
            </span>
          </header>
          <div className="terminal-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {creatorTurns.length === 0 ? (
              <p className="text-[11px] text-slate-dim">
                Awaiting builder arguments…
              </p>
            ) : (
              creatorTurns.map((turn) => (
                <article
                  key={turn.id}
                  className="animate-[fadeInUp_0.35s_ease-out] rounded-xl border border-cyan-accent/30 bg-cyan-accent/[0.07] px-3 py-2 shadow-[0_0_18px_rgba(0,242,254,0.08)]"
                >
                  <p className="text-[11px] leading-relaxed text-slate-100">
                    {turn.message}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-amber-400/30 bg-amber-400/[0.07] px-3 py-2">
            <Shield className="h-3.5 w-3.5 text-amber-300" aria-hidden />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              Critic Sub-Agent
            </span>
          </header>
          <div className="terminal-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {criticTurns.length === 0 ? (
              <p className="text-[11px] text-slate-dim">
                Awaiting audit challenges…
              </p>
            ) : (
              criticTurns.map((turn) => (
                <article
                  key={turn.id}
                  className="animate-[fadeInUp_0.35s_ease-out] rounded-xl border border-amber-400/35 bg-amber-400/[0.08] px-3 py-2 shadow-[0_0_18px_rgba(251,191,36,0.1)]"
                >
                  <p className="text-[11px] leading-relaxed text-slate-100">
                    {turn.message}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Hidden scroller sync target for full-turn length tracking */}
      <div ref={scrollerRef} className="sr-only" aria-hidden>
        {turns.length}
      </div>

      {showVote ? (
        <div className="shrink-0 border-t border-white/10 bg-gradient-to-b from-white/[0.04] to-black/40 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-muted">
              <Scale className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
              Human consensus vote
            </p>
            {lockedVote ? (
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                Verdict Registered
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(lockedVote) || pending || !sessionId}
              onClick={() => void castVote("creator")}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-accent/50 bg-cyan-accent/15 px-3 py-2.5 text-[11px] font-semibold text-cyan-accent shadow-[0_0_22px_rgba(0,242,254,0.22)] transition hover:bg-cyan-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending && !lockedVote ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Hammer className="h-3.5 w-3.5" aria-hidden />
              )}
              Vote Creator Path
            </button>
            <button
              type="button"
              disabled={Boolean(lockedVote) || pending || !sessionId}
              onClick={() => void castVote("critic")}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-2.5 text-[11px] font-semibold text-amber-200 shadow-[0_0_22px_rgba(251,191,36,0.22)] transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Vote Critic Path
            </button>
          </div>

          {toast ? (
            <div
              role="status"
              className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                toast.tone === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300"
              }`}
            >
              {toast.tone === "success" ? (
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span>{toast.message}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
