"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Mic, MicOff, Navigation, Send } from "lucide-react";
import type { ParsedSpatialCommand } from "@/lib/spatial/commandParser";
import { useSpatialVoiceDispatch } from "@/components/spatial/SpatialVoiceDispatch";

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
 * Collapses on mobile (<768px); clears parse errors on re-type.
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
  const [isError, setIsError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { dispatch } = useSpatialVoiceDispatch({
    sessionId,
    from,
    onNavigate,
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      setCollapsed(mobile);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    // Clear stale parse / voice errors as soon as the user re-types
    if (isError || status) {
      setIsError(false);
      setStatus(null);
    }
  }, [isError, status]);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy || disabled) return;
      setBusy(true);
      setIsError(false);
      setStatus("parsing…");
      const result = await dispatch(text);
      if (result.ok) {
        setStatus(result.status);
        setIsError(false);
        setQuery("");
        if (isMobile) setCollapsed(true);
      } else if (result.status) {
        setStatus(result.status);
        setIsError(true);
      } else {
        setStatus(null);
        setIsError(false);
      }
      setBusy(false);
    },
    [busy, disabled, dispatch, isMobile]
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
      setIsError(true);
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
        setIsError(false);
        setStatus(null);
        void submit(transcript);
      }
    };
    rec.onerror = () => {
      setListening(false);
      setStatus("Voice input error");
      setIsError(true);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      setIsError(false);
      setStatus("listening…");
    } catch {
      setStatus("Could not start microphone");
      setIsError(true);
    }
  }, [busy, disabled, listening, submit]);

  if (isMobile && collapsed) {
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="inline-flex items-center gap-2 rounded-2xl border border-[#00ffaa]/30 bg-[#0b120f]/95 px-4 py-2.5 font-mono text-[11px] font-semibold text-[#00ffaa] shadow-[0_12px_28px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          aria-expanded={false}
        >
          <Navigation className="h-3.5 w-3.5" aria-hidden />
          Command
          <ChevronUp className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <form
        className="flex w-full max-w-xl items-center gap-2 rounded-2xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f]/95 to-[#121e18]/95 p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_16px_36px_-14px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(query);
        }}
      >
        {isMobile ? (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="ml-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-muted"
            aria-label="Collapse command bar"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : (
          <span className="ml-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#00ffaa]/20 bg-[#00ffaa]/10 text-[#00ffaa]">
            <Navigation className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled || busy}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder='Command · “go to sentry” · “goto 12, -4”'
            className="w-full bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-slate-dim disabled:opacity-50"
            aria-label="Spatial navigation command"
            autoComplete="off"
          />
          {status ? (
            <p
              className={`truncate font-mono text-[9px] ${
                isError ? "text-red-400" : "text-[#00ffaa]/70"
              }`}
            >
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
