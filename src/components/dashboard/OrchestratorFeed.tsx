"use client";

import { useEffect, useState } from "react";

export type OrchestratorAgentStatus = "pending" | "active" | "done" | "error";

export type OrchestratorStep = {
  id: string;
  emoji: string;
  name: string;
  detail: string;
  status: OrchestratorAgentStatus;
};

const PLAN: Omit<OrchestratorStep, "status">[] = [
  {
    id: "sre",
    emoji: "👁️",
    name: "SRE Supervisor Agent",
    detail: "Analyzing error vector…",
  },
  {
    id: "writer",
    emoji: "📝",
    name: "Code Writer Agent",
    detail: "Drafting filesystem patch…",
  },
  {
    id: "validator",
    emoji: "🧪",
    name: "Validation Agent",
    detail: "Verifying schema compliance…",
  },
];

function statusLabel(status: OrchestratorAgentStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "done":
      return "Done";
    case "error":
      return "Error";
    default:
      return "Pending";
  }
}

function StatusRing({ status }: { status: OrchestratorAgentStatus }) {
  const ring =
    status === "active"
      ? "border-emerald-400 animate-pulse"
      : status === "done"
        ? "border-emerald-400/70"
        : status === "error"
          ? "border-rose-400"
          : "border-zinc-600";
  const fill =
    status === "active"
      ? "bg-emerald-400"
      : status === "done"
        ? "bg-emerald-400/80"
        : status === "error"
          ? "bg-rose-400"
          : "bg-zinc-600";

  return (
    <span
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${ring}`}
      aria-hidden
    >
      <span className={`h-2 w-2 rounded-full ${fill}`} />
    </span>
  );
}

type OrchestratorFeedProps = {
  /** When true, advance steps through active → done. */
  running: boolean;
  /** When heal finished successfully, mark all done. */
  complete?: boolean;
  failed?: boolean;
};

export default function OrchestratorFeed({
  running,
  complete = false,
  failed = false,
}: OrchestratorFeedProps) {
  const [steps, setSteps] = useState<OrchestratorStep[]>(() =>
    PLAN.map((s) => ({ ...s, status: "pending" as const }))
  );

  useEffect(() => {
    if (failed) {
      setSteps((prev) =>
        prev.map((s, i) =>
          s.status === "active" || (s.status === "pending" && i === 0)
            ? { ...s, status: "error" }
            : s.status === "active"
              ? { ...s, status: "error" }
              : s
        )
      );
      return;
    }

    if (complete) {
      setSteps(PLAN.map((s) => ({ ...s, status: "done" as const })));
      return;
    }

    if (!running) {
      setSteps(PLAN.map((s) => ({ ...s, status: "pending" as const })));
      return;
    }

    setSteps(
      PLAN.map((s, i) => ({
        ...s,
        status: i === 0 ? "active" : "pending",
      }))
    );

    let idx = 0;
    const id = window.setInterval(() => {
      idx += 1;
      if (idx >= PLAN.length) {
        window.clearInterval(id);
        setSteps(PLAN.map((s) => ({ ...s, status: "done" as const })));
        return;
      }
      setSteps(
        PLAN.map((s, i) => ({
          ...s,
          status: i < idx ? "done" : i === idx ? "active" : "pending",
        }))
      );
    }, 900);

    return () => window.clearInterval(id);
  }, [running, complete, failed]);

  if (!running && !complete && !failed) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-white/5 bg-[#0a0a0a]">
      <div className="border-b border-white/5 px-2.5 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Orchestration plan
        </p>
      </div>
      <ol className="space-y-0 p-2">
        {steps.map((step, index) => (
          <li key={step.id} className="relative flex gap-2.5 px-1 py-2">
            {index < steps.length - 1 ? (
              <span
                className={`absolute left-[1.125rem] top-9 h-[calc(100%-0.75rem)] w-px ${
                  step.status === "done" ? "bg-emerald-400/40" : "bg-white/10"
                }`}
                aria-hidden
              />
            ) : null}
            <StatusRing status={step.status} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-[11px] font-semibold text-white">
                  <span aria-hidden>{step.emoji} </span>
                  [{step.name}]
                </p>
                <span
                  className={`text-[9px] font-medium uppercase tracking-wide ${
                    step.status === "active"
                      ? "text-emerald-400"
                      : step.status === "done"
                        ? "text-emerald-400/70"
                        : step.status === "error"
                          ? "text-rose-300"
                          : "text-zinc-500"
                  }`}
                >
                  ({statusLabel(step.status)})
                </span>
              </div>
              <p
                className={`mt-0.5 text-[10px] ${
                  step.status === "active"
                    ? "animate-pulse text-slate-muted"
                    : "text-zinc-500"
                }`}
              >
                → {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
