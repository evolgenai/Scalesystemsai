"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Wrench,
} from "lucide-react";
import type { StreamConnectionState } from "@/lib/agents/useAgentStream";
import { getActiveOrgId } from "@/lib/org/activeOrg";
import type { WorkspacePlugin } from "@/lib/plugins/types";
import {
  listActiveWorkspacePlugins,
  PLUGINS_CHANGED_EVENT,
} from "@/lib/plugins/workspacePluginsStore";

type AgentSpawnPanelProps = {
  objective: string;
  onObjectiveChange: (value: string) => void;
  connection: StreamConnectionState;
  overallProgress: number;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  /** Plugin IDs the swarm session is permitted to call. */
  mountedPluginIds: string[];
  onMountedPluginIdsChange: (ids: string[]) => void;
};

const CONNECTION_LABEL: Record<StreamConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  live: "Live",
  paused: "Paused",
  error: "Error",
  closed: "Closed",
};

export default function AgentSpawnPanel({
  objective,
  onObjectiveChange,
  connection,
  overallProgress,
  onStart,
  onStop,
  onClear,
  mountedPluginIds,
  onMountedPluginIdsChange,
}: AgentSpawnPanelProps) {
  const [toolsOpen, setToolsOpen] = useState(true);
  const [activePlugins, setActivePlugins] = useState<WorkspacePlugin[]>([]);

  useEffect(() => {
    const reload = () => {
      setActivePlugins(listActiveWorkspacePlugins(getActiveOrgId()));
    };
    reload();

    if (typeof window === "undefined") return;

    const onChanged = () => reload();
    window.addEventListener(PLUGINS_CHANGED_EVENT, onChanged);
    window.addEventListener("scalesystems:org-changed", onChanged);
    return () => {
      window.removeEventListener(PLUGINS_CHANGED_EVENT, onChanged);
      window.removeEventListener("scalesystems:org-changed", onChanged);
    };
  }, []);

  // Drop mounts that are no longer active/registered.
  useEffect(() => {
    const allowed = new Set(activePlugins.map((p) => p.id));
    const filtered = mountedPluginIds.filter((id) => allowed.has(id));
    const unchanged =
      filtered.length === mountedPluginIds.length &&
      filtered.every((id, index) => id === mountedPluginIds[index]);
    if (!unchanged) {
      onMountedPluginIdsChange(filtered);
    }
  }, [activePlugins, mountedPluginIds, onMountedPluginIdsChange]);

  const isBusy =
    connection === "live" ||
    connection === "connecting" ||
    connection === "paused";

  const toggleMount = (pluginId: string, checked: boolean) => {
    if (checked) {
      if (mountedPluginIds.includes(pluginId)) return;
      onMountedPluginIdsChange([...mountedPluginIds, pluginId]);
      return;
    }
    onMountedPluginIdsChange(mountedPluginIds.filter((id) => id !== pluginId));
  };

  return (
    <section className="flex min-h-[500px] max-h-[720px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 backdrop-blur-md">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
        <SlidersHorizontal className="h-4 w-4 text-cyan-accent" aria-hidden />
        <h2 className="font-display text-sm font-semibold text-white">
          Swarm Parameters
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div>
          <label
            htmlFor="swarm-objective"
            className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-dim"
          >
            Objective
          </label>
          <textarea
            id="swarm-objective"
            value={objective}
            onChange={(e) => onObjectiveChange(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-slate-200 outline-none transition-all duration-500 ease-out placeholder:text-slate-600 focus:border-cyan-accent/40 focus:ring-1 focus:ring-cyan-accent/20"
            placeholder="Describe the workforce objective…"
          />
        </div>

        {/* Workspace Tools — mount active OpenAPI plugins for this swarm */}
        <div className="rounded-xl border border-white/10 bg-black/30">
          <button
            type="button"
            onClick={() => setToolsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
            aria-expanded={toolsOpen}
          >
            <span className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
                Workspace Tools
              </span>
              {activePlugins.length > 0 ? (
                <span className="rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-accent">
                  {mountedPluginIds.length}/{activePlugins.length}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-dim transition-transform ${
                toolsOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>

          {toolsOpen ? (
            <div className="border-t border-white/5 px-3 pb-3 pt-2">
              {activePlugins.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-slate-dim">
                  No active plugins.{" "}
                  <Link
                    href="/settings#plugins"
                    className="text-cyan-accent hover:underline"
                  >
                    Manage workspace plugins
                  </Link>{" "}
                  to upload OpenAPI specs.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activePlugins.map((plugin) => {
                    const checked = mountedPluginIds.includes(plugin.id);
                    const inputId = `mount-plugin-${plugin.id}`;
                    return (
                      <li key={plugin.id}>
                        <label
                          htmlFor={inputId}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent px-1 py-1 transition-colors hover:border-white/5 hover:bg-white/[0.02]"
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              toggleMount(plugin.id, e.target.checked)
                            }
                            className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-cyan-accent focus:ring-cyan-accent/30"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-slate-200">
                              {plugin.name}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-dim">
                              {plugin.baseUrl}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wider text-slate-dim">
              Workflow progress
            </span>
            <span className="font-mono text-cyan-accent">
              {Math.round(overallProgress)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-accent to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-dim">
            Stream status
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-white">
            <span
              className={`h-2 w-2 rounded-full ${
                connection === "live"
                  ? "animate-pulse bg-emerald-400"
                  : connection === "paused"
                    ? "animate-pulse bg-amber-400"
                    : connection === "error"
                      ? "bg-rose-400"
                      : connection === "connecting"
                        ? "animate-pulse bg-amber-400"
                        : "bg-slate-500"
              }`}
              aria-hidden
            />
            {CONNECTION_LABEL[connection]}
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-dim">
            GET /api/agents/stream?objective=&personaId=…
          </p>
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={isBusy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-3 py-2.5 text-xs font-semibold text-cyan-accent transition-all duration-500 ease-out hover:bg-cyan-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Launch swarm
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={!isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-muted transition-all duration-500 ease-out hover:border-rose-400/30 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
            Stop
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-muted transition-all duration-500 ease-out hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
