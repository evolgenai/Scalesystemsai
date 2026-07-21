"use client";

/**
 * Virtual Terminal — E2B isolated container execution stream
 * (stdout / stderr / exit codes / runtime metrics).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  CheckCircle2,
  FileCode2,
  Loader2,
  Play,
  Square,
  Terminal,
  Upload,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

const PROMPT = "root@e2b:~#";

const BOOT_LINES = [
  "ScaleSystems virt-tty 2.0 · E2B isolate bridge",
  "Kernel: e2b-microvm · network denied · namespace isolated",
  "Drop a script or paste below — Run streams stdout/stderr live.",
  "",
];

type UploadPhase = "idle" | "reading" | "staging" | "ready" | "error";
type RunPhase = "idle" | "connecting" | "running" | "done" | "error";

type StagedScript = {
  name: string;
  bytes: number;
  content: string;
  stagedAt: number;
};

export type E2BLogLine = {
  id: string;
  channel: "stdout" | "stderr" | "system" | "metrics";
  text: string;
  ts: string;
};

export type E2BSessionMetrics = {
  sessionId: string | null;
  exitCode: number | null;
  runtimeMs: number | null;
  language: "javascript" | "python";
};

type StreamFrame = {
  type?: string;
  sessionId?: string;
  ts?: string;
  line?: string;
  exitCode?: number;
  runtimeMs?: number;
  language?: "javascript" | "python";
  message?: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isShellLike(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".sh") ||
    name.endsWith(".bash") ||
    name.endsWith(".js") ||
    name.endsWith(".mjs") ||
    name.endsWith(".py") ||
    name.endsWith(".ts") ||
    file.type === "application/x-sh" ||
    file.type === "text/x-shellscript" ||
    file.type === "text/plain" ||
    file.type === "text/javascript" ||
    file.type === ""
  );
}

function detectLanguage(
  name: string,
  content: string
): "javascript" | "python" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".ts")
  ) {
    return "javascript";
  }
  if (/^\s*#!.*python/m.test(content) || /\bdef\s+\w+\s*\(/.test(content)) {
    return "python";
  }
  return "javascript";
}

function toRunnableCode(
  content: string,
  language: "javascript" | "python"
): string {
  const trimmed = content.trim();
  if (language === "python") {
    if (trimmed.startsWith("#!")) {
      return trimmed.replace(/^#!.*\n/, "");
    }
    return trimmed;
  }
  // Shell/JS paste — wrap echo-style shell as JS console for sandbox
  if (
    trimmed.startsWith("#!") ||
    /^\s*(echo|set|export)\b/m.test(trimmed)
  ) {
    const echoes = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("echo "))
      .map((l) => l.slice(5).replace(/^["']|["']$/g, ""));
    if (echoes.length) {
      return echoes.map((m) => `console.log(${JSON.stringify(m)});`).join("\n");
    }
    return `console.log(${JSON.stringify(trimmed.slice(0, 400))});`;
  }
  return trimmed;
}

function consumeSseBuffer(buffer: string): {
  frames: StreamFrame[];
  rest: string;
} {
  const frames: StreamFrame[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    const dataLines = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart());
    if (!dataLines.length) continue;
    try {
      const parsed = JSON.parse(dataLines.join("\n")) as StreamFrame;
      if (parsed && typeof parsed === "object") frames.push(parsed);
    } catch {
      /* skip */
    }
  }
  return { frames, rest };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export type VirtualTerminalProps = {
  /** External matrix / agent lines appended into the tty log. */
  liveLines?: string[];
  telemetryState?: string;
  className?: string;
};

export default function VirtualTerminal({
  liveLines,
  telemetryState,
  className,
}: VirtualTerminalProps = {}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveCursor = useRef(0);

  const [log, setLog] = useState<E2BLogLine[]>(() =>
    BOOT_LINES.map((text) => ({
      id: uid("boot"),
      channel: "system" as const,
      text,
      ts: new Date().toISOString(),
    }))
  );
  const [buffer, setBuffer] = useState(
    'console.log("[e2b] hello from isolated container");\nconsole.log("runtime metrics will follow");\n'
  );
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [staged, setStaged] = useState<StagedScript | null>(null);
  const [statusLine, setStatusLine] = useState("ready · no payload");
  const [language, setLanguage] = useState<"javascript" | "python">(
    "javascript"
  );
  const [metrics, setMetrics] = useState<E2BSessionMetrics>({
    sessionId: null,
    exitCode: null,
    runtimeMs: null,
    language: "javascript",
  });

  const appendLines = useCallback((lines: E2BLogLine[]) => {
    setLog((prev) => {
      const next = [...prev, ...lines];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  useEffect(() => {
    if (!liveLines?.length) return;
    if (liveCursor.current > liveLines.length) liveCursor.current = 0;
    const fresh = liveLines.slice(liveCursor.current);
    if (!fresh.length) return;
    liveCursor.current = liveLines.length;
    appendLines(
      fresh.map((text) => ({
        id: uid("live"),
        channel: "system" as const,
        text,
        ts: new Date().toISOString(),
      }))
    );
  }, [liveLines, appendLines]);

  const stageContent = useCallback(
    async (name: string, content: string) => {
      setPhase("reading");
      setStatusLine(`reading · ${name}`);
      appendLines([
        {
          id: uid("sys"),
          channel: "system",
          text: `${PROMPT} ingest ${name}`,
          ts: new Date().toISOString(),
        },
      ]);

      await new Promise((r) => setTimeout(r, 320));
      setPhase("staging");
      const lang = detectLanguage(name, content);
      setLanguage(lang);
      setStatusLine(`staging · e2b isolate · ${lang}`);

      await new Promise((r) => setTimeout(r, 480));
      const next: StagedScript = {
        name,
        bytes: new Blob([content]).size,
        content,
        stagedAt: Date.now(),
      };
      setStaged(next);
      setBuffer(content);
      setPhase("ready");
      setStatusLine(`ready · ${name} · ${formatBytes(next.bytes)}`);
      appendLines([
        {
          id: uid("sys"),
          channel: "system",
          text: `[ok] staged ${name} for E2B container`,
          ts: new Date().toISOString(),
        },
      ]);
    },
    [appendLines]
  );

  const ingestFile = useCallback(
    async (file: File) => {
      if (!isShellLike(file)) {
        setPhase("error");
        setStatusLine("error · unsupported type");
        appendLines([
          {
            id: uid("err"),
            channel: "stderr",
            text: `[!] expected .js / .py / .sh — got ${file.name}`,
            ts: new Date().toISOString(),
          },
        ]);
        return;
      }
      try {
        const text = await file.text();
        await stageContent(file.name, text);
      } catch {
        setPhase("error");
        setStatusLine("error · read failed");
      }
    },
    [appendLines, stageContent]
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingestFile(file);
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void ingestFile(file);
    e.target.value = "";
  };

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunPhase("idle");
    setStatusLine("aborted · session closed");
  }, []);

  const runE2B = useCallback(async () => {
    const payload = staged?.content ?? buffer;
    if (!payload.trim()) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const lang = detectLanguage(staged?.name ?? "inline.js", payload);
    setLanguage(lang);
    setRunPhase("connecting");
    setStatusLine("connecting · e2b stream");
    setMetrics({
      sessionId: null,
      exitCode: null,
      runtimeMs: null,
      language: lang,
    });

    appendLines([
      {
        id: uid("sys"),
        channel: "system",
        text: `${PROMPT} e2b exec --lang=${lang}`,
        ts: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/terminal/e2b/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          code: toRunnableCode(payload, lang),
          language: lang,
          sessionLabel: staged?.name ?? "inline",
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`E2B stream HTTP ${res.status}`);
      }

      setRunPhase("running");
      setStatusLine("running · isolate live");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (!ac.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { frames, rest } = consumeSseBuffer(buf);
        buf = rest;

        for (const frame of frames) {
          if (frame.sessionId) {
            setMetrics((m) => ({ ...m, sessionId: frame.sessionId! }));
          }

          switch (frame.type) {
            case "session_start":
              appendLines([
                {
                  id: uid("sys"),
                  channel: "system",
                  text: frame.message ?? "session start",
                  ts: frame.ts ?? new Date().toISOString(),
                },
              ]);
              break;
            case "stdout":
              if (frame.line != null) {
                appendLines([
                  {
                    id: uid("out"),
                    channel: "stdout",
                    text: frame.line,
                    ts: frame.ts ?? new Date().toISOString(),
                  },
                ]);
              }
              break;
            case "stderr":
              if (frame.line != null) {
                appendLines([
                  {
                    id: uid("err"),
                    channel: "stderr",
                    text: frame.line,
                    ts: frame.ts ?? new Date().toISOString(),
                  },
                ]);
              }
              break;
            case "metrics":
              setMetrics((m) => ({
                ...m,
                runtimeMs: frame.runtimeMs ?? m.runtimeMs,
                language: frame.language ?? m.language,
              }));
              appendLines([
                {
                  id: uid("met"),
                  channel: "metrics",
                  text:
                    frame.message ??
                    `runtime ${frame.runtimeMs ?? "?"}ms`,
                  ts: frame.ts ?? new Date().toISOString(),
                },
              ]);
              break;
            case "exit":
              setMetrics((m) => ({
                ...m,
                exitCode: frame.exitCode ?? m.exitCode,
                runtimeMs: frame.runtimeMs ?? m.runtimeMs,
              }));
              appendLines([
                {
                  id: uid("exit"),
                  channel: "system",
                  text: `[exit] code=${frame.exitCode ?? "?"} · ${frame.runtimeMs ?? "?"}ms · ${frame.message ?? ""}`,
                  ts: frame.ts ?? new Date().toISOString(),
                },
              ]);
              setRunPhase("done");
              setStatusLine(
                `done · exit ${frame.exitCode ?? "?"} · ${frame.runtimeMs ?? "?"}ms`
              );
              break;
            case "error":
              appendLines([
                {
                  id: uid("err"),
                  channel: "stderr",
                  text: frame.message ?? "E2B error",
                  ts: frame.ts ?? new Date().toISOString(),
                },
              ]);
              setRunPhase("error");
              setStatusLine("error · isolate failed");
              break;
            default:
              break;
          }
        }
      }

      if (!ac.signal.aborted) {
        setRunPhase((prev) => (prev === "running" ? "done" : prev));
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setRunPhase("error");
      setStatusLine("error · stream failed");
      appendLines([
        {
          id: uid("err"),
          channel: "stderr",
          text:
            err instanceof Error
              ? err.message
              : "E2B stream connection failed.",
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }, [appendLines, buffer, staged]);

  const busy = phase === "reading" || phase === "staging";
  const running = runPhase === "connecting" || runPhase === "running";

  const channelClass = (channel: E2BLogLine["channel"]) => {
    switch (channel) {
      case "stderr":
        return "text-rose-300/90";
      case "metrics":
        return "text-amber-200/90";
      case "system":
        return "text-slate-dim";
      default:
        return "text-emerald-200/90";
    }
  };

  return (
    <section
      className={
        className ??
        "glass-panel flex min-h-[420px] flex-col overflow-hidden"
      }
      aria-label="Virtual Linux terminal · E2B"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3.5 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-accent/25 bg-cyan-accent/10">
            <Terminal className="h-4 w-4 text-cyan-accent" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Virtual Terminal
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              E2B isolate · stdout/stderr stream
              {telemetryState ? ` · ${telemetryState}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <span className="rounded border border-white/10 bg-black/30 px-2 py-1 text-slate-muted">
            {language}
          </span>
          {metrics.sessionId ? (
            <span className="max-w-[9rem] truncate rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-300">
              {metrics.sessionId}
            </span>
          ) : null}
          {metrics.exitCode != null ? (
            <span
              className={`rounded border px-2 py-1 ${
                metrics.exitCode === 0
                  ? "border-emerald-500/30 text-emerald-300"
                  : "border-rose-500/30 text-rose-300"
              }`}
            >
              exit {metrics.exitCode}
            </span>
          ) : null}
          {metrics.runtimeMs != null ? (
            <span className="rounded border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-amber-200">
              {metrics.runtimeMs}ms
            </span>
          ) : null}
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
      </header>

      <div
        className={`relative mx-3 mt-3 rounded-lg border border-dashed transition sm:mx-4 ${
          dragging
            ? "border-emerald-400/60 bg-emerald-500/10"
            : "border-white/10 bg-black/30"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept=".sh,.bash,.js,.mjs,.py,.ts,text/plain"
          className="sr-only"
          onChange={onFileInput}
        />
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center gap-2 px-4 py-5 text-center sm:flex-row sm:justify-center sm:gap-4 sm:py-4"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
            {busy || running ? (
              <Loader2
                className="h-5 w-5 animate-spin text-emerald-400"
                aria-hidden
              />
            ) : phase === "ready" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
            ) : (
              <Upload className="h-5 w-5 text-slate-muted" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white">
              {busy
                ? "Preparing E2B payload…"
                : dragging
                  ? "Release to stage script"
                  : "Drop JS / Python / shell scripts"}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-dim">
              {statusLine}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-emerald-300">
            <FileCode2 className="h-3 w-3" aria-hidden />
            Browse
          </span>
        </label>
      </div>

      <div className="mx-3 mt-3 flex min-h-0 flex-1 flex-col gap-3 sm:mx-4 sm:flex-row">
        <div className="flex min-h-[180px] flex-1 flex-col overflow-hidden rounded-lg border border-white/5 bg-[#050b08]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
              tty · e2b session
            </span>
            {staged ? (
              <span className="truncate font-mono text-[10px] text-emerald-400/90">
                {staged.name} · {formatBytes(staged.bytes)}
              </span>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
            {log.map((line) => (
              <div
                key={line.id}
                className={`whitespace-pre-wrap break-all ${channelClass(line.channel)}`}
              >
                {line.channel === "stderr" ? "ERR " : ""}
                {line.channel === "metrics" ? "MET " : ""}
                {line.text || "\u00a0"}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className="flex min-h-[180px] flex-1 flex-col overflow-hidden rounded-lg border border-white/5 bg-[#050b08]">
          <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
              editor · payload
            </span>
            <div className="flex items-center gap-1.5">
              <select
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value as "javascript" | "python")
                }
                className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-slate-muted outline-none"
                aria-label="Sandbox language"
              >
                <option value="javascript">javascript</option>
                <option value="python">python</option>
              </select>
              {running ? (
                <button
                  type="button"
                  onClick={stopRun}
                  className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300"
                >
                  <Square className="h-3 w-3" aria-hidden />
                  stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runE2B()}
                  disabled={busy || !buffer.trim()}
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Play className="h-3 w-3" aria-hidden />
                  run e2b
                </button>
              )}
            </div>
          </div>
          <textarea
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            spellCheck={false}
            className="min-h-[140px] flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[11px] leading-relaxed text-cyan-100/90 outline-none placeholder:text-slate-600"
            placeholder={
              language === "python"
                ? "print('hello from e2b')"
                : "console.log('hello from e2b')"
            }
            aria-label="Sandbox script editor"
          />
        </div>
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3.5 py-2.5 sm:px-4">
        <p className="font-mono text-[10px] text-slate-dim">
          {PROMPT}{" "}
          <span className="animate-pulse text-emerald-400">▌</span>
        </p>
        <p className="font-mono text-[10px] text-slate-dim">
          e2b isolate · no host egress
        </p>
      </footer>
    </section>
  );
}
