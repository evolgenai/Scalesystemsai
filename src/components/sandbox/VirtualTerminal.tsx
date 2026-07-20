"use client";

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
  Terminal,
  Upload,
} from "lucide-react";

const PROMPT = "root@sandbox:~#";

const BOOT_LINES = [
  "ScaleSystems virt-tty 1.0 · Obsidian Glass runtime",
  "Kernel: sandbox-microvm · namespace isolated",
  "Drop a .sh script or paste below to stage for container test.",
  "",
];

type UploadPhase = "idle" | "reading" | "staging" | "ready" | "error";

type StagedScript = {
  name: string;
  bytes: number;
  content: string;
  stagedAt: number;
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
    name.endsWith(".zsh") ||
    file.type === "application/x-sh" ||
    file.type === "text/x-shellscript" ||
    file.type === "text/plain" ||
    file.type === ""
  );
}

export default function VirtualTerminal() {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<string[]>(BOOT_LINES);
  const [buffer, setBuffer] = useState(
    "#!/usr/bin/env bash\nset -euo pipefail\n\necho \"[sandbox] hello from staged script\"\n"
  );
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [staged, setStaged] = useState<StagedScript | null>(null);
  const [statusLine, setStatusLine] = useState("ready · no payload");

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const appendLog = useCallback((lines: string[]) => {
    setLog((prev) => [...prev, ...lines]);
  }, []);

  const stageContent = useCallback(
    async (name: string, content: string) => {
      setPhase("reading");
      setStatusLine(`reading · ${name}`);
      appendLog([`${PROMPT} ingest ${name}`, `[+] bytes=${content.length}`]);

      await new Promise((r) => setTimeout(r, 420));
      setPhase("staging");
      setStatusLine("staging · virtual container");
      appendLog([
        "[*] validate shebang",
        "[*] chmod +x /tmp/virt-run/payload.sh",
        "[*] bind-mount → sandbox-microvm",
      ]);

      await new Promise((r) => setTimeout(r, 680));
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
      appendLog([
        `[ok] staged ${name} for virtual container testing`,
        `${PROMPT} cat /tmp/virt-run/payload.sh | head -n 3`,
        ...content.split("\n").slice(0, 3).map((l) => `  ${l}`),
        "",
      ]);
    },
    [appendLog]
  );

  const ingestFile = useCallback(
    async (file: File) => {
      if (!isShellLike(file)) {
        setPhase("error");
        setStatusLine("error · unsupported type");
        appendLog([
          `${PROMPT} reject ${file.name}`,
          "[!] expected .sh / .bash / text shell script",
          "",
        ]);
        return;
      }
      try {
        const text = await file.text();
        await stageContent(file.name, text);
      } catch {
        setPhase("error");
        setStatusLine("error · read failed");
        appendLog([`[!] failed to read ${file.name}`, ""]);
      }
    },
    [appendLog, stageContent]
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

  const runStaged = () => {
    const payload = staged?.content ?? buffer;
    const name = staged?.name ?? "inline.sh";
    appendLog([
      `${PROMPT} /tmp/virt-run/${name}`,
      "[sandbox] spawning isolated shell…",
      ...payload
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
        .slice(0, 6)
        .map((l) => `  → ${l.trim()}`),
      "[ok] dry-run complete · no host egress",
      "",
    ]);
  };

  const busy = phase === "reading" || phase === "staging";

  return (
    <section
      className="glass-panel flex min-h-[420px] flex-col overflow-hidden"
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
              upload bridge · script staging deck
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
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
          accept=".sh,.bash,.zsh,text/plain,application/x-sh"
          className="sr-only"
          onChange={onFileInput}
        />
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center gap-2 px-4 py-5 text-center sm:flex-row sm:justify-center sm:gap-4 sm:py-4"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
            {busy ? (
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
                ? "Preparing script for virtual container…"
                : dragging
                  ? "Release to stage shell script"
                  : "Drop custom shell scripts here"}
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
        {busy ? (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/5">
            <div className="h-full w-1/2 animate-pulse bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
          </div>
        ) : null}
      </div>

      <div className="mx-3 mt-3 flex min-h-0 flex-1 flex-col gap-3 sm:mx-4 sm:flex-row">
        <div className="flex min-h-[160px] flex-1 flex-col overflow-hidden rounded-lg border border-white/5 bg-[#07080a]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
              tty · session
            </span>
            {staged ? (
              <span className="truncate font-mono text-[10px] text-emerald-400/90">
                {staged.name} · {formatBytes(staged.bytes)}
              </span>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-200/90">
            {log.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line || "\u00a0"}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className="flex min-h-[180px] flex-1 flex-col overflow-hidden rounded-lg border border-white/5 bg-[#07080a]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-dim">
              editor · payload.sh
            </span>
            <button
              type="button"
              onClick={runStaged}
              disabled={busy || !buffer.trim()}
              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              dry-run
            </button>
          </div>
          <textarea
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            spellCheck={false}
            className="min-h-[140px] flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[11px] leading-relaxed text-cyan-100/90 outline-none placeholder:text-slate-600"
            placeholder="#!/usr/bin/env bash"
            aria-label="Shell script editor"
          />
        </div>
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3.5 py-2.5 sm:px-4">
        <p className="font-mono text-[10px] text-slate-dim">
          {PROMPT}{" "}
          <span className="animate-pulse text-emerald-400">▌</span>
        </p>
        <p className="font-mono text-[10px] text-slate-dim">
          container test · no host egress
        </p>
      </footer>
    </section>
  );
}
