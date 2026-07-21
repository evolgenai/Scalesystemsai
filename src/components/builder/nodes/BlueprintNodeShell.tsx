"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Check, type LucideIcon, RefreshCw, ShieldAlert } from "lucide-react";
import type { BlueprintNodeData } from "@/components/builder/types";

const KIND_ACCENT: Record<
  BlueprintNodeData["kind"],
  { ring: string; glow: string; badge: string; iconBg: string }
> = {
  trigger: {
    ring: "border-cyan-accent/40",
    glow: "shadow-[0_0_28px_rgba(0,242,254,0.18)]",
    badge: "text-cyan-accent bg-cyan-accent/10 border-cyan-accent/25",
    iconBg: "bg-cyan-accent/15 text-cyan-accent",
  },
  agent: {
    ring: "border-blue-500/40",
    glow: "shadow-[0_0_28px_rgba(0, 102, 255,0.22)]",
    badge: "text-blue-400 bg-blue-500/10 border-blue-500/25",
    iconBg: "bg-blue-500/15 text-blue-400",
  },
  action: {
    ring: "border-amber-400/40",
    glow: "shadow-[0_0_28px_rgba(245,158,11,0.18)]",
    badge: "text-amber-300 bg-amber-500/10 border-amber-400/25",
    iconBg: "bg-amber-500/15 text-amber-300",
  },
};

const STATUS_SHELL: Record<
  NonNullable<BlueprintNodeData["status"]>,
  string
> = {
  idle: "",
  running:
    "blueprint-node-running border-blue-400/70 shadow-[0_0_32px_rgba(59, 130, 246,0.45),0_0_16px_rgba(34,211,238,0.25)] ring-2 ring-cyan-accent/40",
  paused:
    "border-amber-400/80 shadow-[0_0_28px_rgba(245,158,11,0.4)] ring-2 ring-amber-400/50",
  done: "border-blue-500/60 shadow-[0_0_22px_rgba(0, 102, 255,0.35)]",
  error:
    "border-rose-500/80 shadow-[0_0_28px_rgba(244,63,94,0.45)] ring-2 ring-rose-500/40",
};

const STATUS_DOT: Record<NonNullable<BlueprintNodeData["status"]>, string> = {
  idle: "bg-slate-500",
  running:
    "animate-pulse bg-blue-400 shadow-[0_0_10px_rgba(59, 130, 246,0.8)]",
  paused: "animate-pulse bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)]",
  done: "bg-blue-600 shadow-[0_0_8px_rgba(0, 102, 255,0.7)]",
  error: "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.7)]",
};

type ShellProps = NodeProps & {
  data: BlueprintNodeData;
  icon: LucideIcon;
  kindLabel: string;
};

export default function BlueprintNodeShell({
  data,
  icon: Icon,
  kindLabel,
  selected,
}: ShellProps) {
  const accent = KIND_ACCENT[data.kind];
  const status = data.status ?? "idle";
  const showTarget = data.kind !== "trigger";
  const showSource = data.kind !== "action";

  return (
    <div
      className={`relative min-w-[200px] max-w-[240px] rounded-xl border bg-[#0c0c0f]/92 backdrop-blur-xl transition ${accent.ring} ${
        selected && status === "idle" ? accent.glow : ""
      } ${STATUS_SHELL[status]}`}
    >
      {status === "running" ? (
        <span
          className="blueprint-activity-ring pointer-events-none absolute inset-[-3px] rounded-[14px]"
          aria-hidden
        />
      ) : null}

      {status === "done" ? (
        <span
          className="absolute -right-2 -top-2 z-[1] flex h-6 w-6 items-center justify-center rounded-full border border-blue-400/50 bg-blue-600 text-white shadow-[0_0_14px_rgba(0, 102, 255,0.85)]"
          aria-label="Completed"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </span>
      ) : null}

      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-0 !bg-blue-400 !shadow-[0_0_8px_rgba(59, 130, 246,0.9)]"
        />
      ) : null}
      {showSource ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-0 !bg-blue-400 !shadow-[0_0_8px_rgba(59, 130, 246,0.9)]"
        />
      ) : null}

      <div className="flex items-start gap-3 p-3.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent.iconBg}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${accent.badge}`}
            >
              {kindLabel}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`}
              aria-label={`Status ${status}`}
            />
          </div>
          <p className="truncate text-sm font-semibold text-white">
            {data.label}
          </p>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-muted">
            {data.description}
          </p>
        </div>
      </div>

      {status === "paused" ? (
        <div className="border-t border-amber-400/25 bg-amber-500/[0.08] px-3 py-2">
          <p className="mb-1.5 text-[10px] font-medium text-amber-200/90">
            Human-in-the-loop · awaiting approval
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onApprove?.();
            }}
            className="nodrag nopan inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-400/45 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-500/25"
          >
            <ShieldAlert className="h-3 w-3" aria-hidden />
            Approve Action
          </button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="border-t border-rose-500/30 bg-rose-500/[0.08] px-3 py-2">
          <p className="mb-1.5 text-[10px] font-medium text-rose-200/90">
            Node failed · heal required
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onRetry?.();
            }}
            className="nodrag nopan inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-400/45 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/25"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Retry / Meta-SRE Heal
          </button>
        </div>
      ) : null}
    </div>
  );
}
