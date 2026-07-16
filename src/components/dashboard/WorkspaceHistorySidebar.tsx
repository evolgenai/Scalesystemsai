"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import type { SwarmSessionDto } from "@/lib/agents/swarmSessionTypes";
import type { AgentStreamEvent } from "@/lib/agents/streamProtocol";
import {
  extractResultItem,
  type StreamResultItem,
} from "@/lib/agents/useAgentStream";

type WorkspaceHistorySidebarProps = {
  onSelectSession: (session: {
    id: string;
    objective: string;
    lines: AgentStreamEvent[];
    results: StreamResultItem[];
  }) => void;
  onRerun: (objective: string) => void;
  selectedId?: string | null;
  refreshToken?: number;
};

function parseKernelLogs(raw: string): AgentStreamEvent[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AgentStreamEvent =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as AgentStreamEvent).message === "string" &&
            typeof (item as AgentStreamEvent).timestamp === "string"
        )
    );
  } catch {
    return [];
  }
}

function resultsFromSession(session: SwarmSessionDto): StreamResultItem[] {
  const lines = parseKernelLogs(session.kernelLogs);
  const extracted: StreamResultItem[] = [];
  lines.forEach((event, index) => {
    const item = extractResultItem(event, index);
    if (item) extracted.push(item);
  });

  if (extracted.length > 0) return extracted.slice(-40);

  if (session.resultMarkdown.trim()) {
    return [
      {
        id: `${session.id}-markdown`,
        markdown: session.resultMarkdown,
      },
    ];
  }

  return [];
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function WorkspaceHistorySidebar({
  onSelectSession,
  onRerun,
  selectedId = null,
  refreshToken = 0,
}: WorkspaceHistorySidebarProps) {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SwarmSessionDto[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (!mq.matches) setOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setSessions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/sessions", {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        sessions?: SwarmSessionDto[];
        error?: string;
      };
      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Unable to load history.");
        setSessions([]);
        return;
      }
      setSessions(payload.sessions ?? []);
    } catch {
      setError("Network error loading history.");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load, refreshToken]);

  useEffect(() => {
    const onOrgChanged = () => {
      void load();
    };
    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    return () =>
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
  }, [load]);

  const panelOpen = desktopOpen;

  const historyBody = (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {!ready || loading ? (
        <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-slate-dim">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
          Loading…
        </div>
      ) : !user ? (
        <p className="px-3 py-6 text-center text-xs leading-relaxed text-slate-dim">
          Sign in to sync and replay past swarm executions.
        </p>
      ) : error ? (
        <p className="px-3 py-6 text-center text-xs text-rose-300">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs leading-relaxed text-slate-dim">
          No saved runs yet. Launch a swarm — successful sessions appear here
          automatically.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => {
            const active = session.id === selectedId;
            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => {
                    const lines = parseKernelLogs(session.kernelLogs);
                    onSelectSession({
                      id: session.id,
                      objective: session.objective,
                      lines,
                      results: resultsFromSession(session),
                    });
                    setOpen(false);
                  }}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-white/5 bg-white/[0.02] hover:border-emerald-500/25"
                  }`}
                >
                  <p className="line-clamp-2 break-words text-xs font-medium text-slate-100">
                    {session.objective}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-slate-dim">
                      {session.status}
                    </span>
                    <span className="text-[10px] text-slate-dim">
                      {formatWhen(session.createdAt)}
                    </span>
                  </div>
                </button>
                {active ? (
                  <button
                    type="button"
                    onClick={() => onRerun(session.objective)}
                    className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                  >
                    <Play className="h-3 w-3" aria-hidden />
                    Re-run Agent
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile / tablet: trigger + overlay drawer (no in-flow width) */}
      <div className="mb-3 flex w-full lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-[#121212] px-3 py-2 text-xs font-medium text-emerald-400 transition hover:border-emerald-500/30"
          aria-expanded={open}
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          Workspace history
        </button>
      </div>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            aria-label="Close history overlay"
            onClick={() => setOpen(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,92vw)] flex-col border-r border-white/5 bg-[#121212] shadow-2xl lg:hidden"
            aria-label="Workspace history"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <History className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <p className="truncate font-display text-xs font-semibold text-white">
                  Workspace History
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-lg border border-white/5 p-1.5 text-slate-muted transition hover:text-emerald-400"
                  aria-label="Refresh history"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/5 p-1.5 text-slate-muted transition hover:text-white"
                  aria-label="Close history"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
            {historyBody}
          </aside>
        </>
      ) : null}

      {/* Desktop: collapsible in-flow rail */}
      <aside
        className={`relative hidden shrink-0 transition-[width] duration-300 lg:block ${
          panelOpen ? "w-72" : "w-12"
        }`}
        aria-label="Workspace history"
      >
        <div className="flex h-full min-h-[500px] flex-col overflow-hidden rounded-lg border border-white/5 bg-[#121212]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-3">
            {panelOpen ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <History
                    className="h-4 w-4 shrink-0 text-emerald-400"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display text-xs font-semibold text-white">
                      Workspace History
                    </p>
                    <p className="truncate text-[10px] text-slate-dim">
                      Persistent swarm memory
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-lg border border-white/5 p-1.5 text-slate-muted transition hover:text-emerald-400"
                    aria-label="Refresh history"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesktopOpen(false)}
                    className="rounded-lg border border-white/5 p-1.5 text-slate-muted transition hover:text-emerald-400"
                    aria-label="Collapse history"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDesktopOpen(true)}
                className="mx-auto flex flex-col items-center gap-2 py-1 text-emerald-400"
                aria-label="Expand history"
              >
                <History className="h-4 w-4" aria-hidden />
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          {panelOpen ? historyBody : null}
        </div>
      </aside>
    </>
  );
}
