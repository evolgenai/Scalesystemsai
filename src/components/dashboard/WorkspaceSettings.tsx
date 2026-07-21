"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  FlaskConical,
  Loader2,
  Settings2,
  Shield,
  Sparkles,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type FlagId =
  | "aiOptimization"
  | "thirdPartyWebhooks"
  | "sandboxAutoHeal"
  | "edgePrefetch"
  | "telemetryMirror";

type FlagMeta = {
  id: FlagId;
  label: string;
  description: string;
  Icon: LucideIcon;
  experimental?: boolean;
};

type SliderId = "optIntensity" | "webhookConcurrency" | "healBudget";

type SliderMeta = {
  id: SliderId;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  format: (v: number) => string;
  requires?: FlagId;
};

type FlagStatus = "idle" | "saving" | "ok" | "warn";

const FLAGS: FlagMeta[] = [
  {
    id: "aiOptimization",
    label: "Experimental AI optimization loops",
    description:
      "Opt into recursive prompt compression and tool-call batching across swarm lanes.",
    Icon: Sparkles,
    experimental: true,
  },
  {
    id: "thirdPartyWebhooks",
    label: "Third-party webhook egress",
    description:
      "Allow outbound signed webhooks to tenant-registered endpoints on state transitions.",
    Icon: Webhook,
  },
  {
    id: "sandboxAutoHeal",
    label: "Sandbox auto-heal",
    description:
      "Restart crashed sandbox workers and rebind MCP sockets without manual ACK.",
    Icon: Shield,
  },
  {
    id: "edgePrefetch",
    label: "Edge result prefetch",
    description:
      "Warm KV scratchpads for predicted follow-up objectives on the teletraffic edge.",
    Icon: Zap,
  },
  {
    id: "telemetryMirror",
    label: "Telemetry mirror stream",
    description:
      "Duplicate isometric flow health frames into the org audit WORM lane.",
    Icon: FlaskConical,
    experimental: true,
  },
];

const SLIDERS: SliderMeta[] = [
  {
    id: "optIntensity",
    label: "Optimization intensity",
    description: "How aggressively AI loops rewrite tool plans.",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    format: (v) => `${v}`,
    requires: "aiOptimization",
  },
  {
    id: "webhookConcurrency",
    label: "Webhook concurrency",
    description: "Max parallel egress deliveries per tenant.",
    min: 1,
    max: 32,
    step: 1,
    unit: "slots",
    format: (v) => `${v}`,
    requires: "thirdPartyWebhooks",
  },
  {
    id: "healBudget",
    label: "Auto-heal budget",
    description: "Micro-SLA ceiling before heal is marked degraded.",
    min: 100,
    max: 2000,
    step: 50,
    unit: "ms",
    format: (v) => `${v}`,
    requires: "sandboxAutoHeal",
  },
];

const DEFAULT_FLAGS: Record<FlagId, boolean> = {
  aiOptimization: false,
  thirdPartyWebhooks: true,
  sandboxAutoHeal: true,
  edgePrefetch: false,
  telemetryMirror: false,
};

const DEFAULT_SLIDERS: Record<SliderId, number> = {
  optIntensity: 40,
  webhookConcurrency: 8,
  healBudget: 400,
};

export default function WorkspaceSettings() {
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS);
  const [status, setStatus] = useState<Record<FlagId, FlagStatus>>(
    () =>
      Object.fromEntries(FLAGS.map((f) => [f.id, "idle"])) as Record<
        FlagId,
        FlagStatus
      >
  );
  const [sliderPulse, setSliderPulse] = useState<SliderId | null>(null);

  const activeCount = FLAGS.filter((f) => flags[f.id]).length;

  const persistFlag = useCallback((id: FlagId, next: boolean) => {
    setStatus((prev) => ({ ...prev, [id]: "saving" }));
    window.setTimeout(() => {
      setStatus((prev) => ({
        ...prev,
        [id]: next || id !== "thirdPartyWebhooks" ? "ok" : "warn",
      }));
      window.setTimeout(() => {
        setStatus((prev) =>
          prev[id] === "saving" ? prev : { ...prev, [id]: "idle" }
        );
      }, 1400);
    }, 420);
  }, []);

  const toggleFlag = (id: FlagId) => {
    setFlags((prev) => {
      const next = !prev[id];
      persistFlag(id, next);
      return { ...prev, [id]: next };
    });
  };

  const setSlider = (id: SliderId, value: number) => {
    setSliders((prev) => ({ ...prev, [id]: value }));
    setSliderPulse(id);
    window.setTimeout(() => {
      setSliderPulse((cur) => (cur === id ? null : cur));
    }, 600);
  };

  return (
    <section aria-labelledby="workspace-settings-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400">
            <Hover3DIcon intensity={12}>
              <Settings2 className="h-3 w-3" aria-hidden />
            </Hover3DIcon>
            Advanced workspace
          </div>
          <h2
            id="workspace-settings-heading"
            className="font-display text-2xl font-bold tracking-tight text-white"
          >
            Global Feature Toggles
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-muted">
            Tenant-level controls for experimental AI loops, webhook egress, and
            sandbox heal budgets. Changes apply instantly to this workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-[#121212] px-3 py-2 text-xs text-slate-muted">
            Active
            <span className="font-mono text-blue-400">
              {activeCount}/{FLAGS.length}
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatChip label="Feature plane" value="#121212" mono />
        <StatChip
          label="Experimental"
          value={`${FLAGS.filter((f) => f.experimental && flags[f.id]).length} armed`}
        />
        <StatChip
          label="Egress"
          value={flags.thirdPartyWebhooks ? "webhooks on" : "webhooks off"}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            Feature flags
          </p>
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {FLAGS.map((flag, index) => {
            const on = flags[flag.id];
            const flagStatus = status[flag.id];
            const Icon = flag.Icon;
            return (
              <motion.li
                key={flag.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: index * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        on ? "text-blue-400" : "text-zinc-500"
                      }`}
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-white">{flag.label}</p>
                    {flag.experimental ? (
                      <span className="rounded border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-200">
                        Experimental
                      </span>
                    ) : null}
                    <StatusBadge status={flagStatus} on={on} />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {flag.description}
                  </p>
                </div>
                <ToggleSwitch
                  checked={on}
                  busy={flagStatus === "saving"}
                  onChange={() => toggleFlag(flag.id)}
                  label={flag.label}
                />
              </motion.li>
            );
          })}
        </ul>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            Runtime knobs
          </p>
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {SLIDERS.map((slider, index) => {
            const gated =
              slider.requires != null ? flags[slider.requires] : true;
            const value = sliders[slider.id];
            const pct =
              ((value - slider.min) / (slider.max - slider.min)) * 100;
            const pulsing = sliderPulse === slider.id;
            return (
              <motion.li
                key={slider.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.15 + index * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`px-4 py-4 transition ${
                  gated ? "opacity-100" : "opacity-40"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {slider.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {slider.description}
                    </p>
                  </div>
                  <motion.span
                    key={`${slider.id}-${value}`}
                    initial={{ scale: 0.92, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`font-mono text-sm font-semibold ${
                      pulsing ? "text-blue-300" : "text-blue-400"
                    }`}
                  >
                    {slider.format(value)}
                    <span className="ml-1 text-[10px] font-medium text-zinc-500">
                      {slider.unit}
                    </span>
                  </motion.span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={value}
                  disabled={!gated}
                  onChange={(e) =>
                    setSlider(slider.id, Number(e.target.value))
                  }
                  aria-label={slider.label}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-blue-400 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(59, 130, 246,0.45)]"
                  style={{
                    background: `linear-gradient(to right, rgb(52 211 153 / 0.7) ${pct}%, rgb(255 255 255 / 0.08) ${pct}%)`,
                  }}
                />
                <div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-600">
                  <span>
                    {slider.format(slider.min)}
                    {slider.unit}
                  </span>
                  <span>
                    {slider.format(slider.max)}
                    {slider.unit}
                  </span>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function ToggleSwitch({
  checked,
  busy,
  onChange,
  label,
}: {
  checked: boolean;
  busy: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
        checked
          ? "border-blue-500/50 bg-blue-500/25"
          : "border-white/15 bg-white/5"
      } ${busy ? "cursor-wait opacity-80" : ""}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 520, damping: 32 }}
        className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full shadow ${
          checked ? "bg-blue-400" : "bg-white/80"
        }`}
        style={{ left: checked ? "1.45rem" : "0.125rem" }}
      >
        {busy ? (
          <Loader2
            className="h-3 w-3 animate-spin text-[#121212]"
            aria-hidden
          />
        ) : null}
      </motion.span>
    </button>
  );
}

function StatusBadge({
  status,
  on,
}: {
  status: FlagStatus;
  on: boolean;
}) {
  return (
    <AnimatePresence mode="wait">
      {status === "saving" ? (
        <motion.span
          key="saving"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="inline-flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-300"
        >
          <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
          Syncing
        </motion.span>
      ) : status === "ok" ? (
        <motion.span
          key="ok"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="inline-flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-400"
        >
          <Check className="h-2.5 w-2.5" aria-hidden />
          {on ? "Enabled" : "Disabled"}
        </motion.span>
      ) : status === "warn" ? (
        <motion.span
          key="warn"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-200"
        >
          Review
        </motion.span>
      ) : null}
    </AnimatePresence>
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
          mono ? "font-mono text-blue-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
