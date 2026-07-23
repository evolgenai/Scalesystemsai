"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { HardwareInteractable } from "@/components/spatial/InstancedHardwareGrid";

export type SentryTelemetryPayload = {
  issues?: Array<{
    id?: string;
    title?: string;
    level?: string;
    count?: number;
    lastSeen?: string;
  }>;
  summary?: string;
  fetchedAt?: string;
};

export type PinVerifySuccess = {
  verified: boolean;
  unlock?: {
    lane: string;
    accessGranted: string;
    unlockedUntil: string;
    sessionToken: string;
  };
  sentryTelemetry?: SentryTelemetryPayload | Record<string, unknown>;
};

type PinKeypadModalProps = {
  node: HardwareInteractable;
  sessionId: string;
  coordinates?: { x: number; y?: number; z: number };
  onClose: () => void;
  onSuccess: (result: PinVerifySuccess) => void;
};

/**
 * Bio-metallic virtual PIN keypad with physical keyboard capture
 * (0–9, Backspace, Enter) → POST /api/spatial/verify-pin.
 */
export default function PinKeypadModal({
  node,
  sessionId,
  coordinates,
  onClose,
  onSuccess,
}: PinKeypadModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef("");
  const busyRef = useRef(false);

  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  const submit = useCallback(async () => {
    const value = pinRef.current;
    if (busyRef.current) return;
    if (!/^\d{4,8}$/.test(value)) {
      setError("Enter 4–8 digit PIN");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spatial/verify-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pin: value,
          sessionId,
          objectId: node.id,
          coordinates,
          limit: 12,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        code?: string;
        verified?: boolean;
        unlock?: PinVerifySuccess["unlock"];
        sentryTelemetry?: PinVerifySuccess["sentryTelemetry"];
      };
      if (!res.ok || json.success === false || !json.verified) {
        setError(json.error ?? "ACCESS DENIED · invalid PIN");
        setPin("");
        pinRef.current = "";
        return;
      }
      onSuccess({
        verified: true,
        unlock: json.unlock,
        sentryTelemetry: json.sentryTelemetry,
      });
    } catch {
      setError("Network failure · retry PIN submit");
      setPin("");
      pinRef.current = "";
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [coordinates, node.id, onSuccess, sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (busyRef.current) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setError(null);
        setPin((p) => {
          if (p.length >= 8) return p;
          const next = p + e.key;
          pinRef.current = next;
          return next;
        });
        return;
      }
      if (e.code === "Backspace") {
        e.preventDefault();
        setError(null);
        setPin((p) => {
          const next = p.slice(0, -1);
          pinRef.current = next;
          return next;
        });
        return;
      }
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, submit]);

  const press = (digit: string) => {
    if (busy) return;
    setError(null);
    setPin((p) => {
      if (p.length >= 8) return p;
      const next = p + digit;
      pinRef.current = next;
      return next;
    });
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="pin-keypad-title"
        className="w-full max-w-xs overflow-hidden rounded-2xl border border-[#00ffaa]/25 bg-gradient-to-b from-slate-950 via-zinc-900 to-emerald-950/40 shadow-[0_0_48px_rgba(0,255,170,0.18)] backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-bio-moss/40 px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/80">
              locked tier · physical keypad
            </p>
            <h3
              id="pin-keypad-title"
              className="truncate text-sm font-semibold text-white"
            >
              {node.label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Close PIN keypad"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3">
          <div className="mb-3 flex justify-center gap-1.5 font-mono text-lg tracking-[0.2em] text-[#00ffaa]">
            {Array.from({ length: Math.max(4, pin.length || 4) }).map((_, i) => (
              <span
                key={i}
                className="inline-flex h-9 w-7 items-center justify-center rounded border border-[#00ffaa]/25 bg-black/40"
              >
                {pin[i] ? "●" : ""}
              </span>
            ))}
          </div>
          {error ? (
            <p className="mb-2 text-center font-mono text-[10px] text-red-400">
              {error}
            </p>
          ) : (
            <p className="mb-2 text-center font-mono text-[10px] text-slate-500">
              Type digits · Backspace · Enter · or tap pad
            </p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "↵"].map(
              (k) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (k === "⌫") {
                      setPin((p) => {
                        const next = p.slice(0, -1);
                        pinRef.current = next;
                        return next;
                      });
                      setError(null);
                    } else if (k === "↵") void submit();
                    else press(k);
                  }}
                  className="rounded-lg border border-white/10 bg-gradient-to-b from-[#1a2428] to-[#0c1214] py-2.5 font-mono text-sm font-semibold text-emerald-200 shadow-inner transition hover:border-[#00ffaa]/35 hover:text-[#00ffaa] disabled:opacity-50"
                >
                  {k}
                </button>
              )
            )}
          </div>
          {busy ? (
            <p className="mt-2 text-center font-mono text-[10px] text-[#00ffaa]/70">
              verifying · /api/spatial/verify-pin
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
