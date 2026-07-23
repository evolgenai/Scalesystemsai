"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";

export type StreamEngineMode = "webgl" | "ue5";

type StreamEngineContextValue = {
  mode: StreamEngineMode;
  setMode: (mode: StreamEngineMode) => void;
  fallbackReason: string | null;
  reportFallback: (reason: string) => void;
  clearFallback: () => void;
};

const StreamEngineContext = createContext<StreamEngineContextValue | null>(
  null
);

export function StreamEngineProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<StreamEngineMode>("webgl");
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const setMode = useCallback((next: StreamEngineMode) => {
    setModeState(next);
    setFallbackReason(null);
    playSpatialCue(next === "ue5" ? "engine_ue5" : "engine_webgl");
  }, []);

  const reportFallback = useCallback((reason: string) => {
    setFallbackReason(reason);
    setModeState("webgl");
    playSpatialCue("fallback");
  }, []);

  const clearFallback = useCallback(() => setFallbackReason(null), []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      fallbackReason,
      reportFallback,
      clearFallback,
    }),
    [mode, setMode, fallbackReason, reportFallback, clearFallback]
  );

  return (
    <StreamEngineContext.Provider value={value}>
      {children}
    </StreamEngineContext.Provider>
  );
}

export function useStreamEngine(): StreamEngineContextValue {
  const ctx = useContext(StreamEngineContext);
  if (!ctx) {
    return {
      mode: "webgl",
      setMode: () => {},
      fallbackReason: null,
      reportFallback: () => {},
      clearFallback: () => {},
    };
  }
  return ctx;
}
