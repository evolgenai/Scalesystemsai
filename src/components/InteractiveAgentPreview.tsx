"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, CheckCircle2, Loader2 } from "lucide-react";

type StepStatus = "pending" | "running" | "complete";

type AgentStep = {
  id: string;
  label: string;
  status: StepStatus;
};

const STEP_LABELS = [
  "Initializing background systems",
  "Analyzing incoming leads",
  "Automating CRM entry",
  "Workflow complete — reporting to dashboard",
];

function createSteps(): AgentStep[] {
  return STEP_LABELS.map((label, index) => ({
    id: String(index + 1),
    label,
    status: "pending" as StepStatus,
  }));
}

export default function InteractiveAgentPreview() {
  const [cycle, setCycle] = useState(0);
  const [steps, setSteps] = useState<AgentStep[]>(createSteps);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setSteps(createSteps());
    setActiveIndex(0);
  }, [cycle]);

  useEffect(() => {
    if (activeIndex >= steps.length) return;

    setSteps((prev) =>
      prev.map((step, index) =>
        index === activeIndex ? { ...step, status: "running" } : step
      )
    );

    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const completeTimer = setTimeout(() => {
      setSteps((prev) =>
        prev.map((step, index) =>
          index === activeIndex ? { ...step, status: "complete" } : step
        )
      );

      if (activeIndex >= steps.length - 1) {
        resetTimer = setTimeout(() => setCycle((c) => c + 1), 2000);
      } else {
        setActiveIndex((i) => i + 1);
      }
    }, 1400);

    return () => {
      clearTimeout(completeTimer);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [activeIndex, cycle, steps.length]);

  return (
    <div className="glass overflow-hidden rounded-2xl shadow-glow">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <Terminal className="h-4 w-4 text-cyan-accent" aria-hidden />
        <span className="font-mono text-xs text-slate-muted">
          [ScaleSystems-Agent-01]
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          <span className="text-xs text-blue-400">Live</span>
        </span>
      </div>

      <div className="space-y-3 p-4 font-mono text-sm sm:p-6">
        <AnimatePresence mode="popLayout">
          {steps.map((step, index) => (
            <motion.div
              key={`${cycle}-${step.id}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-start gap-3"
            >
              {step.status === "complete" ? (
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-blue-400"
                  aria-hidden
                />
              ) : step.status === "running" ? (
                <Loader2
                  className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-accent"
                  aria-hidden
                />
              ) : (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-dim" />
              )}
              <span
                className={
                  step.status === "complete"
                    ? "text-slate-dim line-through"
                    : step.status === "running"
                      ? "text-cyan-accent"
                      : "text-slate-dim"
                }
              >
                {step.label}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-white/10 bg-black/30 px-4 py-2 font-mono text-xs text-slate-dim sm:px-6">
        Tasks automated today:{" "}
        <span className="text-cyan-accent">1,247</span> · Uptime:{" "}
        <span className="text-blue-400">99.97%</span>
      </div>
    </div>
  );
}
