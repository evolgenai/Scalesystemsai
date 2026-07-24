"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { KeyRound, Loader2, Terminal, X } from "lucide-react";
import type { HardwareInteractable } from "@/components/spatial/InstancedHardwareGrid";
import PredictiveHealthChip from "@/components/spatial/PredictiveHealthChip";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";

type StdoutLine = {
  id: string;
  at: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
};

type EdgeTerminalModalProps = {
  node: HardwareInteractable;
  sessionId: string;
  riskPct?: number;
  onClose: () => void;
};

/**
 * Retro-futuristic green-on-black edge CLI for card terminals / switches.
 */
export default function EdgeTerminalModal({
  node,
  sessionId,
  riskPct = 18,
  onClose,
}: EdgeTerminalModalProps) {
  const [lines, setLines] = useState<StdoutLine[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [keyFp, setKeyFp] = useState<string>("…");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const append = useCallback((incoming: StdoutLine[]) => {
    if (!incoming.length) return;
    setLines((prev) => {
      const seen = new Set(prev.map((l) => l.id));
      const merged = [...prev];
      for (const line of incoming) {
        if (!seen.has(line.id)) merged.push(line);
      }
      return merged.slice(-180);
    });
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ sessionId, nodeId: node.id });
      const res = await fetch(`/api/edge/terminal?${qs}`, {
        headers: getClientAuthHeaders(),
        cache: "no-store",
      });
      const json = (await res.json()) as {
        session?: { keyFingerprint?: string; history?: string[] };
        stdout?: StdoutLine[];
        cursor?: number;
      };
      if (!res.ok) return;
      if (json.session?.keyFingerprint) setKeyFp(json.session.keyFingerprint);
      if (json.session?.history) setHistory(json.session.history);
      if (json.stdout) append(json.stdout);
      if (typeof json.cursor === "number") setCursor(json.cursor);
    } catch {
      /* soft */
    }
  }, [append, node.id, sessionId]);

  useEffect(() => {
    void bootstrap();
    inputRef.current?.focus();
  }, [bootstrap]);

  // Live stdout poll
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const qs = new URLSearchParams({
          sessionId,
          nodeId: node.id,
          after: String(cursor),
        });
        const res = await fetch(`/api/edge/terminal?${qs}`, {
          headers: getClientAuthHeaders(),
          cache: "no-store",
        });
        const json = (await res.json()) as {
          stdout?: StdoutLine[];
          cursor?: number;
          session?: { keyFingerprint?: string };
        };
        if (!res.ok) return;
        if (json.stdout?.length) append(json.stdout);
        if (typeof json.cursor === "number") setCursor(json.cursor);
        if (json.session?.keyFingerprint) setKeyFp(json.session.keyFingerprint);
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [append, cursor, node.id, sessionId]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/edge/terminal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        stdout?: StdoutLine[];
        cursor?: number;
        session?: { keyFingerprint?: string; history?: string[] };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Terminal error");
      if (json.stdout) append(json.stdout);
      if (typeof json.cursor === "number") setCursor(json.cursor);
      if (json.session?.keyFingerprint) setKeyFp(json.session.keyFingerprint);
      if (json.session?.history) setHistory(json.session.history);
    } catch (err) {
      append([
        {
          id: `err_${Date.now()}`,
          at: new Date().toISOString(),
          stream: "stderr",
          text: err instanceof Error ? err.message : "Request failed",
        },
      ]);
      playSpatialCue("error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const cmd = input.trim();
    if (!cmd || busy) return;
    setInput("");
    setHistIdx(-1);
    playSpatialCue("navigate");
    await post({
      action: "exec",
      sessionId,
      nodeId: node.id,
      command: cmd,
    });
  };

  const rotateKey = async () => {
    playSpatialCue("deploy");
    await post({
      action: "rotate_key",
      sessionId,
      nodeId: node.id,
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(history[next] ?? "");
      }
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="edge-tty-title"
        className="flex max-h-[min(88vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#00ffaa]/35 bg-[#050807] shadow-[0_0_48px_rgba(0,255,170,0.18)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#00ffaa]/20 bg-[#0b120f] px-4 py-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/85">
              <Terminal className="h-3 w-3" aria-hidden />
              edge tty · {node.dialogKind.replace(/_/g, " ")}
            </p>
            <h3
              id="edge-tty-title"
              className="truncate font-mono text-sm font-semibold text-[#00ffaa]"
            >
              {node.label}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <PredictiveHealthChip riskPct={riskPct} compact />
              <span className="font-mono text-[9px] text-[#00ffaa]/55">
                key {keyFp.slice(0, 12)}…
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void rotateKey()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-[#00ffaa]/30 px-2 py-1 font-mono text-[10px] text-[#00ffaa] transition hover:bg-[#00ffaa]/10 disabled:opacity-40"
              title="Rotate edge key"
            >
              <KeyRound className="h-3 w-3" aria-hidden />
              Rotate key
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-[#00ffaa]/50 transition hover:bg-[#00ffaa]/10 hover:text-[#00ffaa]"
              aria-label="Close edge terminal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="terminal-scroll min-h-0 flex-1 overflow-y-auto bg-black px-4 py-3 font-mono text-[12px] leading-relaxed text-[#33ff99]"
        >
          {lines.map((line) => (
            <div
              key={line.id}
              className={
                line.stream === "stderr"
                  ? "text-red-400"
                  : line.stream === "system"
                    ? "text-[#00ffaa]/70"
                    : "text-[#33ff99]"
              }
            >
              {line.text}
            </div>
          ))}
          {busy ? (
            <div className="mt-1 inline-flex items-center gap-1.5 text-[#00ffaa]/60">
              <Loader2 className="h-3 w-3 animate-spin" />
              exec…
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(e) => void submit(e)}
          className="flex items-center gap-2 border-t border-[#00ffaa]/20 bg-[#0b120f] px-3 py-2"
        >
          <span className="font-mono text-[12px] text-[#00ffaa]">$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-[#33ff99] caret-[#00ffaa] outline-none placeholder:text-[#00ffaa]/35"
            placeholder="help · status · ping · rotate"
            aria-label="Edge terminal command"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg border border-[#00ffaa]/35 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#00ffaa] disabled:opacity-40"
          >
            Run
          </button>
        </form>
      </div>
    </div>
  );
}

export function isEdgeWorkstation(node: HardwareInteractable): boolean {
  return (
    node.dialogKind === "ip_diagnostic" ||
    node.dialogKind === "webhook_relay" ||
    node.dialogKind === "teletraffic_probe" ||
    node.dialogKind === "vault_hsm" ||
    /edge|switch|terminal|card|relay|diagnostic/i.test(node.label)
  );
}
