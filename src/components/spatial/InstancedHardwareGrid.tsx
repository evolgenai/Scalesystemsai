"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { InstancedMesh } from "three";

const BIO_GREEN = "#00ffaa";
const EMERALD = "#10b981";
const GUNMETAL = "#13191c";
const MOSS = "#152e24";

const INTERACT_RADIUS = 3.2;
const WORLD_EXTENT = 250;
const TOTAL_INSTANCES = 160;
/** ≥80% interactive proximity nodes */
const INTERACTIVE_RATIO = 0.82;
/** ~30% of interactive nodes require PIN ([Z]) */
const PIN_LOCKED_RATIO = 0.3;

export type HardwareKind =
  | "server_rack"
  | "cyber_console"
  | "diagnostic_router"
  | "terminal";

export type HardwareAccess = "public" | "admin" | "superadmin";

export type NodeDialogKind =
  | "sse_stream_analyzer"
  | "sandbox_executor"
  | "database_shard_monitor"
  | "cyber_rover_drive"
  | "sentry_terminal"
  | "meta_sre"
  | "ip_diagnostic"
  | "webhook_relay"
  | "llm_router_console"
  | "vault_hsm"
  | "quantum_tpu"
  | "git_ops_terminal"
  | "teletraffic_probe";

export type NodeMetrics = Record<string, string | number>;

export type HardwareInteractable = {
  id: string;
  kind: HardwareKind;
  label: string;
  position: [number, number, number];
  height: number;
  access: HardwareAccess;
  requiresPin: boolean;
  interactive: boolean;
  dialogKind: NodeDialogKind;
  metrics: NodeMetrics;
};

export type InstancedHardwareGridProps = {
  avatarPosRef: MutableRefObject<THREE.Vector3>;
  onNearestInteractable?: (node: HardwareInteractable | null) => void;
  onInteract?: (node: HardwareInteractable) => void;
  /** [Z] when near PIN-locked node */
  onPinRequest?: (node: HardwareInteractable) => void;
  locked?: boolean;
  highlightId?: string | null;
};

type ScatterSlot = HardwareInteractable & {
  yaw: number;
  scale: [number, number, number];
};

const DIALOG_CYCLE: NodeDialogKind[] = [
  "sse_stream_analyzer",
  "sandbox_executor",
  "database_shard_monitor",
  "cyber_rover_drive",
  "webhook_relay",
  "llm_router_console",
  "vault_hsm",
  "quantum_tpu",
  "git_ops_terminal",
  "teletraffic_probe",
  "ip_diagnostic",
  "sentry_terminal",
];

const LABEL_PREFIX: Record<NodeDialogKind, string> = {
  sse_stream_analyzer: "SSE Stream Analyzer",
  sandbox_executor: "Sandbox Executor",
  database_shard_monitor: "Database Shard Monitor",
  cyber_rover_drive: "CyberRover 2x Drive",
  sentry_terminal: "Sentry Terminal",
  meta_sre: "Meta-SRE Memory Core",
  ip_diagnostic: "IP Diagnostic Node",
  webhook_relay: "Webhook Relay",
  llm_router_console: "LLM Router Console",
  vault_hsm: "Vault HSM Core",
  quantum_tpu: "Quantum TPU Bay",
  git_ops_terminal: "GitOps Terminal",
  teletraffic_probe: "Teletraffic Probe",
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function kindScale(
  kind: HardwareKind,
  rand: () => number
): [number, number, number] {
  switch (kind) {
    case "server_rack":
      return [0.95 + rand() * 0.25, 2.4 + rand() * 1.6, 0.75 + rand() * 0.2];
    case "cyber_console":
      return [1.4 + rand() * 0.4, 1.0 + rand() * 0.45, 0.8 + rand() * 0.2];
    case "diagnostic_router":
      return [0.7 + rand() * 0.25, 1.5 + rand() * 0.7, 0.7 + rand() * 0.25];
    default:
      return [1.0 + rand() * 0.3, 1.6 + rand() * 0.6, 0.65 + rand() * 0.2];
  }
}

function kindForDialog(d: NodeDialogKind): HardwareKind {
  if (d === "database_shard_monitor" || d === "vault_hsm" || d === "quantum_tpu")
    return "server_rack";
  if (d === "ip_diagnostic" || d === "teletraffic_probe" || d === "webhook_relay")
    return "diagnostic_router";
  if (
    d === "sse_stream_analyzer" ||
    d === "llm_router_console" ||
    d === "meta_sre"
  )
    return "cyber_console";
  return "terminal";
}

function buildMetrics(
  dialogKind: NodeDialogKind,
  index: number,
  rand: () => number
): NodeMetrics {
  const n = index + 1;
  switch (dialogKind) {
    case "sse_stream_analyzer":
      return {
        channelId: `ch-${1000 + n}`,
        lastEventId: `${9000 + n}`,
        reconnects: Math.floor(rand() * 4),
        dropRate: Number((rand() * 1.2).toFixed(2)),
        throughputRps: Number((8 + rand() * 40).toFixed(1)),
        bufferDepth: Math.floor(12 + rand() * 80),
        heartbeatMs: Math.floor(800 + rand() * 2200),
      };
    case "sandbox_executor":
      return {
        runtime: n % 2 ? "node:20" : "python:3.12",
        jail: "e2b-lite",
        cpuPct: Math.floor(8 + rand() * 55),
        memMb: Math.floor(128 + rand() * 512),
        wallMs: Math.floor(40 + rand() * 900),
        netPolicy: "deny-egress",
        fsPolicy: "tmp-rw",
        exitCode: 0,
        artifacts: Math.floor(rand() * 6),
      };
    case "database_shard_monitor":
      return {
        shardId: `sh-${(n % 16).toString().padStart(2, "0")}`,
        replica: n % 3 === 0 ? "primary" : `replica-${(n % 3) + 1}`,
        qps: Math.floor(40 + rand() * 400),
        p95Ms: Number((2 + rand() * 28).toFixed(1)),
        lockWaits: Math.floor(rand() * 5),
        cacheHit: Number((88 + rand() * 11).toFixed(1)),
        bloatPct: Number((rand() * 8).toFixed(1)),
        replLagMs: Number((rand() * 40).toFixed(1)),
        vacuumState: n % 4 === 0 ? "running" : "idle",
      };
    case "cyber_rover_drive":
      return {
        speedMult: 2,
        batteryPct: Math.floor(55 + rand() * 40),
        thrusterTemp: Math.floor(38 + rand() * 40),
        camBoost: 4.5,
        blurCurve: "velocity",
      };
    case "sentry_terminal":
      return {
        project: "scalesystems",
        env: n % 2 ? "production" : "staging",
        openIssues: Math.floor(2 + rand() * 18),
        unresolved: Math.floor(1 + rand() * 12),
        errorRate: Number((rand() * 2.5).toFixed(2)),
        apdex: Number((0.86 + rand() * 0.12).toFixed(3)),
        lastSpike: `${Math.floor(rand() * 40)}m ago`,
      };
    case "meta_sre":
      return {
        agent: "meta-sre",
        healBudget: `${4 - (n % 4)}/5`,
        patchesToday: Math.floor(2 + rand() * 9),
        memoryDepth: Math.floor(12 + rand() * 40),
        lastRecall: `${Math.floor(rand() * 12)}m ago`,
        feedSource: "agent-memory",
      };
    case "ip_diagnostic":
      return {
        virtualIp: `10.${40 + (n % 20)}.${n % 256}.${2 + (n % 200)}`,
        p50Ms: Number((2 + rand() * 8).toFixed(1)),
        p95Ms: Number((8 + rand() * 18).toFixed(1)),
        p99Ms: Number((14 + rand() * 30).toFixed(1)),
        jitterMs: Number((rand() * 2).toFixed(2)),
        lossPct: Number((rand() * 0.4).toFixed(2)),
        uplink: "1Gbps",
        peers: 2 + (n % 5),
      };
    case "webhook_relay":
      return {
        endpoint: `/api/v1/webhooks/wh_${n.toString(16)}`,
        lastDeliveryMs: Math.floor(rand() * 5000),
        statusCode: 200,
        sigAlgo: "sha256",
        retries: Math.floor(rand() * 3),
        queueDepth: Math.floor(rand() * 24),
      };
    case "llm_router_console":
      return {
        pool: "gpt·claude·gemini",
        fallback: "gpt-mini",
        p95Ms: Math.floor(200 + rand() * 400),
        cacheHit: Math.floor(40 + rand() * 40),
        tokensPerMin: Math.floor(800 + rand() * 4000),
        budgetState: "green",
      };
    case "vault_hsm":
      return {
        seal: "AES-GCM",
        rotationDays: 90,
        tamper: "clear",
        fips: "140-2",
        keysActive: 4 + (n % 12),
      };
    case "quantum_tpu":
      return {
        cores: 32 + (n % 8) * 8,
        coherence: Number((0.97 + rand() * 0.02).toFixed(3)),
        cryo: "stable",
        queue: Math.floor(rand() * 5),
      };
    case "git_ops_terminal":
      return {
        repo: n % 2 ? "scalesystems/swarm" : "scalesystems/sre",
        ref: `main@${(1000 + n).toString(16)}`,
        pipeline: n % 3 === 0 ? "deploy" : "lint",
      };
    case "teletraffic_probe":
      return {
        region: ["iad", "fra", "sjc", "sin"][n % 4]!,
        asn: 13335 + (n % 40),
        rttMs: Number((8 + rand() * 60).toFixed(1)),
        lossPct: Number((rand() * 0.5).toFixed(2)),
        samples: Math.floor(200 + rand() * 800),
      };
    default:
      return { index: n };
  }
}

/** Deterministic 100+ scatter; 80%+ interactive with unique metrics. */
export function generateHardwareScatter(seed = 48_001): ScatterSlot[] {
  const rand = mulberry32(seed);
  const slots: ScatterSlot[] = [];
  const usedLabels = new Set<string>();

  const pushUnique = (slot: ScatterSlot) => {
    let label = slot.label;
    let guard = 0;
    while (usedLabels.has(label) && guard < 40) {
      guard++;
      label = `${slot.label} · ${slot.id.slice(-4)}`;
    }
    usedLabels.add(label);
    slots.push({ ...slot, label });
  };

  // Anchor specials
  pushUnique({
    id: "sentry-log-ws",
    kind: "terminal",
    dialogKind: "sentry_terminal",
    label: "Sentry Log Workstation",
    position: [18.5, 0, -4.2],
    yaw: -0.6,
    scale: [1.15, 2.35, 0.75],
    interactive: true,
    access: "superadmin",
    requiresPin: true,
    height: 2.4,
    metrics: buildMetrics("sentry_terminal", 0, rand),
  });
  pushUnique({
    id: "meta-sre-core",
    kind: "cyber_console",
    dialogKind: "meta_sre",
    label: "Meta-SRE Memory Core",
    position: [-10.2, 0, 9.8],
    yaw: 0.35,
    scale: [1.2, 2.5, 0.9],
    interactive: true,
    access: "superadmin",
    requiresPin: true,
    height: 2.55,
    metrics: buildMetrics("meta_sre", 0, rand),
  });
  pushUnique({
    id: "ip-network-diag",
    kind: "diagnostic_router",
    dialogKind: "ip_diagnostic",
    label: "IP Network Diagnostic Node",
    position: [-19.2, 0, 5.4],
    yaw: 1.1,
    scale: [0.85, 2.0, 0.85],
    interactive: true,
    access: "admin",
    requiresPin: false,
    height: 2.1,
    metrics: buildMetrics("ip_diagnostic", 1, rand),
  });

  const avoid = [
    [0, 8],
    [-13.5, 11.5],
    [18.5, -4.2],
    [-10.2, 9.8],
    [-19.2, 5.4],
    [6.5, 10.5],
    [-8, -6],
    [7, -5],
    [-5, 5],
    [6, 4],
    [-16, 10],
  ] as const;

  let i = 0;
  let interactiveCount = 3;
  while (slots.length < TOTAL_INSTANCES && i < 9000) {
    i++;
    const x = (rand() - 0.5) * WORLD_EXTENT * 0.72;
    const z = (rand() - 0.5) * WORLD_EXTENT * 0.72;
    if (Math.hypot(x, z) < 8) continue;
    let blocked = false;
    for (const [ax, az] of avoid) {
      if (Math.hypot(x - ax, z - az) < 5) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    for (const s of slots) {
      if (Math.hypot(x - s.position[0], z - s.position[2]) < 3.0) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const idx = slots.length;
    const wantInteractive =
      interactiveCount / TOTAL_INSTANCES < INTERACTIVE_RATIO ||
      rand() < INTERACTIVE_RATIO;
    const dialogKind = DIALOG_CYCLE[idx % DIALOG_CYCLE.length]!;
    const kind = kindForDialog(dialogKind);
    const scale = kindScale(kind, rand);
    const interactive = wantInteractive;
    if (interactive) interactiveCount++;

    const pinLocked =
      interactive &&
      (dialogKind === "sentry_terminal" ||
        dialogKind === "meta_sre" ||
        rand() < PIN_LOCKED_RATIO);

    const unit = Math.floor(idx / DIALOG_CYCLE.length) + 1;
    const baseLabel = `${LABEL_PREFIX[dialogKind]} ${unit}-${(idx % 97) + 1}`;

    pushUnique({
      id: `hw-${dialogKind}-${idx}`,
      kind,
      dialogKind,
      label: baseLabel,
      position: [x, 0, z],
      yaw: rand() * Math.PI * 2,
      scale,
      interactive,
      access: pinLocked
        ? "superadmin"
        : dialogKind === "ip_diagnostic" || dialogKind === "vault_hsm"
          ? "admin"
          : "public",
      requiresPin: pinLocked,
      height: scale[1],
      metrics: buildMetrics(dialogKind, idx, rand),
    });
  }

  return slots;
}

/** Sparse proximity markers — only nearest + nearby interactive (perf). */
function InteractHighlight({
  node,
  active,
}: {
  node: HardwareInteractable;
  active: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current || !active) return;
    const t = clock.elapsedTime;
    ring.current.rotation.z = t * 1.2;
    const mat = ring.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.9 + Math.sin(t * 5) * 0.45;
  });

  if (!active) return null;

  const hint = node.requiresPin
    ? `[Z] PIN · ${node.label}`
    : `Press [E] to Interact · ${node.label}`;

  return (
    <group position={[node.position[0], node.height * 0.55, node.position[2]]}>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.15, 0.04, 8, 40]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={BIO_GREEN}
          emissiveIntensity={0.85}
          metalness={0.7}
          roughness={0.2}
          transparent
          opacity={0.95}
        />
      </mesh>
      <Html center distanceFactor={9} zIndexRange={[50, 0]}>
        <div className="pointer-events-none max-w-[16rem] truncate whitespace-nowrap rounded-md border border-[#00ffaa]/45 bg-[#0a0e12]/92 px-3 py-1.5 font-mono text-[11px] font-semibold text-[#00ffaa] shadow-[0_0_28px_rgba(0,255,170,0.35)] backdrop-blur-md">
          {hint}
        </div>
      </Html>
    </group>
  );
}

function InstancedScatterMesh({ slots }: { slots: ScatterSlot[] }) {
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mesh = useRef<InstancedMesh>(null);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      dummy.position.set(s.position[0], s.scale[1] * 0.5, s.position[2]);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.scale[0], s.scale[1], s.scale[2]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (s.requiresPin) c.set(BIO_GREEN);
      else if (s.interactive) c.set(MOSS);
      else if (s.kind === "server_rack") c.set(GUNMETAL);
      else c.set("#1a2428");
      m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [slots]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geo, undefined, slots.length]}
      castShadow
      receiveShadow
      frustumCulled
    >
      <meshStandardMaterial
        color="#1a2428"
        metalness={0.94}
        roughness={0.2}
        emissive={EMERALD}
        emissiveIntensity={0.06}
        envMapIntensity={1.15}
      />
    </instancedMesh>
  );
}

/**
 * GPU-instanced IT scatter — single draw call + modular highlight/metrics.
 * 80%+ interactive unique tool overlays; ~30% PIN-locked ([Z]).
 */
export default function InstancedHardwareGrid({
  avatarPosRef,
  onNearestInteractable,
  onInteract,
  onPinRequest,
  locked = false,
  highlightId = null,
}: InstancedHardwareGridProps) {
  const slots = useMemo(() => generateHardwareScatter(), []);
  const interactables = useMemo(
    () => slots.filter((s) => s.interactive),
    [slots]
  );

  const nearestRef = useRef<HardwareInteractable | null>(null);
  const [nearId, setNearId] = useState<string | null>(null);
  const probe = useRef(new THREE.Vector3());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!locked) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      const n = nearestRef.current;
      if (!n) return;

      if (e.code === "KeyZ" && n.requiresPin && onPinRequest) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onPinRequest(n);
        return;
      }
      if (e.code === "KeyE" && onInteract) {
        if (n.requiresPin && onPinRequest) {
          e.preventDefault();
          e.stopImmediatePropagation();
          onPinRequest(n);
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        onInteract(n);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [locked, onInteract, onPinRequest]);

  useFrame(() => {
    const pos = avatarPosRef.current;
    let best: HardwareInteractable | null = null;
    let bestD = INTERACT_RADIUS;
    for (const n of interactables) {
      probe.current.set(n.position[0], 0, n.position[2]);
      const d = Math.hypot(pos.x - probe.current.x, pos.z - probe.current.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    const nextId = best?.id ?? null;
    if ((nearestRef.current?.id ?? null) !== nextId) {
      nearestRef.current = best;
      setNearId(nextId);
      onNearestInteractable?.(best);
    }
  });

  const activeNode =
    interactables.find((n) => n.id === nearId || n.id === highlightId) ?? null;

  return (
    <group>
      <InstancedScatterMesh slots={slots} />
      {activeNode && locked ? (
        <InteractHighlight node={activeNode} active />
      ) : null}
    </group>
  );
}

export function getSpecialInteractables(): HardwareInteractable[] {
  return generateHardwareScatter().filter((s) => s.interactive);
}
