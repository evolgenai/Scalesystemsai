"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  BellRing,
  Fuel,
  Gauge,
  Radio,
  Save,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";
import { useAlertToasts } from "@/components/dashboard/AlertToastContext";

type MetricId = "computeGas" | "healLatency" | "notifyCost" | "errorRate";

type AlertRule = {
  id: MetricId;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultThreshold: number;
  format: (v: number) => string;
  Icon: LucideIcon;
};

const RULES: AlertRule[] = [
  {
    id: "computeGas",
    label: "Compute Gas Costs",
    description: "Notify when swarm token burn exceeds this ceiling.",
    unit: "tokens",
    min: 10_000,
    max: 500_000,
    step: 5_000,
    defaultThreshold: 120_000,
    format: (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v),
    Icon: Fuel,
  },
  {
    id: "healLatency",
    label: "Self-Heal Latency",
    description: "Alert if a heal cycle overruns this micro-SLA.",
    unit: "ms",
    min: 50,
    max: 2000,
    step: 25,
    defaultThreshold: 400,
    format: (v) => `${v}`,
    Icon: Gauge,
  },
  {
    id: "notifyCost",
    label: "Notification Dispatch Spend",
    description: "Cap outbound WhatsApp / Telegram / email spend.",
    unit: "USD",
    min: 1,
    max: 100,
    step: 1,
    defaultThreshold: 25,
    format: (v) => `$${v}`,
    Icon: Bell,
  },
  {
    id: "errorRate",
    label: "Chaos Error Rate",
    description: "Trigger when incident density crosses this percentage.",
    unit: "%",
    min: 1,
    max: 40,
    step: 1,
    defaultThreshold: 8,
    format: (v) => `${v}%`,
    Icon: ShieldAlert,
  },
];

type ChannelId = "inApp" | "telegram" | "email";

const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: "inApp", label: "In-app toast stream" },
  { id: "telegram", label: "Telegram push" },
  { id: "email", label: "Email digest" },
];

type RuleState = Record<
  MetricId,
  { enabled: boolean; threshold: number }
>;

function buildDefaults(): RuleState {
  return RULES.reduce((acc, rule) => {
    acc[rule.id] = { enabled: rule.id === "computeGas", threshold: rule.defaultThreshold };
    return acc;
  }, {} as RuleState);
}

export default function AlertConfig() {
  const { pushAlert } = useAlertToasts();
  const [rules, setRules] = useState<RuleState>(buildDefaults);
  const [channels, setChannels] = useState<Record<ChannelId, boolean>>({
    inApp: true,
    telegram: true,
    email: false,
  });
  const [savedFlash, setSavedFlash] = useState(false);

  const enabledCount = RULES.filter((r) => rules[r.id].enabled).length;

  const toggleRule = (id: MetricId) => {
    setRules((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id].enabled },
    }));
  };

  const setThreshold = (id: MetricId, threshold: number) => {
    setRules((prev) => ({
      ...prev,
      [id]: { ...prev[id], threshold },
    }));
  };

  const toggleChannel = (id: ChannelId) => {
    setChannels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = useCallback(() => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
    pushAlert({
      tone: "heal",
      title: "Alert rules saved",
      detail: `${enabledCount} threshold${enabledCount === 1 ? "" : "s"} armed · ${
        Object.values(channels).filter(Boolean).length
      } channel${Object.values(channels).filter(Boolean).length === 1 ? "" : "s"}`,
    });
  }, [channels, enabledCount, pushAlert]);

  const simulateBreach = useCallback(() => {
    const armed = RULES.find((r) => rules[r.id].enabled) ?? RULES[0];
    const state = rules[armed.id];
    pushAlert({
      tone: "threshold",
      title: `${armed.label} threshold breached`,
      detail: `Live reading exceeded ${armed.format(state.threshold)} ${armed.unit} · dispatching channels`,
    });
  }, [pushAlert, rules]);

  return (
    <section aria-labelledby="alert-config-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
            <Hover3DIcon intensity={12}>
              <BellRing className="h-3 w-3" aria-hidden />
            </Hover3DIcon>
            Tenant alert rules
          </div>
          <h2
            id="alert-config-heading"
            className="font-display text-2xl font-bold tracking-tight text-white"
          >
            Alert Rules Configuration
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-muted">
            Set thresholds for compute gas, heal latency, and chaos density.
            Matching incidents stream into the live toast stack.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={simulateBreach}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/15"
          >
            <Radio className="h-3.5 w-3.5" aria-hidden />
            Simulate breach
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25"
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            {savedFlash ? "Saved" : "Save rules"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatChip label="Armed rules" value={`${enabledCount} / ${RULES.length}`} />
        <StatChip
          label="Dispatch channels"
          value={`${Object.values(channels).filter(Boolean).length} live`}
        />
        <StatChip label="Theme plane" value="#121212" mono />
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            Threshold triggers
          </p>
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {RULES.map((rule, index) => {
            const state = rules[rule.id];
            const Icon = rule.Icon;
            const pct =
              ((state.threshold - rule.min) / (rule.max - rule.min)) * 100;
            return (
              <motion.li
                key={rule.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: index * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="px-4 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <label className="flex cursor-pointer items-start gap-3 sm:w-56 sm:shrink-0">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={() => toggleRule(rule.id)}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-[#0a0a0a] text-emerald-500 accent-emerald-500 focus:ring-emerald-500/40"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium text-white">
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            state.enabled ? "text-emerald-400" : "text-zinc-500"
                          }`}
                          aria-hidden
                        />
                        {rule.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {rule.description}
                      </span>
                    </span>
                  </label>

                  <div
                    className={`min-w-0 flex-1 transition ${
                      state.enabled ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-dim">
                        Threshold
                      </span>
                      <span className="font-mono text-sm font-semibold text-emerald-400">
                        {rule.format(state.threshold)}
                        <span className="ml-1 text-[10px] font-medium text-zinc-500">
                          {rule.unit}
                        </span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={rule.min}
                      max={rule.max}
                      step={rule.step}
                      value={state.threshold}
                      disabled={!state.enabled}
                      onChange={(e) =>
                        setThreshold(rule.id, Number(e.target.value))
                      }
                      aria-label={`${rule.label} threshold`}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-400 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400"
                      style={{
                        background: `linear-gradient(to right, rgb(52 211 153 / 0.7) ${pct}%, rgb(255 255 255 / 0.08) ${pct}%)`,
                      }}
                    />
                    <div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-600">
                      <span>{rule.format(rule.min)}</span>
                      <span>{rule.format(rule.max)}</span>
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            Delivery channels
          </p>
        </div>
        <div className="grid gap-0 sm:grid-cols-3">
          {CHANNELS.map((ch) => (
            <label
              key={ch.id}
              className="flex cursor-pointer items-center gap-3 border-b border-white/[0.04] px-4 py-3.5 transition hover:bg-white/[0.02] sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <input
                type="checkbox"
                checked={channels[ch.id]}
                onChange={() => toggleChannel(ch.id)}
                className="h-4 w-4 cursor-pointer rounded border-white/20 bg-[#0a0a0a] text-emerald-500 accent-emerald-500 focus:ring-emerald-500/40"
              />
              <span className="text-sm text-white">{ch.label}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatChip({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-[#121212] px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold text-white ${
          mono ? "font-mono text-emerald-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
