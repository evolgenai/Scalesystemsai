"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Code2,
  Database,
  Globe,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";
import RobotMeshIcon from "@/components/ui/RobotMeshIcon";
import type { RobotMeshVariant } from "@/components/ui/RobotMeshIcon";
import MetricsOverview from "@/components/dashboard/MetricsOverview";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

export type WorkspaceMode = "USER" | "DEVELOPER";

const STORAGE_KEY = "scalesystems.workspaceMode";

type ModeContextValue = {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
  isUser: boolean;
  isDeveloper: boolean;
};

const ModeContext = createContext<ModeContextValue | null>(null);

export function useWorkspaceMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error("useWorkspaceMode must be used within WorkspaceModeProvider");
  }
  return ctx;
}

/** Safe for layout chrome outside the provider (defaults to USER). */
export function useWorkspaceModeOptional(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (ctx) return ctx;
  return {
    mode: "USER",
    setMode: () => undefined,
    toggleMode: () => undefined,
    isUser: true,
    isDeveloper: false,
  };
}

export function WorkspaceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<WorkspaceMode>("USER");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "USER" || saved === "DEVELOPER") {
        setModeState(saved);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setMode = useCallback((next: WorkspaceMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "USER" ? "DEVELOPER" : "USER");
  }, [mode, setMode]);

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode,
      isUser: mode === "USER",
      isDeveloper: mode === "DEVELOPER",
    }),
    [mode, setMode, toggleMode]
  );

  return (
    <ModeContext.Provider value={value}>
      <div data-workspace-mode={hydrated ? mode : "USER"} className="contents">
        {children}
      </div>
    </ModeContext.Provider>
  );
}

export function ModeToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useWorkspaceMode();

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#121212] p-1 ${className}`}
      role="group"
      aria-label="Workspace mode"
    >
      <button
        type="button"
        onClick={() => setMode("USER")}
        aria-pressed={mode === "USER"}
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
          mode === "USER"
            ? "bg-emerald-500 text-[#121212] shadow-[0_0_24px_rgba(52,211,153,0.35)]"
            : "text-slate-muted hover:bg-white/5 hover:text-white"
        }`}
      >
        <Hover3DIcon intensity={10}>
          <UserRound className="h-3.5 w-3.5" aria-hidden />
        </Hover3DIcon>
        User
      </button>
      <button
        type="button"
        onClick={() => setMode("DEVELOPER")}
        aria-pressed={mode === "DEVELOPER"}
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
          mode === "DEVELOPER"
            ? "bg-emerald-500 text-[#121212] shadow-[0_0_24px_rgba(52,211,153,0.35)]"
            : "text-slate-muted hover:bg-white/5 hover:text-white"
        }`}
      >
        <Hover3DIcon intensity={10}>
          <Code2 className="h-3.5 w-3.5" aria-hidden />
        </Hover3DIcon>
        Developer
      </button>
    </div>
  );
}

type TemplateCard = {
  id: string;
  title: string;
  blurb: string;
  accent: string;
  border: string;
  glow: string;
  cta: string;
  icon: typeof Globe;
  mesh: RobotMeshVariant;
  steps: string[];
};

const TEMPLATES: TemplateCard[] = [
  {
    id: "scraper",
    title: "Web Scraper Bot",
    blurb: "Pull structured leads from any public URL in one click.",
    accent: "text-emerald-400",
    border: "hover:border-emerald-500/40",
    glow: "from-emerald-500/20 via-transparent to-transparent",
    cta: "Launch scraper",
    icon: Globe,
    mesh: "writer",
    steps: ["Paste target URL", "Pick extract fields", "Schedule or run now"],
  },
  {
    id: "notify",
    title: "Notification Trigger",
    blurb: "Ping Slack, email, or SMS when a metric crosses a threshold.",
    accent: "text-cyan-accent",
    border: "hover:border-cyan-accent/40",
    glow: "from-cyan-accent/20 via-transparent to-transparent",
    cta: "Set trigger",
    icon: BellRing,
    mesh: "supervisor",
    steps: ["Choose signal source", "Set threshold", "Connect channel"],
  },
  {
    id: "healer",
    title: "Data Auto-Healer",
    blurb: "Detect broken pipelines and auto-retry with safe rollbacks.",
    accent: "text-amber-300",
    border: "hover:border-amber-400/40",
    glow: "from-amber-400/20 via-transparent to-transparent",
    cta: "Enable healer",
    icon: Database,
    mesh: "validator",
    steps: ["Select data store", "Define health checks", "Arm auto-heal"],
  },
];

function TemplateCardStack({
  onSelect,
  activeId,
}: {
  onSelect: (id: string) => void;
  activeId: string | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {TEMPLATES.map((t, i) => {
        const Icon = t.icon;
        const selected = activeId === t.id;
        return (
          <motion.button
            key={t.id}
            type="button"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.35 }}
            onClick={() => onSelect(t.id)}
            className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-[#121212] p-5 text-left transition ${t.border} ${
              selected ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : ""
            }`}
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${t.glow} opacity-60`}
              aria-hidden
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="space-y-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${t.accent}`}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  Preset
                </span>
                <h3 className="font-display text-lg font-bold text-white">
                  {t.title}
                </h3>
                <p className="text-xs leading-relaxed text-slate-muted">
                  {t.blurb}
                </p>
              </div>
              <RobotMeshIcon
                size={72}
                variant={t.mesh}
                active={selected}
                status={selected ? "working" : "idle"}
                label={t.title}
                className="rounded-xl"
              />
            </div>
            <div className="relative mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              {t.cta}
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function ActionWizard({
  templateId,
  onClose,
  onComplete,
}: {
  templateId: string;
  onClose: () => void;
  onComplete: (objective: string) => void;
}) {
  const template = TEMPLATES.find((t) => t.id === templateId);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");

  if (!template) return null;

  const isLast = step >= template.steps.length - 1;
  const placeholders = [
    "https://example.com/leads",
    "error_rate > 5% for 3m",
    "postgres://primary/analytics",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#121212]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Wand2 className="h-4 w-4 text-emerald-400" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-white">{template.title}</p>
            <p className="text-[11px] text-slate-dim">
              Step {step + 1} of {template.steps.length} · {template.steps[step]}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] uppercase tracking-wide text-slate-dim hover:text-white"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex gap-2">
          {template.steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= step ? "bg-emerald-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-medium text-slate-muted">
            {template.steps[step]}
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholders[step] ?? "Enter value…"}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-dim focus:border-emerald-500/40"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-xs font-semibold text-slate-muted hover:text-white"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (!isLast) {
                setStep((s) => s + 1);
                setInput("");
                return;
              }
              onComplete(
                `${template.title}: ${input || template.steps[step]}`
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-[#121212] transition hover:bg-emerald-400"
          >
            {isLast ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Run automation
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function UserModeDashboard({
  onLaunchObjective,
}: {
  onLaunchObjective?: (objective: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section aria-labelledby="user-metrics-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden />
          <h2
            id="user-metrics-heading"
            className="font-display text-sm font-semibold uppercase tracking-wider text-slate-muted"
          >
            Active metrics
          </h2>
        </div>
        <MetricsOverview />
      </section>

      <section aria-labelledby="template-stack-heading" className="space-y-3">
        <div>
          <h2
            id="template-stack-heading"
            className="font-display text-xl font-bold tracking-tight text-white"
          >
            Beginner template stack
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-muted">
            Pick a pre-built automation — no terminals, no raw logs. Guided
            wizards ship the swarm for you.
          </p>
        </div>
        <TemplateCardStack
          activeId={activeId}
          onSelect={(id) => setActiveId(id)}
        />
      </section>

      <AnimatePresence mode="wait">
        {activeId ? (
          <ActionWizard
            key={activeId}
            templateId={activeId}
            onClose={() => setActiveId(null)}
            onComplete={(objective) => {
              onLaunchObjective?.(objective);
              setActiveId(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type ModeWrapperProps = {
  userContent?: ReactNode;
  developerContent: ReactNode;
  onLaunchObjective?: (objective: string) => void;
  /** Extra chrome rendered beside the mode toggle (e.g. engine badges). */
  headerAside?: ReactNode;
  title?: string;
  subtitle?: string;
  badge?: string;
};

/**
 * Global mode switch shell — header toggle + User / Developer view planes.
 */
export default function ModeWrapper({
  userContent,
  developerContent,
  onLaunchObjective,
  headerAside,
  title = "ScaleSystems Workforce Console",
  subtitle,
  badge,
}: ModeWrapperProps) {
  const { mode, isUser } = useWorkspaceMode();

  const resolvedBadge =
    badge ?? (isUser ? "User Workspace" : "Developer Command Center");
  const resolvedSubtitle =
    subtitle ??
    (isUser
      ? "High-level metrics, preset templates, and guided action wizards — terminals and system logs stay hidden."
      : "Full technical plane: edge middleware telemetrics, KV cache stats, live SRE agent streams, and Chaos Operator.");

  return (
    <div className="space-y-0">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-1.5 text-xs font-medium text-emerald-400">
              <Hover3DIcon intensity={14}>
                {isUser ? (
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Code2 className="h-3.5 w-3.5" aria-hidden />
                )}
              </Hover3DIcon>
              {resolvedBadge}
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {title.includes(" ") ? (
                <>
                  {title.split(" ").slice(0, -2).join(" ")}{" "}
                  <span className="text-gradient">
                    {title.split(" ").slice(-2).join(" ")}
                  </span>
                </>
              ) : (
                title
              )}
            </h1>
            <p className="max-w-2xl text-sm text-slate-muted">
              {resolvedSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ModeToggle />
            {headerAside}
          </div>
        </div>
      </motion.header>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28 }}
        >
          {isUser
            ? (userContent ?? (
                <UserModeDashboard onLaunchObjective={onLaunchObjective} />
              ))
            : developerContent}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
