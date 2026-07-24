"use client";

import { useCallback, useRef } from "react";
import type { ParsedSpatialCommand } from "@/lib/spatial/commandParser";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";
import { requestCameraFocus } from "@/lib/spatial/touchInput";

type CommandParserResponse = {
  success?: boolean;
  command?: ParsedSpatialCommand;
  error?: string;
};

const FOCUS_ALIASES = /\b(sentry|meta[-_]?sre|metasre)\b/i;

/**
 * Shared NL / voice command dispatch for Spatial Command Bar.
 * Clears parse errors on re-type (caller), focuses camera on known nodes.
 */
export function useSpatialVoiceDispatch({
  sessionId,
  from,
  onNavigate,
}: {
  sessionId: string;
  from: () => { x: number; y: number; z: number };
  onNavigate: (command: ParsedSpatialCommand) => void;
}) {
  const abortRef = useRef<AbortController | null>(null);

  const focusIfKnown = useCallback((cmd: ParsedSpatialCommand) => {
    const node = cmd.node;
    const hay = `${cmd.query} ${cmd.targetNodeId ?? ""} ${node?.id ?? ""} ${node?.label ?? ""}`;
    if (!FOCUS_ALIASES.test(hay) && !node) return;

    const coords = cmd.coordinates;
    if (coords && Number.isFinite(coords[0]) && Number.isFinite(coords[2])) {
      requestCameraFocus(coords[0], coords[1] ?? 0, coords[2]);
      return;
    }
    if (cmd.target) {
      requestCameraFocus(cmd.target.x, cmd.target.y ?? 0, cmd.target.z);
    }
  }, []);

  const dispatch = useCallback(
    async (raw: string): Promise<{ ok: boolean; status: string }> => {
      const text = raw.trim();
      if (!text) return { ok: false, status: "" };

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

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
          signal: ac.signal,
        });
        const json = (await res.json()) as CommandParserResponse;
        if (!res.ok || !json.command) {
          throw new Error(json.error ?? "Command parse failed");
        }
        const cmd = json.command;
        focusIfKnown(cmd);
        if (cmd.intent === "navigate" && cmd.path.length > 0) {
          playSpatialCue("navigate");
          onNavigate(cmd);
          return { ok: true, status: cmd.utterance };
        }
        playSpatialCue("error");
        return { ok: false, status: cmd.utterance || "No navigable path" };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return { ok: false, status: "" };
        }
        playSpatialCue("error");
        return {
          ok: false,
          status: err instanceof Error ? err.message : "Command failed",
        };
      }
    },
    [focusIfKnown, from, onNavigate, sessionId]
  );

  return { dispatch };
}

export default useSpatialVoiceDispatch;
