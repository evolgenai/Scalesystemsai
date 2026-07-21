"use client";

import { useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import SandboxConsole from "@/components/dashboard/SandboxConsole";
import type {
  SandboxExecutionStatus,
  SandboxLanguage,
} from "@/lib/agents/streamProtocol";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

type MarkdownSegment =
  | { kind: "text"; content: string }
  | { kind: "code"; language: string; code: string; id: string };

type ManualRunState = {
  status: SandboxExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  language: SandboxLanguage;
};

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

function normalizeLanguage(raw: string): string {
  return raw.trim().toLowerCase().split(/\s+/)[0] ?? "";
}

function isRunnableLanguage(lang: string): lang is SandboxLanguage {
  return (
    lang === "python" ||
    lang === "py" ||
    lang === "javascript" ||
    lang === "js" ||
    lang === "node"
  );
}

function toSandboxLanguage(lang: string): SandboxLanguage {
  if (lang === "python" || lang === "py") return "python";
  return "javascript";
}

function splitMarkdown(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(FENCE_RE.source, "g");
  let blockIndex = 0;

  while ((match = re.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "text",
        content: markdown.slice(lastIndex, match.index),
      });
    }
    const language = normalizeLanguage(match[1] ?? "");
    const code = (match[2] ?? "").replace(/\n$/, "");
    segments.push({
      kind: "code",
      language,
      code,
      id: `block-${blockIndex++}-${language || "plain"}`,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ kind: "text", content: markdown.slice(lastIndex) });
  }

  return segments.length > 0
    ? segments
    : [{ kind: "text", content: markdown }];
}

type ResultMarkdownProps = {
  markdown: string;
};

export default function ResultMarkdown({ markdown }: ResultMarkdownProps) {
  const segments = useMemo(() => splitMarkdown(markdown), [markdown]);
  const [runs, setRuns] = useState<Record<string, ManualRunState>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const runBlock = async (segmentId: string, language: string, code: string) => {
    if (!isRunnableLanguage(language) || pendingId) return;
    const sandboxLang = toSandboxLanguage(language);
    setPendingId(segmentId);
    setRuns((prev) => ({
      ...prev,
      [segmentId]: {
        status: "running",
        stdout: "",
        stderr: "",
        exitCode: null,
        language: sandboxLang,
      },
    }));

    try {
      const response = await fetch("/api/agents/sandbox/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ code, language: sandboxLang }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        output?: string;
      };

      if (!response.ok || payload.success === false) {
        setRuns((prev) => ({
          ...prev,
          [segmentId]: {
            status: "error",
            stdout: payload.stdout ?? "",
            stderr:
              payload.stderr ??
              payload.error ??
              `Sandbox refused (HTTP ${response.status}).`,
            exitCode:
              typeof payload.exitCode === "number" ? payload.exitCode : 1,
            language: sandboxLang,
          },
        }));
        return;
      }

      const exitCode =
        typeof payload.exitCode === "number" ? payload.exitCode : 0;
      const stdout = payload.stdout ?? payload.output ?? "";
      const stderr = payload.stderr ?? "";

      setRuns((prev) => ({
        ...prev,
        [segmentId]: {
          status: exitCode === 0 && !stderr ? "success" : "error",
          stdout,
          stderr,
          exitCode,
          language: sandboxLang,
        },
      }));
    } catch {
      setRuns((prev) => ({
        ...prev,
        [segmentId]: {
          status: "error",
          stdout: "",
          stderr: "Network error talking to sandbox runner.",
          exitCode: 1,
          language: sandboxLang,
        },
      }));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-200">
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          if (!segment.content.trim()) return null;
          return (
            <div key={`text-${index}`} className="whitespace-pre-wrap">
              {segment.content}
            </div>
          );
        }

        const runnable = isRunnableLanguage(segment.language);
        const run = runs[segment.id];

        return (
          <div key={segment.id} className="space-y-2">
            <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#070a10]">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
                  {segment.language || "code"}
                </span>
                {runnable ? (
                  <button
                    type="button"
                    onClick={() =>
                      void runBlock(segment.id, segment.language, segment.code)
                    }
                    disabled={pendingId === segment.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-accent/40 bg-cyan-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-accent opacity-90 transition hover:bg-cyan-accent/20 group-hover:opacity-100 disabled:opacity-40"
                  >
                    {pendingId === segment.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Play className="h-3 w-3" aria-hidden />
                    )}
                    {run ? "Re-run Code" : "Run Code"}
                  </button>
                ) : null}
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-blue-200/90">
                {segment.code}
              </pre>
            </div>
            {run ? (
              <SandboxConsole
                compact
                mode="direct"
                status={run.status}
                language={run.language}
                stdout={run.stdout}
                stderr={run.stderr}
                exitCode={run.exitCode}
                title="Manual Sandbox Run"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
