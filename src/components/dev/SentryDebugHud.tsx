"use client";

import { useCallback, useEffect, useId, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  Activity,
  Bug,
  ChevronDown,
  ChevronUp,
  Radio,
  X,
  Zap,
} from "lucide-react";

type HudEvent = {
  id: string;
  at: number;
  kind: "info" | "error" | "stream";
  label: string;
  detail?: string;
};

const MAX_EVENTS = 40;

/**
 * Dev-only floating HUD for injecting agent/stream test errors and inspecting
 * client-side Sentry / telemetry breadcrumbs. Never mounts on the server —
 * gate with `typeof window` + NODE_ENV to avoid React 19 hydration mismatches.
 */
export default function SentryDebugHud() {
  const panelId = useId();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<HudEvent[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const push = useCallback((event: Omit<HudEvent, "id" | "at">) => {
    const entry: HudEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
    };
    setEvents((prev) => [entry, ...prev].slice(0, MAX_EVENTS));
  }, []);

  const captureTestException = () => {
    const err = new Error("[SentryDebugHud] Simulated agent stream failure");
    const eventId = Sentry.captureException(err, {
      tags: { source: "sentry-debug-hud", kind: "agent-stream" },
      contexts: {
        agent: {
          stream: "sse",
          simulated: true,
        },
      },
    });
    push({
      kind: "error",
      label: "Captured test exception",
      detail: eventId ? `event ${eventId}` : undefined,
    });
  };

  const emitBreadcrumb = () => {
    Sentry.addBreadcrumb({
      category: "agent.stream",
      message: "Debug HUD heartbeat",
      level: "info",
      data: { ts: Date.now() },
    });
    push({ kind: "info", label: "Breadcrumb: agent.stream heartbeat" });
  };

  const simulateSseStall = () => {
    Sentry.captureMessage("[SentryDebugHud] SSE stall simulated", {
      level: "warning",
      tags: { source: "sentry-debug-hud", kind: "sse-stall" },
      extra: { reconnectSuggested: true },
    });
    push({
      kind: "stream",
      label: "SSE stall simulated",
      detail: "warning message → Sentry",
    });
  };

  // Hydration-safe: render nothing until client mount.
  if (!mounted) return null;
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
      {open ? (
        <div
          id={panelId}
          className="pointer-events-auto w-[min(100vw-2rem,340px)] overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#07110d]/95 shadow-2xl shadow-black/50 backdrop-blur-md"
          role="region"
          aria-label="Sentry debug HUD"
        >
          <header className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-400">
              <Bug className="h-3.5 w-3.5" aria-hidden />
              Sentry Debug HUD
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:text-white"
              aria-label="Close debug HUD"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          <div className="flex flex-wrap gap-1.5 p-3">
            <button
              type="button"
              onClick={captureTestException}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20"
            >
              <Zap className="h-3 w-3" aria-hidden />
              Stream error
            </button>
            <button
              type="button"
              onClick={simulateSseStall}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20"
            >
              <Radio className="h-3 w-3" aria-hidden />
              SSE stall
            </button>
            <button
              type="button"
              onClick={emitBreadcrumb}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20"
            >
              <Activity className="h-3 w-3" aria-hidden />
              Breadcrumb
            </button>
            <button
              type="button"
              onClick={() => setEvents([])}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-white"
            >
              Clear
            </button>
          </div>

          <ul className="max-h-48 space-y-1.5 overflow-y-auto border-t border-white/5 px-3 py-2.5">
            {events.length === 0 ? (
              <li className="py-4 text-center text-[11px] text-slate-500">
                No telemetry events yet
              </li>
            ) : (
              events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-lg border border-white/5 bg-black/25 px-2.5 py-1.5"
                >
                  <p className="text-[11px] font-medium text-slate-200">
                    {ev.label}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-500">
                    {new Date(ev.at).toLocaleTimeString()}
                    {ev.detail ? ` · ${ev.detail}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/90 px-3 py-2 text-[11px] font-semibold text-emerald-300 shadow-lg shadow-black/40 backdrop-blur transition hover:border-emerald-400/60 hover:bg-emerald-900/90"
      >
        <Bug className="h-3.5 w-3.5" aria-hidden />
        Sentry
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
        ) : (
          <ChevronUp className="h-3 w-3 opacity-70" aria-hidden />
        )}
      </button>
    </div>
  );
}
