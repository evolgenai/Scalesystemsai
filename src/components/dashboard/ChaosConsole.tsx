"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Flame,
  Network,
  Radio,
  Shield,
  Zap,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

export type ChaosFlowNodeId = "error" | "sandbox" | "iot" | "notify";
export type ChaosScenario = "cascade" | "partition";

export type ChaosEventPayload = {
  scenario: ChaosScenario;
  nodeIds: ChaosFlowNodeId[];
  label: string;
};

type TickerLine = {
  id: string;
  at: number;
  delayMs: number;
  text: string;
  tone: "warn" | "heal" | "info";
};

const SCENARIOS: {
  id: ChaosScenario;
  title: string;
  blurb: string;
  nodeIds: ChaosFlowNodeId[];
  icon: typeof Flame;
}[] = [
  {
    id: "cascade",
    title: "Cascade Failure",
    blurb: "DB Crash + Solar PDU Voltage Spike",
    nodeIds: ["error", "sandbox", "iot"],
    icon: Flame,
  },
  {
    id: "partition",
    title: "Network Partition",
    blurb: "Outbound Notification Gateway Timeout",
    nodeIds: ["notify"],
    icon: Network,
  },
];

const HEAL_STEPS = [
  "SRE cluster ACK",
  "Quorum vote",
  "Sandbox snapshot",
  "Circuit rebind",
  "Telemetry green",
];

type ChaosConsoleProps = {
  busy?: boolean;
  onChaosEvent: (payload: ChaosEventPayload) => void;
  onHealComplete?: () => void;
};

export default function ChaosConsole({
  busy = false,
  onChaosEvent,
  onHealComplete,
}: ChaosConsoleProps) {
  const [active, setActive] = useState<ChaosScenario | null>(null);
  const [ticker, setTicker] = useState<TickerLine[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seq = useRef(0);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const pushLine = useCallback(
    (text: string, delayMs: number, tone: TickerLine["tone"]) => {
      seq.current += 1;
      const id = `t-${seq.current}`;
      setTicker((prev) =>
        [{ id, at: Date.now(), delayMs, text, tone }, ...prev].slice(0, 14)
      );
    },
    []
  );

  const runScenario = (scenario: ChaosScenario) => {
    if (busy || active) return;
    const meta = SCENARIOS.find((s) => s.id === scenario)!;
    clearTimers();
    setActive(scenario);
    setTicker([]);

    onChaosEvent({
      scenario,
      nodeIds: meta.nodeIds,
      label: `${meta.title}: ${meta.blurb}`,
    });

    pushLine(`TRIGGER · ${meta.title}`, 0, "warn");
    pushLine(`Glitch inject → ${meta.nodeIds.join(", ")}`, 12, "warn");

    let cursor = 80;
    HEAL_STEPS.forEach((step, i) => {
      const delayMs = 40 + Math.round(Math.random() * 90) + i * 18;
      cursor += delayMs + 180;
      const handle = setTimeout(() => {
        pushLine(`${step} · ${delayMs}µs loop`, delayMs, i === HEAL_STEPS.length - 1 ? "heal" : "info");
      }, cursor);
      timers.current.push(handle);
    });

    const done = setTimeout(() => {
      pushLine("Self-refine complete · Cyber Blue restored", 8, "heal");
      setActive(null);
      onHealComplete?.();
    }, cursor + 700);
    timers.current.push(done);
  };

  return (
    <section
      aria-labelledby="chaos-heading"
      className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]"
    >
      <header className="flex flex-col gap-3 border-b border-white/5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-400">
            <Hover3DIcon intensity={14} glow={false}>
              <Zap className="h-4 w-4" aria-hidden />
            </Hover3DIcon>
          </div>
          <div>
            <h2
              id="chaos-heading"
              className="font-display text-sm font-semibold text-white"
            >
              Chaos Engineering Operator
            </h2>
            <p className="text-[11px] text-slate-dim">
              Admin · inject incidents · measure heal loop
            </p>
          </div>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${
            active
              ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          <Radio
            className={`h-3 w-3 ${active ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {active ? "STRESS LIVE" : "STANDBY"}
        </span>
      </header>

      <div className="grid gap-0 lg:grid-cols-2">
        <div className="space-y-2 border-b border-white/5 p-4 lg:border-b-0 lg:border-r">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            <AlertTriangle className="h-3 w-3 text-amber-400" aria-hidden />
            Trigger incident
          </p>
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const armed = active === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={Boolean(active) || busy}
                onClick={() => runScenario(s.id)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  armed
                    ? "border-rose-400/50 bg-rose-500/15"
                    : "border-white/5 bg-black/30 hover:border-rose-400/35 hover:bg-rose-500/5"
                }`}
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    armed ? "text-rose-300" : "text-amber-400"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-white">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-muted">
                    {s.blurb}
                  </span>
                  <span className="mt-1.5 block font-mono text-[9px] text-slate-dim">
                    nodes: {s.nodeIds.join(" → ")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            <Shield className="h-3 w-3 text-emerald-400" aria-hidden />
            Self-refine loop ticker
          </p>
          <div className="min-h-[11rem] flex-1 overflow-hidden rounded-lg border border-white/5 bg-black/50 font-mono">
            <ul className="max-h-52 space-y-0 overflow-y-auto p-2 text-[10px] sm:max-h-56">
              <AnimatePresence initial={false}>
                {ticker.length === 0 ? (
                  <li className="px-2 py-6 text-center text-slate-dim">
                    Awaiting chaos inject…
                  </li>
                ) : (
                  ticker.map((line) => (
                    <motion.li
                      key={line.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex items-baseline gap-2 border-b border-white/[0.03] px-2 py-1.5 ${
                        line.tone === "warn"
                          ? "text-rose-300"
                          : line.tone === "heal"
                            ? "text-emerald-400"
                            : "text-slate-muted"
                      }`}
                    >
                      <span className="shrink-0 text-slate-dim">
                        {line.delayMs.toString().padStart(3, "0")}µs
                      </span>
                      <span className="min-w-0 break-words">{line.text}</span>
                    </motion.li>
                  ))
                )}
              </AnimatePresence>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
