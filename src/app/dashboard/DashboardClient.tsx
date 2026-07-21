"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  CircleDot,
  Activity,
  PanelsTopLeft,
  Store,
  Zap,
  Radio,
  Plug,
  BellRing,
  ClipboardList,
  Settings2,
  Box,
  Shield,
  X,
  ShoppingBag,
  Package,
  HeartPulse,
  GitFork,
  Terminal,
} from "lucide-react";
import AgentVisualizerCard from "@/components/dashboard/AgentVisualizerCard";
import AgentSpawnPanel from "@/components/dashboard/AgentSpawnPanel";
import AgentPersonaSelector from "@/components/dashboard/AgentPersonaSelector";
import LiveStreamTerminal from "@/components/dashboard/LiveStreamTerminal";
import WorkspaceHistorySidebar from "@/components/dashboard/WorkspaceHistorySidebar";
import McpManager from "@/components/dashboard/McpManager";
import HealerConsole from "@/components/dashboard/HealerConsole";
import EconomyMetricsDashboard from "@/components/dashboard/EconomyMetricsDashboard";
import TeletrafficBoard from "@/components/dashboard/TeletrafficBoard";
import type { FlowNodeId } from "@/components/dashboard/IsometricFlowMap";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import Hover3DIcon from "@/components/ui/Hover3DIcon";
import {
  MarketplaceSkeleton,
  TokenVaultSkeleton,
  ChaosConsoleSkeleton,
  PluginAnalyticsSkeleton,
  AlertConfigSkeleton,
  AuditLogSkeleton,
  WorkspaceSettingsSkeleton,
} from "@/components/ui/DashboardSkeletons";

const AgentCardStack3D = dynamic(
  () => import("@/components/dashboard/AgentCardStack3D"),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl"
          />
        ))}
      </div>
    ),
  }
);

const IsometricFlowMap = dynamic(
  () => import("@/components/dashboard/IsometricFlowMap"),
  {
    ssr: false,
    loading: () => (
      <div className="mb-8 h-[260px] animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl sm:h-[300px]" />
    ),
  }
);

const AgentMarketplace = dynamic(
  () => import("@/components/marketplace/AgentMarketplace"),
  { ssr: false, loading: () => <MarketplaceSkeleton /> }
);

const TokenVault = dynamic(
  () => import("@/components/dashboard/TokenVault"),
  { ssr: false, loading: () => <TokenVaultSkeleton /> }
);

const ChaosConsole = dynamic(
  () => import("@/components/dashboard/ChaosConsole"),
  { ssr: false, loading: () => <ChaosConsoleSkeleton /> }
);

const PluginAnalytics = dynamic(
  () => import("@/components/dashboard/PluginAnalytics"),
  { ssr: false, loading: () => <PluginAnalyticsSkeleton /> }
);

const AlertConfig = dynamic(
  () => import("@/components/dashboard/AlertConfig"),
  { ssr: false, loading: () => <AlertConfigSkeleton /> }
);

const AuditLog = dynamic(
  () => import("@/components/dashboard/AuditLog"),
  { ssr: false, loading: () => <AuditLogSkeleton /> }
);

const WorkspaceSettings = dynamic(
  () => import("@/components/dashboard/WorkspaceSettings"),
  { ssr: false, loading: () => <WorkspaceSettingsSkeleton /> }
);

const UniverseDeck = dynamic(
  () => import("@/components/sandbox/UniverseDeck"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy aria-label="Loading universe deck">
        <div className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-h-[420px] animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl sm:min-h-[480px]" />
          <div className="min-h-[420px] animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        </div>
      </div>
    ),
  }
);

const MetaSreCommandDeck = dynamic(
  () => import("@/components/admin/MetaSreCommandDeck"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy aria-label="Loading SRE command deck">
        <div className="h-24 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-h-[280px] animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
          <div className="min-h-[280px] animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        </div>
      </div>
    ),
  }
);

const DiscordWebhookConfig = dynamic(
  () => import("@/components/admin/DiscordWebhookConfig"),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-40 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl"
        aria-busy
        aria-label="Loading Discord webhook config"
      />
    ),
  }
);

const ItemsCatalog = dynamic(
  () => import("@/components/shop/ItemsCatalog"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy aria-label="Loading items catalog">
        <div className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
          ))}
        </div>
      </div>
    ),
  }
);

const ItemsManager = dynamic(
  () => import("@/components/admin/ItemsManager"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy aria-label="Loading inventory manager">
        <div className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
      </div>
    ),
  }
);

const SreHealthMonitor = dynamic(
  () => import("@/components/admin/SreHealthMonitor"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy aria-label="Loading SRE health monitor">
        <div className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-96 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
          <div className="space-y-4">
            <div className="h-56 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
            <div className="h-32 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
          </div>
        </div>
      </div>
    ),
  }
);

const BlueprintCanvas = dynamic(
  () => import("@/components/builder/BlueprintCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy aria-label="Loading workflow builder">
        <div className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        <div className="h-[min(78vh,820px)] min-h-[520px] animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
      </div>
    ),
  }
);

const SwarmCliPanel = dynamic(
  () => import("@/components/cli/SwarmCliPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy aria-label="Loading CLI panel">
        <div className="h-24 animate-pulse rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
          <div className="h-40 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl" />
      </div>
    ),
  }
);

import ModeWrapper, {
  useWorkspaceMode,
} from "@/components/dashboard/ModeWrapper";
import GasMeterPill from "@/components/billing/GasMeterPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAlertToasts } from "@/components/dashboard/AlertToastContext";
import { useAgentStream } from "@/lib/agents/useAgentStream";
import { trackFunnelEvent } from "@/lib/analytics/funnel";
import { DEFAULT_PERSONA_ID } from "@/lib/agents/personaPresets";
import { reportWorkspaceActivity } from "@/lib/org/useWorkspacePresence";

const DEFAULT_OBJECTIVE =
  "Analyze https://example.com and run a TypeScript lead-scoring script in the sandbox.";

type DashboardClientProps = {
  /** Server-derived env bypass: DEV_USER_ROLE + DEV_USER_TIER. */
  isSuperAdmin?: boolean;
};

export default function DashboardClient({
  isSuperAdmin = false,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready: authReady } = useAuth();
  const { pushAlert } = useAlertToasts();
  const { isUser, isDeveloper } = useWorkspaceMode();
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [mountedPluginIds, setMountedPluginIds] = useState<string[]>([]);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [troubleshootActive, setTroubleshootActive] = useState(false);
  const [crashAlert, setCrashAlert] = useState<string | null>(null);
  const [consoleView, setConsoleView] = useState<
    | "workforce"
    | "marketplace"
    | "chaos"
    | "teletraffic"
    | "plugins"
    | "alerts"
    | "audit"
    | "settings"
    | "universe"
    | "sre-control"
    | "catalog"
    | "inventory"
    | "sre-health"
    | "builder"
    | "cli"
  >("workforce");
  const [stressedNodeIds, setStressedNodeIds] = useState<FlowNodeId[]>([]);
  const [chaosOverrideHealth, setChaosOverrideHealth] = useState<
    "healthy" | "incident" | "healing" | null
  >(null);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  /**
   * Hydration-stable lock: SSR + first client paint use only the server-passed
   * isSuperAdmin flag. Auth (localStorage) is applied after `authReady` so
   * guest Vercel views never mismatch / unmount the selector.
   */
  const [personasLocked, setPersonasLocked] = useState(!isSuperAdmin);

  useEffect(() => {
    const view = searchParams.get("view");
    const developerOnly =
      view === "chaos" ||
      view === "teletraffic" ||
      view === "plugins" ||
      view === "audit" ||
      view === "universe" ||
      view === "cli";
    if (view === "sre-control" && !isSuperAdmin) {
      setConsoleView("workforce");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      const qs = params.toString();
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
      return;
    }
    if ((view === "inventory" || view === "sre-health") && !isSuperAdmin) {
      setConsoleView("workforce");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      const qs = params.toString();
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
      return;
    }
    if (isUser && developerOnly) {
      setConsoleView("workforce");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      const qs = params.toString();
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
      return;
    }
    if (view === "marketplace") setConsoleView("marketplace");
    else if (view === "chaos") setConsoleView("chaos");
    else if (view === "teletraffic") setConsoleView("teletraffic");
    else if (view === "plugins") setConsoleView("plugins");
    else if (view === "alerts") setConsoleView("alerts");
    else if (view === "audit") setConsoleView("audit");
    else if (view === "settings") setConsoleView("settings");
    else if (view === "universe") setConsoleView("universe");
    else if (view === "sre-control") setConsoleView("sre-control");
    else if (view === "catalog") setConsoleView("catalog");
    else if (view === "inventory") setConsoleView("inventory");
    else if (view === "sre-health") setConsoleView("sre-health");
    else if (view === "builder") setConsoleView("builder");
    else if (view === "cli") setConsoleView("cli");
    else setConsoleView("workforce");
  }, [searchParams, isUser, isSuperAdmin, router]);

  const setView = useCallback(
    (
      next:
        | "workforce"
        | "marketplace"
        | "chaos"
        | "teletraffic"
        | "plugins"
        | "alerts"
        | "audit"
        | "settings"
        | "universe"
        | "sre-control"
        | "catalog"
        | "inventory"
        | "sre-health"
        | "builder"
        | "cli"
    ) => {
      setConsoleView(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "marketplace") params.set("view", "marketplace");
      else if (next === "chaos") params.set("view", "chaos");
      else if (next === "teletraffic") params.set("view", "teletraffic");
      else if (next === "plugins") params.set("view", "plugins");
      else if (next === "alerts") params.set("view", "alerts");
      else if (next === "audit") params.set("view", "audit");
      else if (next === "settings") params.set("view", "settings");
      else if (next === "universe") params.set("view", "universe");
      else if (next === "sre-control") params.set("view", "sre-control");
      else if (next === "catalog") params.set("view", "catalog");
      else if (next === "inventory") params.set("view", "inventory");
      else if (next === "sre-health") params.set("view", "sre-health");
      else if (next === "builder") params.set("view", "builder");
      else if (next === "cli") params.set("view", "cli");
      else params.delete("view");
      const qs = params.toString();
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (!authReady) return;
    setPersonasLocked(!(isSuperAdmin || Boolean(user)));
  }, [authReady, isSuperAdmin, user]);

  useEffect(() => {
    try {
      if (isSuperAdmin) {
        window.localStorage.setItem("scalesystems.ui.superAdmin", "1");
      } else {
        window.localStorage.removeItem("scalesystems.ui.superAdmin");
      }
    } catch {
      /* ignore */
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setWorkspaceOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const {
    lines,
    results,
    agents,
    connection,
    overallProgress,
    paymentRequired,
    sessionId,
    debateTurns,
    consensusPending,
    debateVote,
    recalledMemories,
    sandboxFrames,
    start,
    stop,
    pause,
    resume,
    clear,
    dismissPaymentRequired,
    registerDebateVote,
    hydrateFromHistory,
  } = useAgentStream({
    enabled: false,
    objective,
    personaId,
    customSystemPrompt,
    loop: false,
  });

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      trackFunnelEvent({
        event: "payment_success_landing",
        provider: searchParams.get("provider") ?? undefined,
        plan: searchParams.get("plan") ?? undefined,
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (connection === "closed") {
      setHistoryRefreshToken((token) => token + 1);
    }
  }, [connection]);

  useEffect(() => {
    if (
      connection === "live" ||
      connection === "paused" ||
      connection === "connecting"
    ) {
      reportWorkspaceActivity("spectating");
      return;
    }
    reportWorkspaceActivity("idle");
  }, [connection]);

  const handleObjectiveChange = useCallback((value: string) => {
    setObjective(value);
    if (
      connection === "live" ||
      connection === "paused" ||
      connection === "connecting"
    ) {
      return;
    }
    reportWorkspaceActivity("typing");
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = setTimeout(() => {
      reportWorkspaceActivity("idle");
    }, 2500);
  }, [connection]);

  const handleStart = useCallback(() => {
    setSelectedSessionId(null);
    clear();
    start(objective);
  }, [clear, objective, start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleClear = useCallback(() => {
    setSelectedSessionId(null);
    clear();
  }, [clear]);

  const handleSelectSession = useCallback(
    (session: {
      id: string;
      objective: string;
      lines: Parameters<typeof hydrateFromHistory>[0]["lines"];
      results: Parameters<typeof hydrateFromHistory>[0]["results"];
    }) => {
      setSelectedSessionId(session.id);
      hydrateFromHistory({
        lines: session.lines,
        results: session.results,
      });
    },
    [hydrateFromHistory]
  );

  const handleRerun = useCallback((savedObjective: string) => {
    setSelectedSessionId(null);
    setObjective(savedObjective);
  }, []);

  const activeCount = agents.filter(
    (a) => a.status === "THINKING" || a.status === "EXECUTING"
  ).length;

  const flowHealth =
    chaosOverrideHealth ??
    (troubleshootActive && crashAlert
      ? ("incident" as const)
      : troubleshootActive
        ? ("healing" as const)
        : crashAlert
          ? ("incident" as const)
          : ("healthy" as const));

  const handleChaosEvent = useCallback(
    (payload: { nodeIds: FlowNodeId[]; label: string }) => {
      setStressedNodeIds(payload.nodeIds);
      setChaosOverrideHealth("incident");
      setCrashAlert(payload.label);
      setTroubleshootActive(true);
      pushAlert({
        tone: "incident",
        title: "Chaos incident detected",
        detail: payload.label,
      });
    },
    [pushAlert]
  );

  const handleChaosHealComplete = useCallback(() => {
    setStressedNodeIds([]);
    setChaosOverrideHealth("healing");
    setTroubleshootActive(false);
    setCrashAlert(null);
    pushAlert({
      tone: "heal",
      title: "Self-healing cycle complete",
      detail: "Telemetry green · emerald restored across stressed nodes",
    });
    window.setTimeout(() => setChaosOverrideHealth(null), 1200);
  }, [pushAlert]);

  const handleLaunchFromTemplate = useCallback(
    (nextObjective: string) => {
      setSelectedSessionId(null);
      setObjective(nextObjective);
      clear();
      start(nextObjective);
    },
    [clear, start]
  );

  const headerAside = (
    <div className="flex flex-wrap items-center gap-3">
      <GasMeterPill
        consuming={
          connection === "live" ||
          connection === "connecting" ||
          activeCount > 0
        }
      />
      <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-slate-muted">
        <Server className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        <span>
          Engine{" "}
          <span className="font-mono text-emerald-400">Gemini</span>
        </span>
      </div>
      <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-slate-muted">
        <Activity className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
        <span className="font-mono text-cyan-accent">{overallProgress}%</span>
        workflow
      </div>
    </div>
  );

  const developerConsole = (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-white/5 bg-black/25 px-4 py-3">
        <div
          className="inline-flex flex-wrap rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl p-0.5"
          role="tablist"
          aria-label="Console view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "workforce"}
            onClick={() => setView("workforce")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "workforce"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Workforce
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "marketplace"}
            onClick={() => setView("marketplace")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "marketplace"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <Store className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Marketplace
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "plugins"}
            onClick={() => setView("plugins")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "plugins"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <Plug className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Plugins
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "alerts"}
            onClick={() => setView("alerts")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "alerts"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <BellRing className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Alerts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "audit"}
            onClick={() => setView("audit")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "audit"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Audit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "settings"}
            onClick={() => setView("settings")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "settings"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "teletraffic"}
            onClick={() => setView("teletraffic")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "teletraffic"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <Radio className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Teletraffic
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "chaos"}
            onClick={() => setView("chaos")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "chaos"
                ? "bg-rose-500/15 text-rose-300"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12} glow={false}>
              <Zap className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Chaos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "universe"}
            onClick={() => setView("universe")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "universe"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <Box className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Universe
          </button>
          {isSuperAdmin ? (
            <button
              type="button"
              role="tab"
              aria-selected={consoleView === "sre-control"}
              onClick={() => setView("sre-control")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                consoleView === "sre-control"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-slate-muted hover:text-white"
              }`}
            >
              <Hover3DIcon intensity={12}>
                <Shield className="h-3.5 w-3.5" aria-hidden />
              </Hover3DIcon>
              SRE Control
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "builder"}
            onClick={() => setView("builder")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "builder"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <GitFork className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Builder
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "cli"}
            onClick={() => setView("cli")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "cli"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <Terminal className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            CLI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={consoleView === "catalog"}
            onClick={() => setView("catalog")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              consoleView === "catalog"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <Hover3DIcon intensity={12}>
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
            </Hover3DIcon>
            Catalog
          </button>
          {isSuperAdmin ? (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={consoleView === "inventory"}
                onClick={() => setView("inventory")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  consoleView === "inventory"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-slate-muted hover:text-white"
                }`}
              >
                <Hover3DIcon intensity={12}>
                  <Package className="h-3.5 w-3.5" aria-hidden />
                </Hover3DIcon>
                Inventory
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={consoleView === "sre-health"}
                onClick={() => setView("sre-health")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  consoleView === "sre-health"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-slate-muted hover:text-white"
                }`}
              >
                <Hover3DIcon intensity={12}>
                  <HeartPulse className="h-3.5 w-3.5" aria-hidden />
                </Hover3DIcon>
                SRE Health
              </button>
            </>
          ) : null}
        </div>
        {consoleView === "workforce" ? (
          <>
            <div className="flex items-center gap-2 text-xs text-slate-muted">
              <CircleDot
                className={`h-3.5 w-3.5 ${
                  activeCount > 0
                    ? "animate-pulse text-emerald-400"
                    : "text-slate-500"
                }`}
                aria-hidden
              />
              {selectedSessionId
                ? "Viewing saved swarm from Workspace History"
                : activeCount > 0
                  ? `${activeCount} agent${activeCount === 1 ? "" : "s"} active`
                  : "Swarm standing by — enter an objective and launch"}
            </div>
            <span
              className="hidden h-4 w-px bg-white/10 sm:block"
              aria-hidden
            />
            <span className="text-xs text-slate-dim">
              Events{" "}
              <span className="font-mono text-cyan-accent">{lines.length}</span>
            </span>
          </>
        ) : consoleView === "chaos" ? (
          <span className="text-xs text-slate-dim">
            Admin chaos inject · stress isometric flow nodes
          </span>
        ) : consoleView === "teletraffic" ? (
          <span className="text-xs text-slate-dim">
            Edge latency · KV scratchpad cache · live user stream
          </span>
        ) : consoleView === "plugins" ? (
          <span className="text-xs text-slate-dim">
            Extension leases · invocations · revenue/run · latency
          </span>
        ) : consoleView === "alerts" ? (
          <span className="text-xs text-slate-dim">
            Threshold rules · gas ceilings · live toast dispatch
          </span>
        ) : consoleView === "audit" ? (
          <span className="text-xs text-slate-dim">
            Immutable WORM stream · hashed keys · action targets
          </span>
        ) : consoleView === "settings" ? (
          <span className="text-xs text-slate-dim">
            Feature flags · AI loops · webhook egress · heal budgets
          </span>
        ) : consoleView === "universe" ? (
          <span className="text-xs text-slate-dim">
            Spatial sandbox · FP camera · script upload bridge
          </span>
        ) : consoleView === "sre-control" ? (
          <span className="text-xs text-slate-dim">
            Meta-SRE directives · Discord mobile alerts
          </span>
        ) : consoleView === "catalog" ? (
          <span className="text-xs text-slate-dim">
            Wines · tastings · merch · digital passes · quick-add cart
          </span>
        ) : consoleView === "inventory" ? (
          <span className="text-xs text-slate-dim">
            Inline price editing · stock badges · category tagger · asset upload
          </span>
        ) : consoleView === "sre-health" ? (
          <span className="text-xs text-slate-dim">
            Live latency sparklines · error rates · container statuses
          </span>
        ) : consoleView === "builder" ? (
          <span className="text-xs text-slate-dim">
            Drag-and-drop agent workflows · simulate · deploy blueprints
          </span>
        ) : consoleView === "cli" ? (
          <span className="text-xs text-slate-dim">
            Global CLI install · API keys · deploy simulator
          </span>
        ) : (
          <span className="text-xs text-slate-dim">
            Searchable agent gallery · install nodes onto the workflow canvas
          </span>
        )}
      </div>

      {consoleView === "cli" ? (
        <ErrorBoundary label="Swarm CLI">
          <SwarmCliPanel />
        </ErrorBoundary>
      ) : consoleView === "builder" ? (
        <ErrorBoundary label="Workflow Builder">
          <BlueprintCanvas />
        </ErrorBoundary>
      ) : consoleView === "marketplace" ? (
        <ErrorBoundary label="Agent Marketplace">
          <AgentMarketplace />
        </ErrorBoundary>
      ) : consoleView === "plugins" ? (
        <ErrorBoundary label="Plugin Analytics">
          <PluginAnalytics />
        </ErrorBoundary>
      ) : consoleView === "alerts" ? (
        <ErrorBoundary label="Alert Configuration">
          <AlertConfig />
        </ErrorBoundary>
      ) : consoleView === "audit" ? (
        <ErrorBoundary label="Compliance Audit Log">
          <AuditLog />
        </ErrorBoundary>
      ) : consoleView === "settings" ? (
        <ErrorBoundary label="Workspace Settings">
          <WorkspaceSettings />
        </ErrorBoundary>
      ) : consoleView === "universe" ? (
        <ErrorBoundary label="Spatial Universe">
          <UniverseDeck />
        </ErrorBoundary>
      ) : consoleView === "sre-control" ? (
        <div className="space-y-6">
          <ErrorBoundary label="Meta-SRE Command Deck">
            <MetaSreCommandDeck />
          </ErrorBoundary>
          <ErrorBoundary label="Discord Webhook Config">
            <DiscordWebhookConfig />
          </ErrorBoundary>
        </div>
      ) : consoleView === "catalog" ? (
        <ErrorBoundary label="Items Catalog">
          <ItemsCatalog />
        </ErrorBoundary>
      ) : consoleView === "inventory" ? (
        <ErrorBoundary label="Items Manager">
          <ItemsManager />
        </ErrorBoundary>
      ) : consoleView === "sre-health" ? (
        <ErrorBoundary label="SRE Health Monitor">
          <SreHealthMonitor />
        </ErrorBoundary>
      ) : consoleView === "teletraffic" ? (
        <ErrorBoundary label="Teletraffic Board">
          <TeletrafficBoard />
        </ErrorBoundary>
      ) : consoleView === "chaos" ? (
        <div className="space-y-6">
          <ErrorBoundary label="Telemetry Flow">
            <IsometricFlowMap
              health={flowHealth}
              stressedNodeIds={stressedNodeIds}
            />
          </ErrorBoundary>
          <ErrorBoundary label="Chaos Console">
            <ChaosConsole
              onChaosEvent={handleChaosEvent}
              onHealComplete={handleChaosHealComplete}
            />
          </ErrorBoundary>
        </div>
      ) : (
        <>
          {crashAlert ? (
            <div
              role="alert"
              className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-400/30 border-l-2 border-l-rose-400 bg-white/[0.03] backdrop-blur-xl px-3.5 py-2.5"
            >
              <p className="min-w-0 break-words text-xs font-medium text-amber-200">
                {crashAlert}
              </p>
              <button
                type="button"
                onClick={() => setCrashAlert(null)}
                className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <ErrorBoundary label="Economy Metrics" compact>
            <EconomyMetricsDashboard />
          </ErrorBoundary>

          <ErrorBoundary label="Telemetry Flow">
            <IsometricFlowMap
              health={flowHealth}
              stressedNodeIds={stressedNodeIds}
            />
          </ErrorBoundary>

          <section aria-labelledby="visualizer-heading" className="mb-8">
            <h2 id="visualizer-heading" className="sr-only">
              Agent visualizer cards
            </h2>
            <ErrorBoundary label="Agent Card Stack">
              <AgentCardStack3D
                agents={agents}
                troubleshootActive={troubleshootActive}
              />
            </ErrorBoundary>
            {agents.length > 4 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {agents.slice(4).map((agent) => (
                  <AgentVisualizerCard key={agent.id} agent={agent} />
                ))}
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby="persona-heading"
            className="mb-6 w-full rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl p-3.5 sm:p-4"
          >
            <h2 id="persona-heading" className="sr-only">
              Agent personality templates
            </h2>
            <AgentPersonaSelector
              personaId={personaId}
              onPersonaChange={setPersonaId}
              customSystemPrompt={customSystemPrompt}
              onCustomSystemPromptChange={setCustomSystemPrompt}
              locked={personasLocked}
              isSuperAdmin={isSuperAdmin}
            />
          </section>

          <section
            aria-labelledby="split-heading"
            className="grid w-full items-start gap-4 lg:grid-cols-5 lg:gap-6"
          >
            <h2 id="split-heading" className="sr-only">
              Spawn controls and live terminal
            </h2>

            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setWorkspaceOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] backdrop-blur-xl px-3 py-2.5 text-xs font-semibold text-emerald-400 transition hover:border-emerald-500/30"
                aria-expanded={workspaceOpen}
              >
                <PanelsTopLeft className="h-4 w-4" aria-hidden />
                Open workspace controls
              </button>
            </div>

            {workspaceOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
                aria-label="Close workspace overlay"
                onClick={() => setWorkspaceOpen(false)}
              />
            ) : null}

            <div
              className={`lg:col-span-2 ${
                workspaceOpen
                  ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-white/5 bg-white/[0.03] backdrop-blur-xl p-4 shadow-2xl lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
                  : "hidden lg:block"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
                <p className="font-display text-sm font-semibold text-white">
                  Workspace controls
                </p>
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen(false)}
                  className="rounded-lg border border-white/5 p-1.5 text-slate-muted hover:text-white"
                  aria-label="Close workspace controls"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <AgentSpawnPanel
                objective={objective}
                onObjectiveChange={handleObjectiveChange}
                connection={connection}
                overallProgress={overallProgress}
                onStart={handleStart}
                onStop={handleStop}
                onClear={handleClear}
                mountedPluginIds={mountedPluginIds}
                onMountedPluginIdsChange={setMountedPluginIds}
              />
              <McpManager />
              <ErrorBoundary label="Token Vault" compact>
                <TokenVault />
              </ErrorBoundary>
              <HealerConsole
                onTroubleshootChange={setTroubleshootActive}
                onCrashAlert={setCrashAlert}
              />
            </div>
            <div className="w-full min-w-0 lg:col-span-3">
              <LiveStreamTerminal
                lines={lines}
                results={results}
                connection={connection}
                sessionId={sessionId}
                debateTurns={debateTurns}
                consensusPending={consensusPending}
                debateVote={debateVote}
                recalledMemories={recalledMemories}
                sandboxFrames={sandboxFrames}
                onDebateVoteRegistered={registerDebateVote}
                paymentRequired={paymentRequired}
                onDismissPaymentRequired={dismissPaymentRequired}
                onPause={pause}
                onResume={resume}
                onProceedCheckout={() => {
                  trackFunnelEvent({ event: "checkout_redirect" });
                  router.push("/checkout");
                }}
              />
            </div>
          </section>
        </>
      )}
    </>
  );

  return (
    <div className="relative min-h-full bg-obsidian text-white">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-0 top-0 h-[480px] w-[640px] rounded-full bg-cyan-accent/[0.05] blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[360px] w-[520px] rounded-full bg-slate-500/[0.08] blur-[120px]" />
      </div>

      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-0 py-2 sm:py-4 lg:flex-row lg:gap-4">
        {isDeveloper ? (
          <WorkspaceHistorySidebar
            selectedId={selectedSessionId}
            refreshToken={historyRefreshToken}
            onSelectSession={handleSelectSession}
            onRerun={handleRerun}
          />
        ) : null}

        <div className="min-w-0 w-full flex-1">
          <ModeWrapper
            headerAside={headerAside}
            onLaunchObjective={handleLaunchFromTemplate}
            userContent={
              consoleView === "builder" ? (
                <ErrorBoundary label="Workflow Builder">
                  <BlueprintCanvas />
                </ErrorBoundary>
              ) : consoleView === "marketplace" ? (
                <ErrorBoundary label="Agent Marketplace">
                  <AgentMarketplace />
                </ErrorBoundary>
              ) : undefined
            }
            developerContent={developerConsole}
          />
        </div>
      </div>
    </div>
  );
}
