"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Loader2, MessageSquare, Send, Wrench } from "lucide-react";
import type { EngineTelemetryStatus } from "@/lib/agents/orchestratorEvents";

type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
};

type ActivityIndicator =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "executing"; toolName: string }
  | { kind: "memory" };

type AgentInteractiveChatProps = {
  engineStatus: EngineTelemetryStatus;
  onEngineStatusChange: (status: EngineTelemetryStatus) => void;
  quotaExhausted: boolean;
  telemetryEvents: string[];
};

function deriveActivity(
  engineStatus: EngineTelemetryStatus,
  latestTelemetry: string | undefined
): ActivityIndicator {
  if (engineStatus === "PLANNING") {
    return { kind: "thinking" };
  }

  if (engineStatus === "EXECUTING" && latestTelemetry) {
    const toolMatch = latestTelemetry.match(
      /Executing tool:\s*(\w+)|Tool pipeline invoked — (\w+)/i
    );
    const toolName = toolMatch?.[1] ?? toolMatch?.[2];
    if (toolName) {
      return { kind: "executing", toolName };
    }
    return { kind: "executing", toolName: "system" };
  }

  if (
    engineStatus === "REFLECTING" ||
    (latestTelemetry &&
      /memory|memoryBank|long-term memory/i.test(latestTelemetry))
  ) {
    return { kind: "memory" };
  }

  return { kind: "idle" };
}

export default function AgentInteractiveChat({
  engineStatus,
  onEngineStatusChange,
  quotaExhausted,
  telemetryEvents,
}: AgentInteractiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "Conscious interface online. Submit an objective to dispatch the orchestrator execution cycle.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const streamCursorRef = useRef(0);
  const streamInitializedRef = useRef(false);

  const latestTelemetry = telemetryEvents[telemetryEvents.length - 1];
  const activity = deriveActivity(engineStatus, latestTelemetry);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, activity]);

  useEffect(() => {
    if (!streamInitializedRef.current) {
      streamInitializedRef.current = true;
      streamCursorRef.current = telemetryEvents.length;
      return;
    }

    if (telemetryEvents.length <= streamCursorRef.current) return;

    const fresh = telemetryEvents.slice(streamCursorRef.current);
    streamCursorRef.current = telemetryEvents.length;

    const agentLines = fresh.filter(
      (line) =>
        !line.includes("Autonomous agent loop dispatched") &&
        !line.includes("SSE telemetry bus connected") &&
        !line.includes("Stream reconnecting")
    );

    if (agentLines.length === 0) return;

    setMessages((prev) => [
      ...prev,
      ...agentLines.map((line, index) => ({
        id: `agent-${Date.now()}-${index}`,
        role: "agent" as const,
        content: line,
      })),
    ]);
  }, [telemetryEvents]);

  const handleSend = async () => {
    const objective = input.trim();
    if (!objective || isSending) return;

    if (quotaExhausted) {
      setError("Quota exhaustion active — cannot dispatch orchestrator cycle.");
      return;
    }

    setError(null);
    setIsSending(true);

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: objective },
    ]);
    setInput("");
    onEngineStatusChange("PLANNING");

    try {
      const response = await fetch("/api/v1/agents/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        engineStatus?: EngineTelemetryStatus;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to dispatch orchestrator cycle.");
      }

      onEngineStatusChange(payload.engineStatus ?? "PLANNING");
    } catch (sendError) {
      onEngineStatusChange("IDLE");
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Dispatch request failed."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Agent Interactive Workspace
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Conscious interface for objective dispatch and live orchestration
            telemetry
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0B0C0E]/80 px-3 py-1.5 text-xs text-slate-muted backdrop-blur-xl">
          <MessageSquare className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
          Interactive console
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#0B0C0E]/80 shadow-[0_0_30px_rgba(0,242,254,0.03)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <span className="font-mono text-xs text-slate-muted">
            agent-conscious-interface
          </span>
          <ActivityBadge activity={activity} isSending={isSending} />
        </div>

        <div
          ref={feedRef}
          className="h-72 space-y-3 overflow-y-auto px-5 py-4 sm:h-80"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-xl border px-4 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "border-cyan-accent/30 bg-cyan-accent/10 text-cyan-50"
                    : message.role === "system"
                      ? "border-white/5 bg-white/[0.02] text-slate-dim"
                      : "border-white/10 bg-black/30 font-mono text-xs text-slate-200"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 p-4">
          {error && (
            <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='e.g. "Analyze system quotas and optimize runtime boundaries"'
              rows={2}
              disabled={isSending || quotaExhausted}
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim focus:border-cyan-accent/40 focus:outline-none focus:ring-1 focus:ring-cyan-accent/30 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isSending || quotaExhausted || !input.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 self-end rounded-xl bg-cyan-accent px-4 py-3 text-sm font-semibold text-obsidian transition-all hover:shadow-glow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Send
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActivityBadge({
  activity,
  isSending,
}: {
  activity: ActivityIndicator;
  isSending: boolean;
}) {
  if (isSending && activity.kind === "idle") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-cyan-accent">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Dispatching...
      </span>
    );
  }

  if (activity.kind === "thinking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-cyan-accent">
        <Brain className="h-3 w-3 animate-pulse" aria-hidden />
        Thinking
      </span>
    );
  }

  if (activity.kind === "executing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
        <Wrench className="h-3 w-3 animate-pulse" aria-hidden />
        Executing Tool [{activity.toolName}]
      </span>
    );
  }

  if (activity.kind === "memory") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-purple-400">
        <Brain className="h-3 w-3 animate-pulse" aria-hidden />
        Updating long-term memory blocks
      </span>
    );
  }

  return (
    <span className="text-[11px] text-slate-dim">Standby</span>
  );
}
