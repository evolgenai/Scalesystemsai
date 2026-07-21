"use client";

import { useState } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import {
  PALETTE_ITEMS,
  WORKFLOW_TEMPLATES,
} from "@/components/builder/templates";
import type {
  BlueprintNodeKind,
  PaletteItem,
  WorkflowTemplate,
} from "@/components/builder/types";

const KIND_META: Record<
  BlueprintNodeKind,
  { label: string; color: string }
> = {
  trigger: { label: "Triggers", color: "text-cyan-accent" },
  agent: { label: "Agents", color: "text-emerald-400" },
  action: { label: "Actions", color: "text-amber-300" },
};

type NodePaletteProps = {
  open: boolean;
  onApplyTemplate: (template: WorkflowTemplate) => void;
  selectedParams: Record<string, string> | null;
  onParamChange: (key: string, value: string) => void;
};

function PaletteCard({
  item,
  Icon,
}: {
  item: PaletteItem;
  Icon: LucideIcon;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/blueprint-node",
          JSON.stringify(item.id)
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group cursor-grab rounded-xl border border-white/5 bg-white/[0.03] p-3 backdrop-blur-xl transition hover:border-emerald-500/35 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-emerald-400">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">{item.label}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-dim">
            {item.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NodePalette({
  open,
  onApplyTemplate,
  selectedParams,
  onParamChange,
}: NodePaletteProps) {
  const [tab, setTab] = useState<"nodes" | "templates">("nodes");

  const grouped = (["trigger", "agent", "action"] as const).map((kind) => ({
    kind,
    items: PALETTE_ITEMS.filter((p) => p.kind === kind),
  }));

  return (
    <aside
      className={`absolute inset-y-0 left-0 z-10 flex w-[min(18.5rem,88vw)] flex-col border-r border-white/5 bg-[#040907]/95 backdrop-blur-xl transition-transform duration-300 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      aria-label="Node palette"
      aria-hidden={!open}
    >
      <div className="border-b border-white/5 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
          Blueprint drawer
        </p>
        <p className="mt-1 text-sm font-semibold text-white">
          Nodes & templates
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-white/5 bg-white/[0.03] p-0.5">
          <button
            type="button"
            onClick={() => setTab("nodes")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              tab === "nodes"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            Nodes
          </button>
          <button
            type="button"
            onClick={() => setTab("templates")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              tab === "templates"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-slate-muted hover:text-white"
            }`}
          >
            Templates
          </button>
        </div>
      </div>

      <div className="terminal-scroll flex-1 space-y-4 overflow-y-auto p-3">
        {tab === "nodes" ? (
          grouped.map(({ kind, items }) => (
            <section key={kind} className="space-y-2">
              <h3
                className={`text-[10px] font-semibold uppercase tracking-wider ${KIND_META[kind].color}`}
              >
                {KIND_META[kind].label}
              </h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <PaletteCard key={item.id} item={item} Icon={item.icon} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <section className="space-y-2">
            <h3 className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-3 w-3" aria-hidden />
              Preset pipelines
            </h3>
            {WORKFLOW_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onApplyTemplate(tpl)}
                className="w-full rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-emerald-500/35"
              >
                <p className="text-xs font-semibold text-white">{tpl.name}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-dim">
                  {tpl.blurb}
                </p>
              </button>
            ))}
          </section>
        )}

        {selectedParams && Object.keys(selectedParams).length > 0 ? (
          <section className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              Quick parameters
            </h3>
            {Object.entries(selectedParams).map(([key, value]) => (
              <label key={key} className="block space-y-1">
                <span className="font-mono text-[10px] text-slate-dim">
                  {key}
                </span>
                <input
                  value={value}
                  onChange={(e) => onParamChange(key, e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500/40"
                />
              </label>
            ))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
