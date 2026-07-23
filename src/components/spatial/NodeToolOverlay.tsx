"use client";

import { X } from "lucide-react";
import type {
  HardwareInteractable,
  NodeDialogKind,
} from "@/components/spatial/InstancedHardwareGrid";
import type { SentryTelemetryPayload } from "@/components/spatial/PinKeypadModal";

type NodeToolOverlayProps = {
  node: HardwareInteractable;
  onClose: () => void;
  sentryTelemetry?: SentryTelemetryPayload | Record<string, unknown> | null;
};

function linesFor(node: HardwareInteractable): string[] {
  const m = node.metrics;
  const kind = node.dialogKind;
  switch (kind) {
    case "sse_stream_analyzer":
      return [
        `[sse] analyzer · ${node.label}`,
        `[*] channel ${m.channelId} · last-event-id ${m.lastEventId}`,
        `[*] reconnects ${m.reconnects} · drop ${m.dropRate}%`,
        `[*] throughput ${m.throughputRps} evt/s · buffer ${m.bufferDepth}`,
        `[*] heartbeat ${m.heartbeatMs}ms · codec json+ndjson`,
        "[ok] stream healthy · backpressure clear",
      ];
    case "sandbox_executor":
      return [
        `[sandbox] executor · ${node.label}`,
        `[*] runtime ${m.runtime} · jail ${m.jail}`,
        `[*] cpu ${m.cpuPct}% · mem ${m.memMb}MB · wall ${m.wallMs}ms`,
        `[*] net ${m.netPolicy} · fs ${m.fsPolicy}`,
        `[*] exit ${m.exitCode} · artifacts ${m.artifacts}`,
        "[ok] sandbox warm · ready for next job",
      ];
    case "database_shard_monitor":
      return [
        `[db] shard monitor · ${node.label}`,
        `[*] shard ${m.shardId} · replica ${m.replica}`,
        `[*] qps ${m.qps} · p95 ${m.p95Ms}ms · locks ${m.lockWaits}`,
        `[*] cache hit ${m.cacheHit}% · bloat ${m.bloatPct}%`,
        `[*] replication lag ${m.replLagMs}ms · vacuum ${m.vacuumState}`,
        "[ok] shard nominal · autovacuum scheduled",
      ];
    case "cyber_rover_drive":
      return [
        `[rover] CyberRover 2× drive bay · ${node.label}`,
        `[*] mount key [F] · speed mult ${m.speedMult}x`,
        `[*] battery ${m.batteryPct}% · thrusters ${m.thrusterTemp}°C`,
        `[*] nav mesh locked · trail FX armed`,
        `[*] camera zoom boost ${m.camBoost}u · blur ${m.blurCurve}`,
        "[ok] bay clear · approach vehicle to mount",
      ];
    case "sentry_terminal":
      return [
        `[sentry] terminal · ${node.label}`,
        `[*] project ${m.project} · env ${m.env}`,
        `[*] issues open ${m.openIssues} · unresolved ${m.unresolved}`,
        `[*] error rate ${m.errorRate}% · apdex ${m.apdex}`,
        `[*] last spike ${m.lastSpike}`,
        "[ok] unlock via [Z] PIN for live error stream",
      ];
    case "ip_diagnostic":
      return [
        `[ip] diagnostic · ${node.label}`,
        `[*] virtual IP ${m.virtualIp}`,
        `[*] latency p50 ${m.p50Ms}ms · p95 ${m.p95Ms}ms · p99 ${m.p99Ms}ms`,
        `[*] jitter ${m.jitterMs}ms · loss ${m.lossPct}%`,
        `[*] uplink ${m.uplink} · peers ${m.peers}`,
        "[ok] path healthy · ACL green",
      ];
    case "webhook_relay":
      return [
        `[webhook] relay · ${node.label}`,
        `[*] endpoint ${m.endpoint}`,
        `[*] last delivery ${m.lastDeliveryMs}ms ago · status ${m.statusCode}`,
        `[*] signature ${m.sigAlgo} · retries ${m.retries}`,
        `[*] queue depth ${m.queueDepth}`,
        "[ok] relay accepting traffic",
      ];
    case "llm_router_console":
      return [
        `[llm] router · ${node.label}`,
        `[*] pool ${m.pool} · fallback ${m.fallback}`,
        `[*] p95 ${m.p95Ms}ms · cache hit ${m.cacheHit}%`,
        `[*] tokens/min ${m.tokensPerMin} · budget ${m.budgetState}`,
        "[ok] failover path armed",
      ];
    case "vault_hsm":
      return [
        `[vault] HSM · ${node.label}`,
        `[*] seal ${m.seal} · rotation ${m.rotationDays}d`,
        `[*] tamper ${m.tamper} · FIPS ${m.fips}`,
        `[*] keys active ${m.keysActive}`,
        "[ok] core sealed",
      ];
    case "quantum_tpu":
      return [
        `[tpu] quantum cluster · ${node.label}`,
        `[*] cores ${m.cores} · coherence ${m.coherence}`,
        `[*] cryo ${m.cryo} · queue ${m.queue}`,
        "[ok] cluster accepting kernels",
      ];
    case "git_ops_terminal":
      return [
        `[git] ops terminal · ${node.label}`,
        `[*] repo ${m.repo} · ref ${m.ref}`,
        `[*] sandbox jail · secrets scoped`,
        `[*] pipeline ${m.pipeline}`,
        "[ok] await command",
      ];
    case "teletraffic_probe":
      return [
        `[tele] probe · ${node.label}`,
        `[*] region ${m.region} · asn ${m.asn}`,
        `[*] rtt ${m.rttMs}ms · loss ${m.lossPct}%`,
        `[*] samples ${m.samples}`,
        "[ok] probe mesh online",
      ];
    default:
      return [
        `[node] ${node.label}`,
        `[*] id ${node.id}`,
        `[*] access ${node.access}`,
        "[ok] telemetry attached",
      ];
  }
}

function sentryLines(
  telemetry: SentryTelemetryPayload | Record<string, unknown> | null | undefined
): string[] | null {
  if (!telemetry || typeof telemetry !== "object") return null;
  const issues = (telemetry as SentryTelemetryPayload).issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    const summary = (telemetry as SentryTelemetryPayload).summary;
    if (typeof summary === "string") {
      return [`[sentry] live · ${summary}`, "[*] no open issues in window"];
    }
    return null;
  }
  const out = ["[sentry] live error stream · unlocked"];
  for (const issue of issues.slice(0, 10)) {
    out.push(
      `[!] ${issue.level ?? "error"} · ${issue.title ?? issue.id ?? "issue"} · n=${issue.count ?? "?"}`
    );
  }
  return out;
}

/**
 * Unique system-tool dialog per interactive hardware node.
 * Zero duplicate copy — metrics are node-specific.
 */
export default function NodeToolOverlay({
  node,
  onClose,
  sentryTelemetry,
}: NodeToolOverlayProps) {
  const live = sentryLines(sentryTelemetry);
  const lines =
    live &&
    (node.dialogKind === "sentry_terminal" || node.requiresPin)
      ? live
      : linesFor(node);

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[#00ffaa]/25 bg-gradient-to-b from-slate-950 via-zinc-900 to-emerald-950/40 shadow-[0_0_48px_rgba(0,255,170,0.16)] backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-bio-moss/40 px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/80">
              {node.dialogKind.replace(/_/g, " ")} · {node.access}
            </p>
            <h3 className="truncate text-sm font-semibold text-white">
              {node.label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Close tool overlay"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <pre className="terminal-scroll max-h-56 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-[#00ffaa]/90">
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export type { NodeDialogKind };
