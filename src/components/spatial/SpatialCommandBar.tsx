"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Navigation, Send } from "lucide-react";
import type { ParsedSpatialCommand } from "@/lib/spatial/commandParser";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";

type CommandParserResponse = {
  success?: boolean;
  command?: ParsedSpatialCommand;
  parsed?: ParsedSpatialCommand;
  error?: string;
};

type SpatialCommandBarProps = {
  sessionId: string;
  from: () => { x: number; y: number; z: number };
  onNavigate: (command: ParsedSpatialCommand) => void;
  disabled?: boolean;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

/**
 * Bio-metallic NL / voice command bar for Spatial Universe pathfinding.
 */
export default function SpatialCommandBar({
  sessionId,
  from,
  onNavigate,
  disabled,
}: SpatialCommandBarProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy || disabled) return;
      setBusy(true);
      setStatus("parsing…");
      try {
        const pos = from();
        const res = await fetch("/api/spatial/command-parser", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: text,
            sessionId,
            from: { x: pos.x, y: pos.y, z: pos.z },
          }),
        });
        const json = (await res.json()) as CommandParserResponse;
        const cmd = json.command ?? json.parsed;
        if (!res.ok || !cmd) {
          throw new Error(json.error ?? "Command parse failed");
        }
        setStatus(cmd.utterance);
        if (
          cmd.path.length > 0 &&
          (cmd.intent === "navigate" ||
            cmd.intent === "inspect" ||
            cmd.intent === "interact" ||
            cmd.intent === "mount" ||
            cmd.intent === "unlock")
        ) {
          playSpatialCue("navigate");
          onNavigate(cmd);
          setQuery("");
        } else if (cmd.intent === "unknown") {
          playSpatialCue("error");
        } else {
          playSpatialCue("navigate");
          onNavigate(cmd);
          setQuery("");
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Command failed");
        playSpatialCue("error");
      } finally {
        setBusy(false);
      }
    },
    [busy, disabled, from, onNavigate, sessionId]
  );

  const toggleVoice = useCallback(() => {
    if (disabled || busy) return;
    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus("Speech recognition unavailable in this browser");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setQuery(transcript);
        void submit(transcript);
      }
    };
    rec.onerror = () => {
      setListening(false);
      setStatus("Voice input error");
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      setStatus("listening…");
    } catch {
      setStatus("Could not start microphone");
    }
  }, [busy, disabled, listening, submit]);

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <form
        className="flex w-full max-w-xl items-center gap-2 rounded-2xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f]/95 to-[#121e18]/95 p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_16px_36px_-14px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(query);
        }}
      >
        <span className="ml-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#00ffaa]/20 bg-[#00ffaa]/10 text-[#00ffaa]">
          <Navigation className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled || busy}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Command · “go to sentry” · “goto 12, -4”'
            className="w-full bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-slate-dim disabled:opacity-50"
            aria-label="Spatial navigation command"
            autoComplete="off"
          />
          {status ? (
            <p className="truncate font-mono text-[9px] text-[#00ffaa]/70">
              {status}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggleVoice}
          disabled={disabled || busy}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
            listening
              ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
              : "border-white/10 text-slate-muted hover:border-[#00ffaa]/30 hover:text-[#00ffaa]"
          }`}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          title="Voice command"
        >
          {listening ? (
            <MicOff className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Mic className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <button
          type="submit"
          disabled={disabled || busy || !query.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#00ffaa]/35 bg-[#00ffaa]/15 px-2.5 font-mono text-[10px] font-semibold text-[#00ffaa] transition hover:bg-[#00ffaa]/25 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden />
          )}
          Go
        </button>
      </form>
    </div>
  );
}
