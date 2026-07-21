"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Radar,
  Send,
  Terminal,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type PhaseId =
  | "analyzing"
  | "patching"
  | "sandbox"
  | "pr";

type PhaseStatus = "pending" | "active" | "done" | "error";

type Phase = {
  id: PhaseId;
  label: string;
  detail: string;
};

type FeedLine = {
  id: string;
  at: number;
  text: string;
  tone: "info" | "phase" | "ok" | "warn";
};

const PHASES: Phase[] = [
  {
    id: "analyzing",
    label: "Analyzing Repo",
    detail: "Map surfaces · diff risk · blast radius",
  },
  {
    id: "patching",
    label: "Generating Patch",
    detail: "Synthesize surgical diffs from directive",
  },
  {
    id: "sandbox",
    label: "Running Sandbox Build",
    detail: "Isolated compile · smoke · regression gate",
  },
  {
    id: "pr",
    label: "Opening Pull Request",
    detail: "Branch · commit · review-ready PR",
  },
];

const PHASE_MS = 1600;

export default function MetaSreCommandDeck() {
  const [directive, setDirective] = useState("");
  const [running, setRunning] = useState(false);
  const [phaseStatus, setPhaseStatus] = useState<Record<PhaseId, PhaseStatus>>(
    () =>
      Object.fromEntries(PHASES.map((p) => [p.id, "pending"])) as Record<
        PhaseId,
        PhaseStatus
      >
  );
  const [activePhase, setActivePhase] = useState<PhaseId | null>(null);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seq = useRef(0);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [feed]);

  const pushFeed = useCallback(
    (text: string, tone: FeedLine["tone"] = "info") => {
      seq.current += 1;
      setFeed((prev) => [
        ...prev,
        { id: `f-${seq.current}`, at: Date.now(), text, tone },
      ]);
    },
    []
  );

  const resetPhases = useCallback(() => {
    setPhaseStatus(
      Object.fromEntries(PHASES.map((p) => [p.id, "pending"])) as Record<
        PhaseId,
        PhaseStatus
      >
    );
    setActivePhase(null);
  }, []);

  const runPipeline = useCallback(
    (objective: string) => {
      clearTimers();
      resetPhases();
      setRunning(true);
      setFeed([]);
      pushFeed(`Directive armed · ${objective.slice(0, 120)}${objective.length > 120 ? "…" : ""}`, "phase");
      pushFeed("Meta-SRE cluster ACK · scheduling execution plane", "info");

      PHASES.forEach((phase, index) => {
        const startAt = index * PHASE_MS;
        const endAt = startAt + PHASE_MS - 120;

        timers.current.push(
          setTimeout(() => {
            setActivePhase(phase.id);
            setPhaseStatus((prev) => ({ ...prev, [phase.id]: "active" }));
            pushFeed(`→ ${phase.label}`, "phase");
            pushFeed(phase.detail, "info");
          }, startAt)
        );

        timers.current.push(
          setTimeout(() => {
            setPhaseStatus((prev) => ({ ...prev, [phase.id]: "done" }));
            pushFeed(`✓ ${phase.label} complete`, "ok");
            if (index === PHASES.length - 1) {
              setActivePhase(null);
              setRunning(false);
              pushFeed("Pull request opened · awaiting Super-Admin review", "ok");
            }
          }, endAt)
        );
      });
    },
    [clearTimers, pushFeed, resetPhases]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = directive.trim();
    if (!trimmed || running) return;
    runPipeline(trimmed);
  };

  return (
    <div className="space-y-5" style={{ backgroundColor: "#09090B" }}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            Super-Admin · Meta-SRE
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-white sm:text-2xl">
            Command Deck
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-muted">
            Issue platform development directives. Live feed tracks SRE phase
            transitions from repo analysis through pull request open.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-slate-dim backdrop-blur-xl">
          <Hover3DIcon intensity={12}>
            <Radar
              className={`h-3.5 w-3.5 ${running ? "animate-pulse text-emerald-400" : "text-slate-500"}`}
              aria-hidden
            />
          </Hover3DIcon>
          {running ? "Pipeline live" : "Standing by"}
        </div>
      </header>

      <form onSubmit={onSubmit} className="glass-panel overflow-hidden">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            Platform directive
          </p>
        </div>
        <div className="space-y-3 p-4">
          <label htmlFor="sre-directive" className="sr-only">
            High-level platform development directive
          </label>
          <textarea
            id="sre-directive"
            rows={3}
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            disabled={running}
            placeholder="e.g. Harden agent stream reconnects and open a PR with sandbox-verified patches…"
            className="w-full resize-y rounded-lg border border-white/10 bg-obsidian/80 px-3.5 py-3 font-mono text-base text-slate-100 placeholder:text-slate-dim outline-none transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-60 sm:text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-dim">
              Phases: Analyzing Repo → Generating Patch → Sandbox Build → Pull Request
            </p>
            <button
              type="submit"
              disabled={running || !directive.trim()}
              className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden />
              )}
              {running ? "Executing…" : "Dispatch directive"}
            </button>
          </div>
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="glass-panel overflow-hidden" aria-label="SRE phases">
          <div className="border-b border-white/5 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
              Phase transitions
            </p>
          </div>
          <ol className="divide-y divide-white/[0.04]">
            {PHASES.map((phase, index) => {
              const status = phaseStatus[phase.id];
              const isActive = activePhase === phase.id;
              return (
                <motion.li
                  key={phase.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3 }}
                  className={`flex items-start gap-3 px-4 py-3.5 transition ${
                    isActive ? "bg-emerald-500/[0.06]" : ""
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
                    ) : status === "active" ? (
                      <Loader2
                        className="h-4 w-4 animate-spin text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-600" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-medium ${
                        status === "done" || status === "active"
                          ? "text-white"
                          : "text-slate-muted"
                      }`}
                    >
                      {phase.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-dim">
                      {phase.detail}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </section>

        <section className="glass-panel flex min-h-[220px] flex-col overflow-hidden sm:min-h-[280px]" aria-live="polite">
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
            <Hover3DIcon intensity={10}>
              <Terminal className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
            </Hover3DIcon>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
              Live execution feed
            </p>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto bg-black/20 p-3 font-mono text-[11px] leading-relaxed">
            {feed.length === 0 ? (
              <p className="px-1 py-6 text-center text-slate-dim">
                Awaiting directive — feed will stream phase transitions here.
              </p>
            ) : (
              <AnimatePresence initial={false}>
                {feed.map((line) => (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex gap-2 rounded px-1.5 py-0.5 ${
                      line.tone === "ok"
                        ? "text-emerald-400"
                        : line.tone === "phase"
                          ? "text-cyan-accent"
                          : line.tone === "warn"
                            ? "text-amber-300"
                            : "text-slate-muted"
                    }`}
                  >
                    <span className="shrink-0 text-slate-600">
                      {new Date(line.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span>{line.text}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={feedEndRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
