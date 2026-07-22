"use client";

/**
 * Virtual Terminal — Ephemeral E2B isolate OR Persistent Workspace Sandbox.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CheckCircle2,
  FileCode2,
  Loader2,
  Play,
  Power,
  Square,
  Terminal,
  Upload,
  Zap,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

const PROMPT_EPHEMERAL = "root@e2b:~#";
const PROMPT_PERSISTENT = "root@persistent:~#";

type SandboxMode = "ephemeral" | "persistent";
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

type PersistentView = {
  sandboxId: string;
  status: string;
  cwd: string;
  createdAt: string | number;
  uptimeMs?: number;
  processCount?: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
    if (trimmed.startsWith("#!")) return trimmed.replace(/^#!.*\n/, "");
    return trimmed;
  }
  if (trimmed.startsWith("#!") || /^\s*(echo|set|export)\b/m.test(trimmed)) {
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

function bootLines(mode: SandboxMode): E2BLogLine[] {
  const lines =
    mode === "persistent"
      ? [
          "ScaleSystems virt-tty 2.1 · Persistent Workspace Sandbox",
          "Mode: stateful container · cwd/env/files survive across commands",
          "Toggle Ephemeral for one-shot E2B isolates. Terminate to reset.",
          "",
        ]
      : [
          "ScaleSystems virt-tty 2.1 · E2B Ephemeral isolate",
          "Kernel: e2b-microvm · destroyed after each run",
          "Drop a script or paste below — Run streams stdout/stderr live.",
          "",
        ];
  return lines.map((text) => ({
    id: uid("boot"),
    channel: "system" as const,
    text,
    ts: new Date().toISOString(),
  }));
}

export type VirtualTerminalProps = {
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
  const cmdInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<SandboxMode>("ephemeral");
  const [log, setLog] = useState<E2BLogLine[]>(() => bootLines("ephemeral"));
  const [buffer, setBuffer] = useState(
    'console.log("[e2b] hello from isolated container");\nconsole.log("runtime metrics will follow");\n'
  );
  const [cmdInput, setCmdInput] = useState("");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [staged, setStaged] = useState<StagedScript | null>(null);
  const [statusLine, setStatusLine] = useState("ready · ephemeral");
  const [language, setLanguage] = useState<"javascript" | "python">(
    "javascript"
  );
  const [metrics, setMetrics] = useState<E2BSessionMetrics>({
    sessionId: null,
    exitCode: null,
    runtimeMs: null,
    language: "javascript",
  });

  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [persistentView, setPersistentView] = useState<PersistentView | null>(
    null
  );
  const [uptimeMs, setUptimeMs] = useState(0);
  const [terminating, setTerminating] = useState(false);
  const [creating, setCreating] = useState(false);

  const prompt = mode === "persistent" ? PROMPT_PERSISTENT : PROMPT_EPHEMERAL;

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

  // Live uptime ticker for persistent sessions
  useEffect(() => {
    if (mode !== "persistent" || !persistentView) {
      setUptimeMs(0);
      return;
    }
    const created =
      typeof persistentView.createdAt === "number"
        ? persistentView.createdAt
        : Date.parse(persistentView.createdAt);
    const tick = () => {
      setUptimeMs(Date.now() - (Number.isFinite(created) ? created : Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [mode, persistentView]);

  const resetEphemeralMetrics = useCallback(() => {
    setMetrics({
      sessionId: null,
      exitCode: null,
      runtimeMs: null,
      language: "javascript",
    });
    setRunPhase("idle");
  }, []);

  const ensurePersistentSandbox = useCallback(async (): Promise<string | null> => {
    if (sandboxId) return sandboxId;
    setCreating(true);
    try {
      const res = await fetch("/api/sandbox/persistent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ action: "create" }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        sandboxId?: string;
        sandbox?: PersistentView;
        error?: string;
      };
      if (!res.ok || !body.success || !body.sandboxId) {
        throw new Error(body.error ?? `create failed (${res.status})`);
      }
      setSandboxId(body.sandboxId);
      if (body.sandbox) setPersistentView(body.sandbox);
      appendLines([
        {
          id: uid("sys"),
          channel: "system",
          text: `[ok] persistent sandbox ${body.sandboxId} online`,
          ts: new Date().toISOString(),
        },
      ]);
      setStatusLine(`persistent · ${body.sandboxId}`);
      return body.sandboxId;
    } catch (err) {
      appendLines([
        {
          id: uid("err"),
          channel: "stderr",
          text:
            err instanceof Error
              ? err.message
              : "Failed to create persistent sandbox.",
          ts: new Date().toISOString(),
        },
      ]);
      setStatusLine("error · create failed");
      return null;
    } finally {
      setCreating(false);
    }
  }, [appendLines, sandboxId]);

  const switchMode = useCallback(
    (next: SandboxMode) => {
      if (next === mode) return;
      setMode(next);
      setLog(bootLines(next));
      setCmdInput("");
      setStatusLine(next === "persistent" ? "ready · persistent" : "ready · ephemeral");
      resetEphemeralMetrics();
      if (next === "ephemeral") {
        // Keep sandboxId until explicit terminate; clear UI indicators only
        // when leaving persistent without terminate — soft detach
        setPersistentView(null);
        setSandboxId(null);
        setUptimeMs(0);
      } else {
        void (async () => {
          await ensurePersistentSandbox();
        })();
      }
    },
    [mode, resetEphemeralMetrics, ensurePersistentSandbox]
  );

  const terminateSandbox = useCallback(async () => {
    if (!sandboxId) {
      setPersistentView(null);
      setSandboxId(null);
      setUptimeMs(0);
      setStatusLine("ready · persistent (no session)");
      return;
    }
    setTerminating(true);
    try {
      await fetch("/api/sandbox/persistent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ action: "kill", sandboxId }),
      });
      appendLines([
        {
          id: uid("sys"),
          channel: "system",
          text: `[terminate] sandbox ${sandboxId} destroyed · state cleared`,
          ts: new Date().toISOString(),
        },
      ]);
    } catch {
      appendLines([
        {
          id: uid("err"),
          channel: "stderr",
          text: "[terminate] request failed — local state cleared",
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setSandboxId(null);
      setPersistentView(null);
      setUptimeMs(0);
      setRunPhase("idle");
      setStatusLine("terminated · ready to spawn");
      setTerminating(false);
    }
  }, [appendLines, sandboxId]);

  const stageContent = useCallback(
    async (name: string, content: string) => {
      setPhase("reading");
      setStatusLine(`reading · ${name}`);
      appendLines([
        {
          id: uid("sys"),
          channel: "system",
          text: `${prompt} ingest ${name}`,
          ts: new Date().toISOString(),
        },
      ]);
      await new Promise((r) => setTimeout(r, 280));
      setPhase("staging");
      const lang = detectLanguage(name, content);
      setLanguage(lang);
      setStatusLine(`staging · ${mode} · ${lang}`);
      await new Promise((r) => setTimeout(r, 420));
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
          text: `[ok] staged ${name}`,
          ts: new Date().toISOString(),
        },
      ]);
    },
    [appendLines, mode, prompt]
  );

  const ingestFile = useCallback(
    async (file: File) => {
      if (!isShellLike(file)) {
        setPhase("error");
        setStatusLine("error · unsupported type");
        return;
      }
      try {
        await stageContent(file.name, await file.text());
      } catch {
        setPhase("error");
        setStatusLine("error · read failed");
      }
    },
    [stageContent]
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

  const dispatchPersistent = useCallback(
    async (opts: {
      command?: string;
      code?: string;
      language?: "javascript" | "python" | "bash";
    }) => {
      const id = await ensurePersistentSandbox();
      if (!id) return;

      setRunPhase("running");
      setStatusLine(`exec · ${id}`);

      const display =
        opts.command?.trim() ||
        (opts.code ? `[${opts.language ?? "code"} payload]` : "");
      appendLines([
        {
          id: uid("sys"),
          channel: "system",
          text: `${PROMPT_PERSISTENT} ${display}`,
          ts: new Date().toISOString(),
        },
      ]);

      try {
        const res = await fetch("/api/sandbox/persistent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...getClientAuthHeaders(),
          },
          body: JSON.stringify({
            action: "exec",
            sandboxId: id,
            command: opts.command,
            code: opts.code,
            language: opts.language,
          }),
        });
        const body = (await res.json()) as {
          success?: boolean;
          stdout?: string;
          stderr?: string;
          exitCode?: number;
          durationMs?: number;
          cwd?: string;
          uptimeMs?: number;
          sandbox?: PersistentView;
          error?: string;
        };

        if (!res.ok || !body.success) {
          throw new Error(body.error ?? `exec failed (${res.status})`);
        }

        if (body.sandbox) setPersistentView(body.sandbox);

        const out = (body.stdout ?? "").replace(/\n$/, "");
        const err = (body.stderr ?? "").replace(/\n$/, "");
        if (out) {
          appendLines(
            out.split("\n").map((text) => ({
              id: uid("out"),
              channel: "stdout" as const,
              text,
              ts: new Date().toISOString(),
            }))
          );
        }
        if (err) {
          appendLines(
            err.split("\n").map((text) => ({
              id: uid("err"),
              channel: "stderr" as const,
              text,
              ts: new Date().toISOString(),
            }))
          );
        }

        setMetrics({
          sessionId: id,
          exitCode: body.exitCode ?? 0,
          runtimeMs: body.durationMs ?? null,
          language: (opts.language === "python" ? "python" : "javascript"),
        });
        appendLines([
          {
            id: uid("met"),
            channel: "metrics",
            text: `[exit] code=${body.exitCode ?? "?"} · ${body.durationMs ?? "?"}ms · cwd=${body.cwd ?? "?"}`,
            ts: new Date().toISOString(),
          },
        ]);
        setRunPhase("done");
        setStatusLine(
          `persistent · exit ${body.exitCode ?? "?"} · ${formatUptime(body.uptimeMs ?? uptimeMs)}`
        );
      } catch (err) {
        setRunPhase("error");
        setStatusLine("error · persistent exec failed");
        appendLines([
          {
            id: uid("err"),
            channel: "stderr",
            text:
              err instanceof Error
                ? err.message
                : "Persistent exec failed.",
            ts: new Date().toISOString(),
          },
        ]);
      }
    },
    [appendLines, ensurePersistentSandbox, uptimeMs]
  );

  const runEphemeralE2B = useCallback(async () => {
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
        text: `${PROMPT_EPHEMERAL} e2b exec --lang=${lang}`,
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

      if (!res.ok || !res.body) throw new Error(`E2B stream HTTP ${res.status}`);

      setRunPhase("running");
      setStatusLine("running · ephemeral isolate");

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
              if (frame.message) {
                appendLines([
                  {
                    id: uid("sys"),
                    channel: "system",
                    text: frame.message,
                    ts: frame.ts ?? new Date().toISOString(),
                  },
                ]);
              }
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
                  text: `[exit] code=${frame.exitCode ?? "?"} · ${frame.runtimeMs ?? "?"}ms`,
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

  const runPayload = useCallback(() => {
    if (mode === "persistent") {
      const payload = staged?.content ?? buffer;
      const lang = detectLanguage(staged?.name ?? "inline.js", payload);
      void dispatchPersistent({
        code: toRunnableCode(payload, lang),
        language: lang,
      });
      return;
    }
    void runEphemeralE2B();
  }, [mode, staged, buffer, dispatchPersistent, runEphemeralE2B]);

  const submitCommand = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const cmd = cmdInput.trim();
      if (!cmd || mode !== "persistent") return;
      setCmdInput("");
      void dispatchPersistent({ command: cmd, language: "bash" });
    },
    [cmdInput, mode, dispatchPersistent]
  );

  const onCmdKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCommand();
    }
  };

  const busy = phase === "reading" || phase === "staging" || creating;
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
      aria-label="Virtual Linux terminal"
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
              {mode === "persistent"
                ? "Persistent Workspace Sandbox"
                : "Ephemeral E2B isolate"}
              {telemetryState ? ` · ${telemetryState}` : ""}
            </p>
          </div>
        </div>

        <div
          className="inline-flex rounded-xl border border-white/10 bg-black/40 p-0.5"
          role="group"
          aria-label="Sandbox mode"
        >
          <button
            type="button"
            onClick={() => switchMode("ephemeral")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
              mode === "ephemeral"
                ? "bg-amber-400/15 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.15)]"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                mode === "ephemeral"
                  ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                  : "bg-slate-600"
              }`}
              aria-hidden
            />
            <Zap className="h-3 w-3" aria-hidden />
            Ephemeral
          </button>
          <button
            type="button"
            onClick={() => switchMode("persistent")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
              mode === "persistent"
                ? "bg-emerald-500/15 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.2)]"
                : "text-slate-muted hover:text-white"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                mode === "persistent" && sandboxId
                  ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                  : mode === "persistent"
                    ? "bg-emerald-700"
                    : "bg-slate-600"
              }`}
              aria-hidden
            />
            Persistent Session
          </button>
        </div>
      </header>

      {mode === "persistent" ? (
        <div className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 sm:mx-4">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              sandboxId
                ? "animate-pulse bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.85)]"
                : "bg-slate-600"
            }`}
            title={sandboxId ? "Session live" : "No session"}
            aria-label={sandboxId ? "Session live" : "No session"}
          />
          <span className="font-mono text-[10px] text-slate-dim">Sandbox ID</span>
          <span className="max-w-[12rem] truncate font-mono text-[11px] font-semibold text-emerald-300 sm:max-w-xs">
            {sandboxId ?? "— spawning —"}
          </span>
          <span className="font-mono text-[10px] text-slate-dim">uptime</span>
          <span className="rounded border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[11px] text-emerald-200 tabular-nums">
            {sandboxId ? formatUptime(uptimeMs) : "00:00"}
          </span>
          {persistentView ? (
            <span className="font-mono text-[10px] text-slate-dim">
              cwd {persistentView.cwd} · procs {persistentView.processCount}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void terminateSandbox()}
            disabled={terminating || (!sandboxId && !persistentView)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {terminating ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Power className="h-3 w-3" aria-hidden />
            )}
            Terminate Sandbox
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2 font-mono text-[10px] sm:px-4">
        <span className="rounded border border-white/10 bg-black/30 px-2 py-1 text-slate-muted">
          {language}
        </span>
        {metrics.sessionId && mode === "ephemeral" ? (
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
        <span className="ml-auto flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              mode === "persistent" && sandboxId
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                : "bg-emerald-400/80"
            }`}
          />
        </span>
      </div>

      <div
        className={`relative mx-3 mt-2 rounded-lg border border-dashed transition sm:mx-4 ${
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
          className="flex cursor-pointer flex-col items-center gap-2 px-4 py-4 text-center sm:flex-row sm:justify-center sm:gap-4"
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
                ? "Preparing payload…"
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
              tty · {mode}
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
          {mode === "persistent" ? (
            <form
              onSubmit={submitCommand}
              className="flex items-center gap-2 border-t border-white/5 px-3 py-1.5"
            >
              <span className="shrink-0 font-mono text-[10px] text-emerald-400">
                {PROMPT_PERSISTENT}
              </span>
              <input
                ref={cmdInputRef}
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                onKeyDown={onCmdKey}
                disabled={running || creating}
                placeholder="pwd · ls · export FOO=bar · echo $FOO"
                className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-emerald-100 outline-none placeholder:text-slate-600"
                aria-label="Persistent shell command"
                autoComplete="off"
                spellCheck={false}
              />
            </form>
          ) : null}
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
                  onClick={runPayload}
                  disabled={busy || !buffer.trim()}
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Play className="h-3 w-3" aria-hidden />
                  {mode === "persistent" ? "run persistent" : "run e2b"}
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
                ? "print('hello from sandbox')"
                : "console.log('hello from sandbox')"
            }
            aria-label="Sandbox script editor"
          />
        </div>
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3.5 py-2.5 sm:px-4">
        <p className="font-mono text-[10px] text-slate-dim">
          {prompt}{" "}
          <span className="animate-pulse text-emerald-400">▌</span>
        </p>
        <p className="font-mono text-[10px] text-slate-dim">
          {mode === "persistent"
            ? "stateful · /api/sandbox/persistent"
            : "ephemeral · destroyed after run"}
        </p>
      </footer>
    </section>
  );
}
