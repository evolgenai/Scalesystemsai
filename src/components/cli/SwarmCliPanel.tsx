"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  KeyRound,
  Play,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

const INSTALL_CMD = "npm install -g @scalesystems/cli";
const KEYS_STORAGE = "scalesystems.cli.apiKeys";

type ApiKeyRow = {
  id: string;
  label: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
};

type ConsoleLine = {
  id: string;
  tone: "dim" | "cmd" | "ok" | "warn" | "err";
  text: string;
};

function generateKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `ssk_live_${hex}`;
}

function readKeys(): ApiKeyRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ApiKeyRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeKeys(keys: ApiKeyRow[]): void {
  try {
    window.localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

function CopyBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [value]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-black/40">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/5 px-2 py-1 text-[11px] font-medium text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-relaxed text-emerald-300/90">
        <code>{value}</code>
      </pre>
    </div>
  );
}

const DEPLOY_SCRIPT: Omit<ConsoleLine, "id">[] = [
  { tone: "cmd", text: "$ scalesystems deploy" },
  { tone: "dim", text: "Resolving workspace context…" },
  { tone: "ok", text: "✓ Authenticated · key prefix ssk_live_••••" },
  { tone: "dim", text: "Packaging blueprint graph (12 nodes, 14 edges)…" },
  { tone: "ok", text: "✓ Bundle hashed · sha256:a3f9…c2e1" },
  { tone: "dim", text: "Uploading artifacts to edge region us-east-1…" },
  { tone: "warn", text: "↻ Warming swarm supervisors (3 lanes)" },
  { tone: "ok", text: "✓ Deployed revision rev_7c41 · status: LIVE" },
  { tone: "dim", text: "Gas burn: 1,240 GAS · ETA settle 180ms" },
  { tone: "ok", text: "Done. Endpoint: https://run.scalesystems.ai/ws/demo" },
];

export default function SwarmCliPanel() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [label, setLabel] = useState("Local CLI");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [running, setRunning] = useState(false);
  const timersRef = useRef<number[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setKeys(readKeys());
  }, []);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const persist = useCallback((next: ApiKeyRow[]) => {
    setKeys(next);
    writeKeys(next);
  }, []);

  const createKey = useCallback(() => {
    const row: ApiKeyRow = {
      id: `key_${Date.now()}`,
      label: label.trim() || "Untitled key",
      key: generateKey(),
      createdAt: new Date().toISOString(),
      lastUsed: null,
    };
    persist([row, ...keys]);
    setRevealed(row.id);
    setLabel("Local CLI");
  }, [keys, label, persist]);

  const revokeKey = useCallback(
    (id: string) => {
      persist(keys.filter((k) => k.id !== id));
      if (revealed === id) setRevealed(null);
    },
    [keys, persist, revealed]
  );

  const stopSim = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
    setRunning(false);
  }, []);

  const runDeploy = useCallback(() => {
    stopSim();
    setLines([]);
    setRunning(true);

    const activeKey = keys[0];
    if (activeKey) {
      persist(
        keys.map((k) =>
          k.id === activeKey.id
            ? { ...k, lastUsed: new Date().toISOString() }
            : k
        )
      );
    }

    DEPLOY_SCRIPT.forEach((step, i) => {
      const t = window.setTimeout(() => {
        setLines((prev) => [
          ...prev,
          { ...step, id: `line-${Date.now()}-${i}` },
        ]);
        if (i === DEPLOY_SCRIPT.length - 1) setRunning(false);
      }, 420 + i * 520);
      timersRef.current.push(t);
    });
  }, [keys, persist, stopSim]);

  const loginCmd = (key: string) =>
    `npx scalesystems login --key ${key}`;

  return (
    <div className="space-y-6" style={{ backgroundColor: "#09090B" }}>
      <header className="glass-panel overflow-hidden p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              <Hover3DIcon intensity={12}>
                <Terminal className="h-3 w-3" aria-hidden />
              </Hover3DIcon>
              CLI Integration
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
              Swarm CLI Management
            </h2>
            <p className="max-w-2xl text-sm text-slate-muted">
              Install the ScaleSystems CLI, mint workspace API keys, and simulate
              <span className="font-mono text-emerald-400/90"> scalesystems deploy </span>
              against your swarm blueprints.
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="glass-panel space-y-3 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-dim">
            1 · Global install
          </h3>
          <CopyBlock value={INSTALL_CMD} label="Terminal" />
          <p className="text-[11px] text-slate-dim">
            Requires Node 20+. After install,{" "}
            <span className="font-mono text-slate-muted">scalesystems --help</span>{" "}
            lists swarm, deploy, and login commands.
          </p>
        </article>

        <article className="glass-panel space-y-3 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-dim">
            2 · Authenticate
          </h3>
          <CopyBlock
            value={
              keys[0]
                ? loginCmd(keys[0].key)
                : "npx scalesystems login --key <API_KEY>"
            }
            label="Login"
          />
          <p className="text-[11px] text-slate-dim">
            Generate a key below, then paste into the login command. Keys never leave
            this browser in the scaffold (localStorage only).
          </p>
        </article>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-400" aria-hidden />
            <h3 className="text-sm font-semibold text-white">API keys</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Key label"
              className="w-40 rounded-lg border border-white/5 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/40"
            />
            <button
              type="button"
              onClick={createKey}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
            >
              Generate key
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-dim">
                <th className="px-4 py-2.5 font-medium">Label</th>
                <th className="px-4 py-2.5 font-medium">Key</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Last used</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-dim"
                  >
                    No API keys yet — generate one to unlock CLI login.
                  </td>
                </tr>
              ) : (
                keys.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {row.label}
                    </td>
                    <td className="px-4 py-3">
                      <code className="font-mono text-[11px] text-emerald-300/90">
                        {revealed === row.id
                          ? row.key
                          : `${row.key.slice(0, 12)}…${row.key.slice(-4)}`}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealed((id) => (id === row.id ? null : row.id))
                        }
                        className="ml-2 text-[10px] text-slate-dim underline-offset-2 hover:text-emerald-400 hover:underline"
                      >
                        {revealed === row.id ? "Hide" : "Reveal"}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-dim">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-dim">
                      {row.lastUsed
                        ? new Date(row.lastUsed).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            navigator.clipboard.writeText(loginCmd(row.key))
                          }
                          className="rounded-md border border-white/5 p-1.5 text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400"
                          aria-label="Copy login command"
                          title="Copy login command"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => revokeKey(row.id)}
                          className="rounded-md border border-white/5 p-1.5 text-slate-muted transition hover:border-rose-500/30 hover:text-rose-300"
                          aria-label="Revoke key"
                          title="Revoke"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Execution simulator
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-dim">
              Streams terminal output for{" "}
              <span className="font-mono text-emerald-400/80">
                scalesystems deploy
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button
                type="button"
                onClick={stopSim}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
              >
                <Square className="h-3 w-3" aria-hidden />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={runDeploy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
              >
                <Play className="h-3 w-3" aria-hidden />
                Run deploy
              </button>
            )}
          </div>
        </div>

        <div
          ref={consoleRef}
          className="h-64 overflow-y-auto bg-black/50 px-4 py-3 font-mono text-[12px] leading-relaxed"
          aria-live="polite"
          aria-label="CLI simulator console"
        >
          {lines.length === 0 ? (
            <p className="text-slate-600">
              Idle. Press Run deploy to stream simulator output…
            </p>
          ) : (
            lines.map((line) => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className={
                  line.tone === "cmd"
                    ? "text-white"
                    : line.tone === "ok"
                      ? "text-emerald-400"
                      : line.tone === "warn"
                        ? "text-amber-300"
                        : line.tone === "err"
                          ? "text-rose-300"
                          : "text-slate-dim"
                }
              >
                {line.text}
              </motion.div>
            ))
          )}
          {running ? (
            <span className="mt-1 inline-block h-3.5 w-1.5 animate-pulse bg-emerald-400/80" />
          ) : null}
        </div>
      </section>
    </div>
  );
}
