"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, MonitorPlay, Radio } from "lucide-react";
import { useStreamEngine } from "@/components/spatial/StreamEngineContext";
import type { StreamSignalingConfig } from "@/lib/spatial/streamSignaling";

type SignalingResponse = {
  success?: boolean;
  config?: StreamSignalingConfig;
  signalingUrl?: string | null;
  whipUrl?: string | null;
  demoMode?: boolean;
  error?: string;
};

/**
 * Header toggle: WebGL (Active) ↔ UE5 Lumen (Stream).
 * UE5 path mounts WebRTC via /api/spatial/stream-signaling with
 * automatic WebGL fallback on latency > 250ms or signaling failure.
 */
export default function StreamEngineToggle() {
  const { mode, setMode, fallbackReason, reportFallback, clearFallback } =
    useStreamEngine();
  const [busy, setBusy] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [hasMedia, setHasMedia] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pollRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pcRef.current?.close();
    pcRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setHasMedia(false);
  }, []);

  const connectUe5 = useCallback(async () => {
    setBusy(true);
    setStreamError(null);
    clearFallback();
    teardown();

    try {
      const res = await fetch("/api/spatial/stream-signaling", {
        cache: "no-store",
      });
      const json = (await res.json()) as SignalingResponse;
      if (!res.ok || !json.config) {
        reportFallback(json.error ?? "Signaling failure");
        setStreamError(json.error ?? "Signaling failure");
        return;
      }

      const config = json.config;
      const signalingUrl =
        json.signalingUrl ?? config.signaling.url ?? null;
      const whipUrl = json.whipUrl ?? config.signaling.whipUrl ?? null;
      const demoMode = json.demoMode ?? config.demoMode;
      const latencyBudgetMs = config.ue5.latencyBudgetMs;

      if (demoMode || (!signalingUrl && !whipUrl)) {
        // No live SFU — simulate handshake then fall back (keeps UX honest).
        setLatencyMs(null);
        await new Promise((r) => window.setTimeout(r, 420));
        reportFallback("UE5 SFU unavailable · demoMode");
        setStreamError("No UE5 signaling endpoint configured");
        return;
      }

      const pc = new RTCPeerConnection({ iceServers: config.iceServers });
      pcRef.current = pc;
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (ev) => {
        if (videoRef.current && ev.streams[0]) {
          videoRef.current.srcObject = ev.streams[0];
          setHasMedia(true);
          void videoRef.current.play().catch(() => {});
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const signalUrl = whipUrl || signalingUrl!;
      const t0 = performance.now();
      const answerRes = await fetch(signalUrl, {
        method: "POST",
        headers: { "content-type": "application/sdp" },
        body: offer.sdp ?? "",
      });
      const rtt = performance.now() - t0;
      setLatencyMs(Math.round(rtt));

      if (!answerRes.ok) {
        reportFallback(`Signaling HTTP ${answerRes.status}`);
        setStreamError(`Signaling HTTP ${answerRes.status}`);
        teardown();
        return;
      }
      if (rtt > latencyBudgetMs) {
        reportFallback(
          `Latency ${Math.round(rtt)}ms > ${latencyBudgetMs}ms`
        );
        setStreamError("Stream latency budget exceeded");
        teardown();
        return;
      }

      const answerSdp = await answerRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      pollRef.current = window.setInterval(() => {
        void pc.getStats().then((stats) => {
          let rttCandidate: number | null = null;
          stats.forEach((r) => {
            if (
              r.type === "candidate-pair" &&
              (r as RTCStats & { currentRoundTripTime?: number })
                .currentRoundTripTime != null
            ) {
              rttCandidate =
                ((r as RTCStats & { currentRoundTripTime?: number })
                  .currentRoundTripTime ?? 0) * 1000;
            }
          });
          if (rttCandidate != null) {
            setLatencyMs(Math.round(rttCandidate));
            if (rttCandidate > latencyBudgetMs) {
              reportFallback(
                `Live RTT ${Math.round(rttCandidate)}ms > ${latencyBudgetMs}ms`
              );
              setStreamError("Live latency exceeded budget");
              teardown();
            }
          }
        });
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "WebRTC connect failed";
      reportFallback(msg);
      setStreamError(msg);
      teardown();
    } finally {
      setBusy(false);
    }
  }, [clearFallback, reportFallback, teardown]);

  useEffect(() => {
    if (mode === "ue5") {
      void connectUe5();
    } else {
      teardown();
      setLatencyMs(null);
      setStreamError(null);
    }
    return () => teardown();
  }, [mode, connectUe5, teardown]);

  return (
    <div className="relative flex items-center gap-2">
      <div
        className="inline-flex items-center rounded-xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f] to-[#121e18] p-0.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_12px_28px_-12px_rgba(0,0,0,0.75)]"
        role="group"
        aria-label="Render engine"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode("webgl")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-semibold transition ${
            mode === "webgl"
              ? "bg-[#00ffaa]/15 text-[#00ffaa] shadow-glow-sm"
              : "text-slate-muted hover:text-white"
          }`}
          aria-pressed={mode === "webgl"}
        >
          <Cpu className="h-3 w-3" aria-hidden />
          WebGL{mode === "webgl" ? " · Active" : ""}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode("ue5")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-semibold transition ${
            mode === "ue5"
              ? "bg-[#00ffaa]/15 text-[#00ffaa] shadow-glow-sm"
              : "text-slate-muted hover:text-white"
          }`}
          aria-pressed={mode === "ue5"}
        >
          <MonitorPlay className="h-3 w-3" aria-hidden />
          UE5 Lumen{mode === "ue5" ? " · Stream" : ""}
        </button>
      </div>

      {mode === "ue5" ? (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-[45] flex justify-center px-3">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[#00ffaa]/25 bg-[#050807]/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_20px_40px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
              <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/80">
                <Radio className="h-3 w-3" aria-hidden />
                UE5 Lumen pixel stream
              </p>
              <p className="font-mono text-[10px] text-slate-muted">
                {busy
                  ? "signaling…"
                  : latencyMs != null
                    ? `rtt ${latencyMs}ms`
                    : "connecting"}
              </p>
            </div>
            <div className="relative aspect-video bg-[#0b120f]">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                autoPlay
              />
              {!hasMedia ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_center,rgba(0,255,170,0.08),transparent_60%)]">
                  <MonitorPlay className="h-8 w-8 text-[#00ffaa]/70" />
                  <p className="font-mono text-[11px] text-slate-muted">
                    {streamError ??
                      fallbackReason ??
                      "Awaiting WebRTC media…"}
                  </p>
                  <p className="font-mono text-[9px] text-slate-dim">
                    Auto-fallback to WebGL if latency &gt; 250ms
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {fallbackReason && mode === "webgl" ? (
        <span className="hidden max-w-[12rem] truncate font-mono text-[9px] text-amber-300/90 sm:inline">
          fallback · {fallbackReason}
        </span>
      ) : null}
    </div>
  );
}
