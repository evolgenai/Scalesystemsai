"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ChevronDown,
  Loader2,
  Sparkles,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import OrchestratorFeed from "@/components/dashboard/OrchestratorFeed";
import NotificationDispatchFeed from "@/components/dashboard/NotificationDispatchFeed";
import Hover3DIcon from "@/components/ui/Hover3DIcon";
import RobotMeshIcon from "@/components/dashboard/RobotMeshIcon";

const AGENT_TOKEN_KEY = "scalesystems.mcp.agentToken";
const PANEL_SPRING = { type: "spring" as const, stiffness: 280, damping: 26, mass: 0.65 };

type HealToolLog = {
  tool: string;
  status: "running" | "success" | "error";
  detail?: string;
};

type HealPatchView = {
  filePath: string;
  summary: string;
  rationale: string;
  unifiedDiff: string;
};

type AppErrorRow = {
  id: string;
  route: string;
  errorMessage: string;
  stackTrace: string | null;
  resolved: boolean;
  patchApplied: string | null;
  explanation: string | null;
  createdAt: string;
};

function agentAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...getClientAuthHeaders(),
  };
  try {
    const token = window.localStorage.getItem(AGENT_TOKEN_KEY)?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers["x-agent-token"] = token;
    }
  } catch {
    /* ignore */
  }
  return headers;
}

function DiffPane({ patch }: { patch: HealPatchView }) {
  const lines = patch.unifiedDiff.split("\n");
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
      <div className="min-w-0 overflow-hidden rounded-lg border border-white/5 bg-black/40">
        <p className="border-b border-white/5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Before · context
        </p>
        <pre className="max-h-36 overflow-auto p-2.5 font-mono text-[10px] leading-relaxed text-rose-300/90 sm:max-h-44">
          {lines
            .filter((l) => l.startsWith("-") && !l.startsWith("---"))
            .join("\n") || "(no removals — additive patch)"}
        </pre>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg border border-white/5 bg-black/40">
        <p className="border-b border-white/5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">
          After · remediation
        </p>
        <pre className="max-h-36 overflow-auto p-2.5 font-mono text-[10px] leading-relaxed text-emerald-300/90 sm:max-h-44">
          {lines
            .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
            .join("\n") || patch.unifiedDiff}
        </pre>
      </div>
    </div>
  );
}

function ToolInvocationFeed({
  logs,
  streaming,
}: {
  logs: HealToolLog[];
  streaming: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs]);

  if (logs.length === 0 && !streaming) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-white/5 bg-[#0a0a0a]">
      <div className="flex items-center gap-2 border-b border-white/5 px-2.5 py-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            streaming ? "animate-pulse bg-amber-400" : "bg-emerald-400"
          }`}
          aria-hidden
        />
        <p className="font-mono text-[10px] text-zinc-500">
          {streaming ? "Executing MCP tools…" : "MCP tool chain complete"}
        </p>
      </div>
      <div className="max-h-28 space-y-0.5 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed">
        {logs.map((log, i) => (
          <p key={`${log.tool}-${i}`} className="break-all">
            <span className="text-zinc-500">[Tool]</span>{" "}
            <span className="text-cyan-accent">{log.tool}</span>
            {log.detail ? (
              <span className="text-zinc-500"> {log.detail}</span>
            ) : null}
            {" … "}
            <span
              className={
                log.status === "success"
                  ? "text-emerald-400"
                  : log.status === "error"
                    ? "text-rose-300"
                    : "animate-pulse text-amber-300"
              }
            >
              [{log.status === "running" ? "Running" : log.status === "success" ? "Success" : "Error"}]
            </span>
          </p>
        ))}
        {streaming && logs.every((l) => l.status !== "running") ? (
          <p className="animate-pulse text-amber-300/80">Awaiting next tool…</p>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}

const MOCK_CRASHES = [
  {
    id: "userlist-map",
    label: "UserList .map crash",
    route: "/dashboard/components/UserList",
    errorMessage:
      "TypeError: Cannot read properties of undefined (reading 'map') in components/UserList.tsx",
    stackTrace: [
      "TypeError: Cannot read properties of undefined (reading 'map')",
      "    at UserList (src/components/UserList.tsx:42:18)",
      "    at renderWithHooks (react-dom)",
      "    at DashboardClient (src/app/dashboard/DashboardClient.tsx)",
    ].join("\n"),
  },
  {
    id: "prisma-unique",
    label: "Prisma unique email",
    route: "/api/auth/register",
    errorMessage:
      "PrismaClientKnownRequestError: Unique constraint failed on the fields: (`email`)",
    stackTrace: [
      "PrismaClientKnownRequestError: Unique constraint failed on the fields: (`email`)",
      "    at $n.handleRequestError (@prisma/client)",
      "    at POST (src/app/api/auth/register/route.ts:88:5)",
    ].join("\n"),
  },
  {
    id: "stream-timeout",
    label: "SSE stream timeout",
    route: "/api/agents/stream",
    errorMessage:
      "AbortError: The operation was aborted due to timeout while awaiting swarm SSE frame",
    stackTrace: [
      "AbortError: The operation was aborted due to timeout",
      "    at AbortSignal (node:internal)",
      "    at consumeSse (src/lib/agents/useAgentStream.ts:412:11)",
    ].join("\n"),
  },
] as const;

const PENDING_TOOL_STEPS: HealToolLog[] = [
  { tool: "mcp.filesystem.read_file", status: "running", detail: "…" },
  { tool: "mcp.filesystem.grep_stack", status: "running", detail: "…" },
  { tool: "heal.generate_unified_diff", status: "running", detail: "…" },
];

type HealerConsoleProps = {
  onTroubleshootChange?: (active: boolean) => void;
  onCrashAlert?: (message: string | null) => void;
};

export default function HealerConsole({
  onTroubleshootChange,
  onCrashAlert,
}: HealerConsoleProps) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<AppErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [healingId, setHealingId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [selectedCrash, setSelectedCrash] = useState<string>(MOCK_CRASHES[0].id);
  const [activePatch, setActivePatch] = useState<HealPatchView | null>(null);
  const [toolLogs, setToolLogs] = useState<HealToolLog[]>([]);
  const [toolsStreaming, setToolsStreaming] = useState(false);
  const [orchComplete, setOrchComplete] = useState(false);
  const [orchFailed, setOrchFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [iconHot, setIconHot] = useState(false);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStepTimer = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const startPendingToolFeed = () => {
    clearStepTimer();
    setToolsStreaming(true);
    setToolLogs([]);
    let i = 0;
    stepTimerRef.current = setInterval(() => {
      if (i >= PENDING_TOOL_STEPS.length) {
        clearStepTimer();
        return;
      }
      const step = PENDING_TOOL_STEPS[i]!;
      setToolLogs((prev) => [...prev, step]);
      i += 1;
    }, 380);
  };

  const loadErrors = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/telemetry/errors?limit=25", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        errors?: AppErrorRow[];
        error?: string;
      };
      if (!response.ok || !payload.success) {
        setErrorMsg(payload.error ?? `Load failed (${response.status})`);
        setErrors([]);
        return;
      }
      setErrors(payload.errors ?? []);
    } catch {
      setErrorMsg("Network error loading telemetry.");
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadErrors();
    return () => clearStepTimer();
  }, [loadErrors]);

  const simulateCrash = async () => {
    const mock = MOCK_CRASHES.find((c) => c.id === selectedCrash) ?? MOCK_CRASHES[0];
    setSimulating(true);
    setErrorMsg(null);
    setOpen(true);

    try {
      const response = await fetch("/api/telemetry/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          route: mock.route,
          errorMessage: mock.errorMessage,
          stackTrace: mock.stackTrace,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string | { id: string };
      };

      if (!response.ok || !payload.success) {
        setErrorMsg(
          typeof payload.error === "string"
            ? payload.error
            : `Simulate failed (${response.status})`
        );
        return;
      }

      onCrashAlert?.(`Simulated crash injected · ${mock.label}`);
      onTroubleshootChange?.(true);
      await loadErrors();
    } catch {
      setErrorMsg("Network error injecting simulated crash.");
    } finally {
      setSimulating(false);
    }
  };

  const initiateHeal = async () => {
    setErrorMsg(null);
    setHealingId("__latest__");
    setActivePatch(null);
    setOrchComplete(false);
    setOrchFailed(false);
    startPendingToolFeed();

    try {
      const response = await fetch("/api/agents/heal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...agentAuthHeaders(),
        },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        healthy?: boolean;
        message?: string;
        error?: string | AppErrorRow;
        proposal?: {
          targetFile: string;
          patch: string;
          explanation: string;
        };
        toolLogs?: HealToolLog[];
        code?: string;
      };

      clearStepTimer();

      if (!response.ok || !payload.success) {
        setToolsStreaming(false);
        setOrchFailed(true);
        setToolLogs((prev) => [
          ...prev.map((l) =>
            l.status === "running" ? { ...l, status: "error" as const } : l
          ),
        ]);
        setErrorMsg(
          typeof payload.error === "string"
            ? payload.error
            : `Heal failed (${response.status})`
        );
        return;
      }

      if (payload.healthy) {
        setToolsStreaming(false);
        setOrchComplete(true);
        setToolLogs([
          {
            tool: "heal.health_check",
            status: "success",
            detail: payload.message ?? "System healthy",
          },
        ]);
        setErrorMsg(payload.message ?? "System healthy.");
        onTroubleshootChange?.(false);
        onCrashAlert?.(null);
        await loadErrors();
        return;
      }

      if (payload.proposal) {
        setActivePatch({
          filePath: payload.proposal.targetFile,
          summary: "Remediation proposed",
          rationale: payload.proposal.explanation,
          unifiedDiff: payload.proposal.patch,
        });
      }

      if (Array.isArray(payload.toolLogs) && payload.toolLogs.length > 0) {
        setToolLogs(payload.toolLogs);
      } else if (payload.proposal) {
        setToolLogs([
          {
            tool: "mcp.filesystem.read_file",
            status: "success",
            detail: payload.proposal.targetFile,
          },
          {
            tool: "heal.generate_unified_diff",
            status: "success",
            detail: "ok",
          },
        ]);
      }

      setToolsStreaming(false);
      setOrchComplete(true);
      onTroubleshootChange?.(false);
      onCrashAlert?.(null);
      await loadErrors();
    } catch {
      clearStepTimer();
      setToolsStreaming(false);
      setOrchFailed(true);
      setErrorMsg("Network error during auto-heal.");
    } finally {
      setHealingId(null);
    }
  };

  const unresolved = errors.length;
  const busy = healingId !== null;

  const statusTone = busy
    ? {
        label: "HEALING",
        className:
          "border-amber-400/40 bg-amber-400/10 text-amber-300 animate-pulse",
      }
    : unresolved > 0
      ? {
          label: `${unresolved} OPEN`,
          className: "border-rose-400/35 bg-rose-500/10 text-rose-300",
        }
      : {
          label: "NOMINAL",
          className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        };

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Hover3DIcon
            intensity={14}
            className="h-11 w-11 sm:h-12 sm:w-12"
            onHoverChange={setIconHot}
          >
            <RobotMeshIcon
              size={48}
              variant="supervisor"
              active={iconHot || busy}
              label="Self-healing console"
              className="rounded-lg border border-white/5 bg-black/30"
            />
          </Hover3DIcon>
          <span className="min-w-0">
            <motion.span
              className="flex flex-wrap items-center gap-2"
              animate={{ y: iconHot ? 6 : 0 }}
              transition={PANEL_SPRING}
            >
              <span className="font-display text-sm font-semibold text-white">
                Self-Healing Console
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${statusTone.className}`}
              >
                <Activity className="h-3 w-3 shrink-0" aria-hidden />
                {statusTone.label}
              </span>
            </motion.span>
            <motion.p
              className="mt-0.5 text-[11px] text-slate-dim"
              animate={{ y: iconHot ? 8 : 0, opacity: iconHot ? 1 : 0.85 }}
              transition={PANEL_SPRING}
            >
              MCP tool chain · unified diff remediation
            </motion.p>
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-dim transition ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="healer-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={PANEL_SPRING}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="space-y-3 px-3.5 pb-3.5 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void initiateHeal()}
              disabled={busy || unresolved === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              )}
              Initiate Auto-Heal
            </button>
            <button
              type="button"
              onClick={() => void loadErrors()}
              disabled={loading}
              className="rounded-lg border border-white/5 px-2.5 py-1.5 text-[11px] text-slate-muted transition hover:text-white disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="space-y-2 rounded-lg border border-white/5 bg-black/30 p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Simulate route crash
            </p>
            <select
              value={selectedCrash}
              onChange={(e) => setSelectedCrash(e.target.value)}
              className="w-full rounded-lg border border-white/5 bg-[#121212] px-2.5 py-2 text-[11px] text-white outline-none focus:border-amber-400/40"
            >
              {MOCK_CRASHES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void simulateCrash()}
              disabled={simulating || busy}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-400/15 disabled:opacity-40"
            >
              {simulating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Inject mock crash
            </button>
          </div>

          {errorMsg ? (
            <p className="break-words text-[11px] text-rose-300">{errorMsg}</p>
          ) : null}

          {activePatch || toolLogs.length > 0 || toolsStreaming || orchComplete || orchFailed ? (
            <div className="min-w-0 space-y-2 overflow-hidden rounded-lg border border-emerald-500/20 bg-black/30 p-2.5">
              <OrchestratorFeed
                running={busy || toolsStreaming}
                complete={orchComplete}
                failed={orchFailed}
              />
              {activePatch ? (
                <>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-emerald-400">
                      {activePatch.summary}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-slate-dim">
                      {activePatch.filePath}
                    </p>
                    {activePatch.rationale ? (
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-muted">
                        {activePatch.rationale}
                      </p>
                    ) : null}
                  </div>
                  <DiffPane patch={activePatch} />
                  <pre className="max-h-28 overflow-auto rounded-lg border border-white/5 bg-[#0a0a0a] p-2 font-mono text-[9px] leading-relaxed text-slate-dim">
                    {activePatch.unifiedDiff}
                  </pre>
                </>
              ) : null}
              <ToolInvocationFeed logs={toolLogs} streaming={toolsStreaming} />
              <NotificationDispatchFeed
                dispatch={orchComplete && Boolean(activePatch)}
                payloadSummary={
                  activePatch
                    ? `Heal approved · ${activePatch.filePath}`
                    : undefined
                }
              />
            </div>
          ) : null}

          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {loading && errors.length === 0 ? (
              <li className="flex items-center justify-center gap-2 py-6 text-[11px] text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                Loading alerts…
              </li>
            ) : errors.length === 0 ? (
              <li className="py-6 text-center text-[11px] text-zinc-500">
                No unresolved system errors.
              </li>
            ) : (
              errors.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-white/5 bg-black/30 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[10px] text-cyan-accent">
                        {row.route}
                      </p>
                      <p className="mt-0.5 break-words text-[11px] text-white">
                        {row.errorMessage}
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300">
                      open
                    </span>
                  </div>

                  {row.stackTrace ? (
                    <pre className="mt-2 max-h-24 overflow-auto rounded-md border border-white/5 bg-[#0a0a0a] p-2 font-mono text-[9px] leading-relaxed text-zinc-500">
                      {row.stackTrace}
                    </pre>
                  ) : null}
                </li>
              ))
            )}
          </ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
