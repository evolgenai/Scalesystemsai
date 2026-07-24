"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import {
  Activity,
  Cpu,
  Database,
  Maximize2,
  Minimize2,
  Radio,
  Router,
  Shield,
  Terminal,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import RobotAvatar from "@/components/spatial/RobotAvatar";
import InstancedHardwareGrid, {
  type HardwareInteractable,
} from "@/components/spatial/InstancedHardwareGrid";
import AutomobileUnit, {
  DRIVE_SPEED_MULT,
} from "@/components/spatial/AutomobileUnit";
import TorNode from "@/components/spatial/TorNode";
import PinKeypadModal, {
  type PinVerifySuccess,
  type SentryTelemetryPayload,
} from "@/components/spatial/PinKeypadModal";
import NodeToolOverlay from "@/components/spatial/NodeToolOverlay";
import MetaSreTerminalModal from "@/components/spatial/MetaSreTerminalModal";
import SpatialCommandBar from "@/components/spatial/SpatialCommandBar";
import MobileTouchHud from "@/components/spatial/MobileTouchHud";
import SwarmAgentTopology from "@/components/spatial/SwarmAgentTopology";
import CelestialAgentMesh from "@/components/spatial/CelestialAgentMesh";
import DesertPlanetEnvironment from "@/components/spatial/DesertPlanetEnvironment";
import NodeAnomalyHalos from "@/components/spatial/NodeAnomalyHalos";
import RepairSubAgentDispatch from "@/components/spatial/RepairSubAgentDispatch";
import EdgeTerminalModal, {
  isEdgeWorkstation,
} from "@/components/spatial/EdgeTerminalModal";
import PredictiveHealthChip from "@/components/spatial/PredictiveHealthChip";
import { useStreamEngine } from "@/components/spatial/StreamEngineContext";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";
import type { ParsedSpatialCommand } from "@/lib/spatial/commandParser";
import { requestCameraFocus } from "@/lib/spatial/touchInput";
import ObjectMorpher, {
  type CompositeSuite,
  type MorphNode,
  EMERALD,
  EMERALD_DEEP,
  CYAN,
  AMBER,
} from "@/components/spatial/ObjectMorpher";
import WebGLErrorBoundary from "@/components/ui/WebGLErrorBoundary";

const YELLOW = "#facc15";
const PROXIMITY = 3;
const MORPH_PROX = 5.5;

function isMemoryHudNode(node: HardwareInteractable): boolean {
  return (
    node.dialogKind === "sentry_terminal" ||
    node.dialogKind === "meta_sre" ||
    node.id === "sentry-log-ws" ||
    node.id === "meta-sre-core" ||
    /meta-sre|sentry/i.test(node.label)
  );
}

type NodeKind =
  | "gas"
  | "swarm"
  | "vault"
  | "sre"
  | "webhook"
  | "software"
  | "hardware";

type TowerScript = {
  id: string;
  label: string;
  runtime: string;
  status: "idle" | "running" | "queued" | "healthy";
  lines: string[];
};

type TowerDef = {
  id: string;
  name: string;
  kind: NodeKind;
  status: string;
  position: [number, number, number];
  height: number;
  accent: string;
  category?: "software" | "hardware";
  script: TowerScript;
};

const TOWERS: TowerDef[] = [
  {
    id: "gas-obelisk",
    name: "Gas Metering Obelisk",
    kind: "gas",
    status: "Metering live",
    position: [-8, 0, -6],
    height: 5.4,
    accent: YELLOW,
    script: {
      id: "gas-pulse",
      label: "⚡ GAS · credit pulse",
      runtime: "billing-meter-01",
      status: "running",
      lines: [
        "[gas] claim window open · free tier active",
        "[*] burn rate 0.42 u/s · swarm-alpha",
        "[*] ceiling 10k · remaining 7.8k",
        "[ok] EMERALD path · recharge ready",
      ],
    },
  },
  {
    id: "swarm-monoliths",
    name: "Swarm Agent Monoliths",
    kind: "swarm",
    status: "3 agents linked",
    position: [7, 0, -5],
    height: 3.8,
    accent: CYAN,
    script: {
      id: "swarm-mesh",
      label: "router ↔ worker mesh",
      runtime: "swarm-kernel-04",
      status: "running",
      lines: [
        "[swarm] router online · 3 workers bonded",
        "[*] cable sync · emerald pulse 42ms",
        "[*] scraper · sandbox · content",
        "[ok] mesh coherence 0.97",
      ],
    },
  },
  {
    id: "db-vault",
    name: "Database Vault Sphere",
    kind: "vault",
    status: "Encrypted",
    position: [0, 0, 8],
    height: 4.2,
    accent: EMERALD,
    script: {
      id: "vault-orb",
      label: "encrypted glass orb",
      runtime: "neon-vault-02",
      status: "healthy",
      lines: [
        "[vault] AES-GCM envelope · tenant scoped",
        "[*] particles: 64 · hover drift",
        "[*] replicas: primary + branch",
        "[ok] seal intact · zero egress spikes",
      ],
    },
  },
  {
    id: "sre-beacon",
    name: "SRE Health Beacon",
    kind: "sre",
    status: "Radar clear",
    position: [-5, 0, 5],
    height: 6.0,
    accent: EMERALD,
    script: {
      id: "sre-radar",
      label: "latency · error · heal",
      runtime: "meta-sre-deck",
      status: "healthy",
      lines: [
        "[sre] radar sweep · 360° EMERALD",
        "[*] p95 38ms · err 0.02%",
        "[*] heal budget 4/5 remaining",
        "[ok] signal tower nominal",
      ],
    },
  },
  {
    id: "webhook-relay",
    name: "Inbound Webhook Relay",
    kind: "webhook",
    status: "Listening",
    position: [6, 0, 4],
    height: 4.6,
    accent: CYAN,
    script: {
      id: "wh-relay",
      label: "terminal portal · inbound",
      runtime: "edge-webhook-09",
      status: "running",
      lines: [
        "[webhook] POST /api/v1/webhooks/wh_…",
        "[*] signature verify · sha256 ok",
        "[*] last payload 1.2s ago",
        "[ok] relay portal accepting traffic",
      ],
    },
  },
  // —— Software pods ——
  {
    id: "web-scraper",
    name: "Web Scraper Pod",
    kind: "software",
    category: "software",
    status: "Harvesting",
    position: [-12, 0, 2],
    height: 3.2,
    accent: CYAN,
    script: {
      id: "scraper",
      label: "web-scraper · crawl mesh",
      runtime: "scraper-pod-07",
      status: "running",
      lines: [
        "[scraper] 14 targets · rate 2.1 rps",
        "[*] stealth headers · rotate UA",
        "[*] queue depth 38",
        "[ok] extract pipeline warm",
      ],
    },
  },
  {
    id: "llm-router",
    name: "LLM Router",
    kind: "software",
    category: "software",
    status: "Routing",
    position: [-10, 0, -10],
    height: 3.6,
    accent: EMERALD,
    script: {
      id: "llm-rtr",
      label: "model · route · fallback",
      runtime: "llm-router-03",
      status: "running",
      lines: [
        "[llm] gpt · claude · gemini pool",
        "[*] p95 410ms · cache hit 62%",
        "[*] token budget green",
        "[ok] failover path armed",
      ],
    },
  },
  {
    id: "blackeye",
    name: "GitHub Script · blackeye",
    kind: "software",
    category: "software",
    status: "Terminal live",
    position: [11, 0, -9],
    height: 3.0,
    accent: AMBER,
    script: {
      id: "blackeye",
      label: "github · blackeye",
      runtime: "gh-script-blackeye",
      status: "running",
      lines: [
        "[blackeye] repo sync · main@a4f2",
        "[*] sandbox jail · net deny",
        "[*] stdout pipe → swarm",
        "[ok] script terminal ready",
      ],
    },
  },
  {
    id: "recon-agent",
    name: "GitHub Script · recon-agent",
    kind: "software",
    category: "software",
    status: "Scanning",
    position: [13, 0, 1],
    height: 3.1,
    accent: EMERALD,
    script: {
      id: "recon",
      label: "github · recon-agent",
      runtime: "gh-script-recon",
      status: "running",
      lines: [
        "[recon] surface map · 9 endpoints",
        "[*] CVE feed · quiet",
        "[*] report → vault",
        "[ok] agent heartbeat ok",
      ],
    },
  },
  {
    id: "slack-bot",
    name: "GitHub Script · slack-bot",
    kind: "software",
    category: "software",
    status: "Listening",
    position: [9, 0, 9],
    height: 2.9,
    accent: CYAN,
    script: {
      id: "slack",
      label: "github · slack-bot",
      runtime: "gh-script-slack",
      status: "healthy",
      lines: [
        "[slack] socket mode · connected",
        "[*] slash /deploy · /status",
        "[*] channel #ops-swarm",
        "[ok] bot online",
      ],
    },
  },
  {
    id: "github-terminal",
    name: "GitHub Script Terminal",
    kind: "software",
    category: "software",
    status: "Shell ready",
    position: [-3, 0, -12],
    height: 3.4,
    accent: EMERALD_DEEP,
    script: {
      id: "gh-term",
      label: "github script terminal",
      runtime: "gh-terminal-01",
      status: "idle",
      lines: [
        "[term] clone · run · stream logs",
        "[*] secrets injected · scoped",
        "[*] artifacts → object storage",
        "[ok] await command",
      ],
    },
  },
  // —— Hardware nodes ——
  {
    id: "quantum-tpu",
    name: "Quantum TPU Cluster",
    kind: "hardware",
    category: "hardware",
    status: "Qubits warm",
    position: [3, 0, -14],
    height: 4.8,
    accent: EMERALD,
    script: {
      id: "qtpu",
      label: "quantum TPU cluster",
      runtime: "hw-quantum-tpu",
      status: "healthy",
      lines: [
        "[tpu] 64 cores · coherence 0.991",
        "[*] cryo loop stable",
        "[*] job queue 2",
        "[ok] cluster accepting kernels",
      ],
    },
  },
  {
    id: "vault-core",
    name: "Encrypted Vault Core",
    kind: "hardware",
    category: "hardware",
    status: "Sealed",
    position: [-14, 0, -3],
    height: 4.0,
    accent: EMERALD,
    script: {
      id: "vault-hw",
      label: "encrypted vault core",
      runtime: "hw-vault-core",
      status: "healthy",
      lines: [
        "[vault] HSM envelope · FIPS",
        "[*] key rotation · 90d",
        "[*] tamper sensors clear",
        "[ok] core sealed",
      ],
    },
  },
  {
    id: "edge-router",
    name: "Edge Router Node",
    kind: "hardware",
    category: "hardware",
    status: "Forwarding",
    position: [14, 0, 7],
    height: 3.7,
    accent: CYAN,
    script: {
      id: "edge",
      label: "edge router node",
      runtime: "hw-edge-router",
      status: "running",
      lines: [
        "[edge] BGP peer · 3 uplinks",
        "[*] latency 12ms · jitter 0.4",
        "[*] ACL deny 0 hits",
        "[ok] packets flowing",
      ],
    },
  },
];

const WEBGL_FORCE_KEY = "scalesystems.spatial.forceWebgl";

type WebGLProbeResult = {
  ok: boolean;
  backend: "webgl2" | "webgl" | "experimental-webgl" | null;
};

/**
 * Soft WebGL probe — tries WebGL2 → WebGL → experimental with
 * failIfMajorPerformanceCaveat: false so software rasterizers can pass.
 */
function probeWebGL(): WebGLProbeResult {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, backend: null };
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const softAttrs: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "default",
      preserveDrawingBuffer: false,
    };
    const candidates: Array<"webgl2" | "webgl" | "experimental-webgl"> = [
      "webgl2",
      "webgl",
      "experimental-webgl",
    ];
    for (const id of candidates) {
      // Soft pass: attrs → attrs-only caveat false → bare context
      const tries: Array<WebGLContextAttributes | undefined> = [
        softAttrs,
        { failIfMajorPerformanceCaveat: false },
        undefined,
      ];
      for (const attrs of tries) {
        const gl = attrs
          ? canvas.getContext(id, attrs)
          : canvas.getContext(id);
        if (
          gl &&
          typeof (gl as WebGLRenderingContext).getParameter === "function"
        ) {
          try {
            const ext = (gl as WebGLRenderingContext).getExtension?.(
              "WEBGL_lose_context"
            );
            ext?.loseContext();
          } catch {
            /* ignore lose */
          }
          return { ok: true, backend: id };
        }
      }
    }
    return { ok: false, backend: null };
  } catch {
    return { ok: false, backend: null };
  }
}

function supportsWebGL(): boolean {
  return probeWebGL().ok;
}

function readForceWebglFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(WEBGL_FORCE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeForceWebglFlag(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.sessionStorage.setItem(WEBGL_FORCE_KEY, "1");
    else window.sessionStorage.removeItem(WEBGL_FORCE_KEY);
  } catch {
    /* ignore */
  }
}

/** 2D bio-metallic grid when WebGL is truly unavailable. */
function Spatial2DGridFallback({
  onForceLoad,
}: {
  onForceLoad: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? 640;
      const h = parent?.clientHeight ?? 420;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      if (!running) return;
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? 640;
      const h = parent?.clientHeight ?? 420;
      const pulse = 0.45 + Math.sin(t * 0.0018) * 0.2;

      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#050807");
      g.addColorStop(0.45, "#0b120f");
      g.addColorStop(1, "#121e18");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // vignette
      const vg = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        h * 0.1,
        w * 0.5,
        h * 0.5,
        h * 0.75
      );
      vg.addColorStop(0, "rgba(0,255,170,0.06)");
      vg.addColorStop(1, "rgba(5,8,7,0.85)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      const spacing = 28;
      const offset = (t * 0.02) % spacing;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(0,255,170,${0.08 + pulse * 0.1})`;
      ctx.beginPath();
      for (let x = -spacing + offset; x < w + spacing; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -spacing + offset * 0.6; y < h + spacing; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // perspective floor lines
      ctx.strokeStyle = `rgba(0,255,170,${0.18 + pulse * 0.15})`;
      ctx.beginPath();
      const horizon = h * 0.38;
      const vanishingX = w * 0.5;
      for (let i = -8; i <= 8; i++) {
        ctx.moveTo(vanishingX, horizon);
        ctx.lineTo(vanishingX + i * w * 0.12, h);
      }
      for (let i = 0; i < 10; i++) {
        const y = horizon + ((h - horizon) * i) / 9;
        const spread = ((y - horizon) / (h - horizon)) * w * 0.55;
        ctx.moveTo(vanishingX - spread, y);
        ctx.lineTo(vanishingX + spread, y);
      }
      ctx.stroke();

      // biolum nodes
      const nodes = [
        [0.22, 0.55],
        [0.5, 0.48],
        [0.78, 0.58],
        [0.35, 0.72],
        [0.65, 0.7],
      ] as const;
      for (const [nx, ny] of nodes) {
        const x = w * nx;
        const y = h * ny;
        const r = 4 + Math.sin(t * 0.004 + nx * 8) * 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,170,${0.06 + pulse * 0.05})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#00ffaa";
        ctx.fill();
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden bg-[#050807]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(5,8,7,0.55)_100%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="max-w-md font-mono text-[11px] uppercase tracking-wider text-[#00ffaa]/80">
          2d bio-metallic fallback
        </p>
        <p className="max-w-sm text-sm text-slate-muted">
          WebGL probe failed on this device. Spatial viewport is showing a 2D
          grid until a GPU context is available.
        </p>
        <button
          type="button"
          onClick={onForceLoad}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-[#00ffaa]/40 bg-[#00ffaa]/15 px-4 py-2.5 font-mono text-[11px] font-semibold text-[#00ffaa] shadow-[0_0_24px_rgba(0,255,170,0.15)] transition hover:bg-[#00ffaa]/25"
        >
          Force Load Canvas
        </button>
        <p className="font-mono text-[9px] text-slate-dim">
          Bypass WebGL check · may use software rendering
        </p>
      </div>
    </div>
  );
}

function HudTooltip({
  name,
  status,
  accent,
  visible,
}: {
  name: string;
  status: string;
  accent: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none whitespace-nowrap rounded-lg border border-white/15 bg-[#040907]/90 px-2.5 py-1.5 shadow-[0_0_24px_rgba(16,185,129,0.2)] backdrop-blur-md"
      style={{ borderColor: `${accent}55` }}
    >
      <p className="font-mono text-[10px] font-semibold text-white">{name}</p>
      <p className="mt-0.5 font-mono text-[9px]" style={{ color: accent }}>
        {status} · click to inspect
      </p>
    </div>
  );
}

function GenericNodeMesh({
  tower,
  active,
  hovered,
  onHover,
  onInspect,
  hidden,
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  hidden?: boolean;
}) {
  const body = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (body.current) {
      body.current.position.y =
        tower.height / 2 + Math.sin(t * 1.4 + tower.position[0]) * 0.08;
      body.current.rotation.y = t * 0.35;
    }
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity =
        (active || hovered ? 1.1 : 0.55) + Math.sin(t * 3) * 0.2;
    }
  });

  if (hidden) return null;

  const isHw = tower.category === "hardware";

  return (
    <group
      position={tower.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(tower.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect(tower);
      }}
    >
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.4, 0.55, 0.4, isHw ? 6 : 12]} />
        <meshStandardMaterial
          color="#040907"
          metalness={0.88}
          roughness={0.22}
          emissive={tower.accent}
          emissiveIntensity={active || hovered ? 0.35 : 0.12}
        />
      </mesh>
      <mesh ref={body} castShadow>
        {isHw ? (
          <boxGeometry args={[1.1, tower.height * 0.7, 1.1]} />
        ) : (
          <octahedronGeometry args={[0.75, 0]} />
        )}
        <meshStandardMaterial
          color="#0b1a14"
          metalness={0.9}
          roughness={0.18}
          emissive={tower.accent}
          emissiveIntensity={active || hovered ? 0.55 : 0.22}
        />
      </mesh>
      <mesh ref={glow} position={[0, tower.height * 0.85, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial
          color={tower.accent}
          emissive={tower.accent}
          emissiveIntensity={1}
        />
      </mesh>
      <Html position={[0, tower.height + 0.9, 0]} center distanceFactor={12}>
        <HudTooltip
          name={tower.name}
          status={`${tower.category ?? tower.kind} · ${tower.status}`}
          accent={tower.accent}
          visible={hovered || active}
        />
      </Html>
    </group>
  );
}

function GasObelisk({
  tower,
  active,
  hovered,
  onHover,
  onInspect,
  hidden,
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  hidden?: boolean;
}) {
  const core = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      const s = 1 + Math.sin(t * 3.2) * 0.06;
      core.current.scale.set(1, s, 1);
    }
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.35;
    }
  });

  if (hidden) return null;

  return (
    <group
      position={tower.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(tower.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect(tower);
      }}
    >
      <mesh position={[0, tower.height / 2, 0]} castShadow>
        <boxGeometry args={[0.85, tower.height, 0.85]} />
        <meshStandardMaterial
          color="#040907"
          metalness={0.9}
          roughness={0.2}
          emissive={AMBER}
          emissiveIntensity={active || hovered ? 0.4 : 0.15}
        />
      </mesh>
      <mesh ref={glow} position={[0, tower.height + 0.2, 0]}>
        <boxGeometry args={[1.05, 0.35, 1.05]} />
        <meshStandardMaterial
          color={YELLOW}
          emissive={YELLOW}
          emissiveIntensity={0.9}
          metalness={0.3}
          roughness={0.35}
        />
      </mesh>
      <mesh ref={core} position={[0, tower.height * 0.55, 0]}>
        <boxGeometry args={[0.35, tower.height * 0.7, 0.35]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={active || hovered ? 1.4 : 0.7}
          transparent
          opacity={0.85}
        />
      </mesh>
      <Html position={[0, tower.height + 1.1, 0]} center distanceFactor={12}>
        <HudTooltip
          name={tower.name}
          status={`⚡ GAS · ${tower.status}`}
          accent={YELLOW}
          visible={hovered || active}
        />
      </Html>
    </group>
  );
}

function SwarmMonoliths({
  tower,
  active,
  hovered,
  onHover,
  onInspect,
  hidden,
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  hidden?: boolean;
}) {
  const group = useRef<Group>(null);
  const offsets = useMemo(
    () =>
      [
        [-1.1, 1.4, 0],
        [1.1, 1.9, 0.4],
        [0, 2.6, -0.9],
      ] as [number, number, number][],
    []
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      if (i >= 3) return;
      child.position.y = offsets[i]![1] + Math.sin(t * 1.5 + i) * 0.15;
      child.rotation.y = t * (0.4 + i * 0.1);
    });
  });

  if (hidden) return null;

  return (
    <group
      position={tower.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(tower.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect(tower);
      }}
    >
      <group ref={group}>
        {offsets.map((p, i) => (
          <mesh key={i} position={p} castShadow>
            <boxGeometry args={[0.9, 0.9, 0.9]} />
            <meshStandardMaterial
              color="#040907"
              metalness={0.95}
              roughness={0.15}
              emissive={CYAN}
              emissiveIntensity={active || hovered ? 0.45 : 0.18}
            />
          </mesh>
        ))}
      </group>
      {[
        [offsets[0]!, offsets[1]!],
        [offsets[1]!, offsets[2]!],
        [offsets[2]!, offsets[0]!],
      ].map(([a, b], i) => {
        const mid: [number, number, number] = [
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          (a[2] + b[2]) / 2,
        ];
        const len = new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
        const dir = new THREE.Vector3(
          b[0] - a[0],
          b[1] - a[1],
          b[2] - a[2]
        ).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir
        );
        return (
          <mesh key={`cable-${i}`} position={mid} quaternion={quat}>
            <cylinderGeometry args={[0.025, 0.025, len, 6]} />
            <meshBasicMaterial color={CYAN} transparent opacity={0.55} />
          </mesh>
        );
      })}
      <Html position={[0, 4.2, 0]} center distanceFactor={12}>
        <HudTooltip
          name={tower.name}
          status={tower.status}
          accent={CYAN}
          visible={hovered || active}
        />
      </Html>
    </group>
  );
}

function VaultSphere({
  tower,
  active,
  hovered,
  onHover,
  onInspect,
  hidden,
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  hidden?: boolean;
}) {
  const orb = useRef<Mesh>(null);
  const particles = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 48;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 1.4 + Math.random() * 0.6;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) + 2.4;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const pMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: EMERALD,
        size: 0.06,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    []
  );
  const pts = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (orb.current) {
      orb.current.rotation.y = t * 0.35;
      orb.current.position.y = 2.4 + Math.sin(t * 1.2) * 0.12;
    }
    if (pts.current) pts.current.rotation.y = t * 0.25;
  });

  if (hidden) return null;

  return (
    <group
      position={tower.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(tower.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect(tower);
      }}
    >
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 0.7, 16]} />
        <meshStandardMaterial color="#040907" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh ref={orb} position={[0, 2.4, 0]}>
        <sphereGeometry args={[1.05, 32, 32]} />
        <meshPhysicalMaterial
          color="#6EE7B7"
          emissive={EMERALD}
          emissiveIntensity={active || hovered ? 0.55 : 0.25}
          metalness={0.1}
          roughness={0.08}
          transmission={0.55}
          thickness={0.6}
          transparent
          opacity={0.88}
        />
      </mesh>
      <points ref={pts} geometry={particles} material={pMat} />
      <Html position={[0, 4.3, 0]} center distanceFactor={12}>
        <HudTooltip
          name={tower.name}
          status={tower.status}
          accent={EMERALD}
          visible={hovered || active}
        />
      </Html>
    </group>
  );
}

function SreBeacon({
  tower,
  active,
  hovered,
  onHover,
  onInspect,
  hidden,
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  hidden?: boolean;
}) {
  const ring = useRef<Mesh>(null);
  const tip = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.z = t * 1.4;
      ring.current.rotation.x = Math.PI / 2;
    }
    if (tip.current) {
      const mat = tip.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.8 + Math.sin(t * 5) * 0.4;
    }
  });

  if (hidden) return null;

  return (
    <group
      position={tower.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(tower.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect(tower);
      }}
    >
      <mesh position={[0, tower.height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.45, tower.height, 12]} />
        <meshStandardMaterial
          color="#040907"
          metalness={0.85}
          roughness={0.25}
          emissive={EMERALD}
          emissiveIntensity={active || hovered ? 0.35 : 0.12}
        />
      </mesh>
      <mesh ref={tip} position={[0, tower.height + 0.25, 0]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={1}
        />
      </mesh>
      <mesh ref={ring} position={[0, tower.height * 0.72, 0]}>
        <torusGeometry args={[1.15, 0.04, 8, 48]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={0.85}
          transparent
          opacity={0.75}
        />
      </mesh>
      <mesh position={[0, tower.height * 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.75, 0.03, 6, 32]} />
        <meshBasicMaterial color={EMERALD} transparent opacity={0.35} />
      </mesh>
      <Html position={[0, tower.height + 1.2, 0]} center distanceFactor={12}>
        <HudTooltip
          name={tower.name}
          status={tower.status}
          accent={EMERALD}
          visible={hovered || active}
        />
      </Html>
    </group>
  );
}

function WebhookRelay({
  tower,
  active,
  hovered,
  onHover,
  onInspect,
  hidden,
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  hidden?: boolean;
}) {
  const portal = useRef<Mesh>(null);
  const frame = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (portal.current) {
      const mat = portal.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.5 + Math.sin(t * 3.5) * 0.3;
      portal.current.rotation.y = Math.sin(t * 0.8) * 0.15;
    }
    if (frame.current) frame.current.rotation.y = t * 0.6;
  });

  if (hidden) return null;

  return (
    <group
      position={tower.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(tower.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect(tower);
      }}
    >
      <mesh position={[0, tower.height / 2, 0]} castShadow>
        <boxGeometry args={[1.4, tower.height, 0.55]} />
        <meshStandardMaterial
          color="#040907"
          metalness={0.88}
          roughness={0.22}
          emissive={CYAN}
          emissiveIntensity={active || hovered ? 0.3 : 0.1}
        />
      </mesh>
      <mesh ref={portal} position={[0, tower.height * 0.55, 0.32]}>
        <planeGeometry args={[0.95, 1.4]} />
        <meshStandardMaterial
          color="#022c22"
          emissive={CYAN}
          emissiveIntensity={0.7}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh
        ref={frame}
        position={[0, tower.height + 0.35, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.55, 0.04, 8, 32]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={0.9}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.1 + i * 1.05, 0.3]}>
          <planeGeometry args={[0.7, 0.22]} />
          <meshBasicMaterial
            color={CYAN}
            transparent
            opacity={active || hovered ? 0.5 : 0.2}
          />
        </mesh>
      ))}
      <Html position={[0, tower.height + 1.15, 0]} center distanceFactor={12}>
        <HudTooltip
          name={tower.name}
          status={tower.status}
          accent={CYAN}
          visible={hovered || active}
        />
      </Html>
    </group>
  );
}

function AmbientDrift() {
  const points = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 18 + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: CYAN,
        size: 0.045,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    []
  );
  const ref = useRef<THREE.Points>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.015;
  });
  return <points ref={ref} geometry={points} material={mat} />;
}

/** Bioluminescent Neural Pod — pulsing dark-green wireframe + particle aura */
function BioluminescentNeuralPod({
  position,
}: {
  position: [number, number, number];
}) {
  const shell = useRef<Mesh>(null);
  const aura = useRef<THREE.Points>(null);
  const particles = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 56;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.9 + Math.random() * 1.1;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const pMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: EMERALD,
        size: 0.055,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (shell.current) {
      shell.current.rotation.y = t * 0.35;
      shell.current.rotation.x = Math.sin(t * 0.4) * 0.2;
      const mat = shell.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.45 + Math.sin(t * 2.8) * 0.35;
      const s = 1 + Math.sin(t * 2.2) * 0.06;
      shell.current.scale.setScalar(s);
    }
    if (aura.current) {
      aura.current.rotation.y = -t * 0.25;
      aura.current.rotation.z = t * 0.12;
    }
  });

  return (
    <group position={position}>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.15, 1]} />
        <meshStandardMaterial
          color="#022c22"
          emissive={EMERALD}
          emissiveIntensity={0.6}
          wireframe
          transparent
          opacity={0.85}
          metalness={0.4}
          roughness={0.25}
        />
      </mesh>
      <mesh>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial
          color="#064e3b"
          emissive={EMERALD_DEEP}
          emissiveIntensity={1.1}
          metalness={0.7}
          roughness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>
      <points ref={aura} geometry={particles} material={pMat} />
    </group>
  );
}

/** Monolithic Quantum Spire — obsidian glass obelisk with emerald core */
function MonolithicQuantumSpire({
  position,
}: {
  position: [number, number, number];
}) {
  const core = useRef<Mesh>(null);
  const glass = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.9 + Math.sin(t * 3.5) * 0.45;
      core.current.scale.y = 1 + Math.sin(t * 2.1) * 0.04;
    }
    if (glass.current) {
      glass.current.rotation.y = t * 0.15;
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[1.4, 0.35, 1.4]} />
        <meshStandardMaterial
          color="#040907"
          metalness={0.95}
          roughness={0.15}
          emissive="#022c22"
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh ref={glass} position={[0, 3.2, 0]} castShadow>
        <boxGeometry args={[0.95, 5.8, 0.95]} />
        <meshPhysicalMaterial
          color="#064e3b"
          emissive="#022c22"
          emissiveIntensity={0.25}
          metalness={0.15}
          roughness={0.05}
          transmission={0.55}
          thickness={0.8}
          transparent
          opacity={0.72}
        />
      </mesh>
      <mesh ref={core} position={[0, 3.2, 0]}>
        <boxGeometry args={[0.28, 5.2, 0.28]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={1.2}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh position={[0, 6.35, 0]}>
        <octahedronGeometry args={[0.35, 0]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  );
}

/** Hyper-Dimensional Ring — interlocking rotating rings */
function HyperDimensionalRing({
  position,
}: {
  position: [number, number, number];
}) {
  const r1 = useRef<Mesh>(null);
  const r2 = useRef<Mesh>(null);
  const r3 = useRef<Mesh>(null);
  const nucleus = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (r1.current) {
      r1.current.rotation.x = t * 0.7;
      r1.current.rotation.z = t * 0.35;
    }
    if (r2.current) {
      r2.current.rotation.y = t * 0.9;
      r2.current.rotation.x = Math.PI / 2 + t * 0.2;
    }
    if (r3.current) {
      r3.current.rotation.z = -t * 1.1;
      r3.current.rotation.y = t * 0.45;
    }
    if (nucleus.current) {
      const mat = nucleus.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.4;
      nucleus.current.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    }
  });

  return (
    <group position={position}>
      <mesh ref={nucleus}>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshStandardMaterial
          color="#022c22"
          emissive={EMERALD}
          emissiveIntensity={1}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>
      <mesh ref={r1}>
        <torusGeometry args={[1.35, 0.045, 10, 64]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={0.9}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      <mesh ref={r2}>
        <torusGeometry args={[1.7, 0.035, 10, 64]} />
        <meshStandardMaterial
          color="#064e3b"
          emissive={EMERALD_DEEP}
          emissiveIntensity={0.7}
          metalness={0.85}
          roughness={0.18}
        />
      </mesh>
      <mesh ref={r3}>
        <torusGeometry args={[2.05, 0.028, 8, 72]} />
        <meshStandardMaterial
          color="#6EE7B7"
          emissive={CYAN}
          emissiveIntensity={0.55}
          transparent
          opacity={0.75}
          metalness={0.5}
          roughness={0.25}
        />
      </mesh>
    </group>
  );
}

function AlienArtifactField() {
  return (
    <>
      <BioluminescentNeuralPod position={[-16, 2.4, 10]} />
      <BioluminescentNeuralPod position={[16, 3.1, -12]} />
      <MonolithicQuantumSpire position={[-2, 0, 16]} />
      <HyperDimensionalRing position={[4, 3.2, -18]} />
      <HyperDimensionalRing position={[-18, 2.8, -8]} />
    </>
  );
}

function Constellation({
  activeId,
  hoveredId,
  consumedIds,
  onHover,
  onInspect,
}: {
  activeId: string | null;
  hoveredId: string | null;
  consumedIds: Set<string>;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
}) {
  return (
    <>
      {TOWERS.map((t) => {
        const active = activeId === t.id;
        const hovered = hoveredId === t.id;
        const hidden = consumedIds.has(t.id);
        const props = { tower: t, active, hovered, onHover, onInspect, hidden };
        switch (t.kind) {
          case "gas":
            return <GasObelisk key={t.id} {...props} />;
          case "swarm":
            return <SwarmMonoliths key={t.id} {...props} />;
          case "vault":
            return <VaultSphere key={t.id} {...props} />;
          case "sre":
            return <SreBeacon key={t.id} {...props} />;
          case "webhook":
            return <WebhookRelay key={t.id} {...props} />;
          case "software":
          case "hardware":
            return <GenericNodeMesh key={t.id} {...props} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function ProximityBillboard({ tower }: { tower: TowerDef }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.position.y =
      tower.height + 1.65 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
  });

  return (
    <group
      ref={group}
      position={[tower.position[0], tower.height + 1.65, tower.position[2]]}
    >
      <mesh>
        <planeGeometry args={[2.8, 0.55]} />
        <meshStandardMaterial
          color="#04120e"
          emissive={EMERALD}
          emissiveIntensity={0.55}
          metalness={0.35}
          roughness={0.25}
          transparent
          opacity={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Html center distanceFactor={10} zIndexRange={[40, 0]}>
        <div className="pointer-events-none whitespace-nowrap rounded-md border border-emerald-400/50 bg-[#040907]/92 px-3 py-1.5 font-mono text-[11px] font-semibold text-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.45)] backdrop-blur-md">
          [E] Interact / Open Script
        </div>
      </Html>
    </group>
  );
}

function DriveMotionFx({
  blurIntensityRef,
}: {
  blurIntensityRef: MutableRefObject<number>;
}) {
  const effectRef = useRef<{ offset: THREE.Vector2 } | null>(null);
  const offset = useMemo(() => new THREE.Vector2(0, 0), []);
  useFrame(() => {
    const fx = effectRef.current;
    if (!fx?.offset) return;
    const i = blurIntensityRef.current;
    fx.offset.set(0.0014 * i, 0.001 * i);
  });
  return (
    <ChromaticAberration
      ref={effectRef as never}
      blendFunction={BlendFunction.NORMAL}
      offset={offset}
      radialModulation={false}
      modulationOffset={0.15}
    />
  );
}

function Scene({
  locked,
  activeId,
  hoveredId,
  nearestTower,
  consumedIds,
  nearbyIds,
  avatarPosRef,
  mountedRef,
  speedMultRef,
  camBoostRef,
  speedRef,
  blurIntensityRef,
  mountSnapRef,
  pathQueueRef,
  torActiveRef,
  onNearestTower,
  onNearbyIds,
  onRobotPos,
  onHover,
  onInspect,
  onInteract,
  onMorph,
  onHardwareInteract,
  onPinRequest,
  onTorActivate,
  onMountChange,
  onPathComplete,
}: {
  locked: boolean;
  activeId: string | null;
  hoveredId: string | null;
  nearestTower: TowerDef | null;
  consumedIds: Set<string>;
  nearbyIds: string[];
  avatarPosRef: MutableRefObject<THREE.Vector3>;
  mountedRef: MutableRefObject<boolean>;
  speedMultRef: MutableRefObject<number>;
  camBoostRef: MutableRefObject<number>;
  speedRef: MutableRefObject<number>;
  blurIntensityRef: MutableRefObject<number>;
  mountSnapRef: MutableRefObject<THREE.Vector3 | null>;
  pathQueueRef: MutableRefObject<THREE.Vector3[]>;
  torActiveRef: MutableRefObject<boolean>;
  onNearestTower: (tower: TowerDef | null) => void;
  onNearbyIds: (ids: string[]) => void;
  onRobotPos: (pos: [number, number, number]) => void;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  onInteract: (towerId: string) => void;
  onMorph: (suite: CompositeSuite, consumed: string[]) => void;
  onHardwareInteract: (node: HardwareInteractable) => void;
  onPinRequest: (node: HardwareInteractable) => void;
  onTorActivate: (maskedIp: string) => void;
  onMountChange: (mounted: boolean) => void;
  onPathComplete: () => void;
}) {
  const targets = useMemo(
    () =>
      TOWERS.filter((t) => !consumedIds.has(t.id)).map((t) => ({
        id: t.id,
        position: t.position,
        height: t.height,
      })),
    [consumedIds]
  );

  const nearbyNodes: MorphNode[] = useMemo(
    () =>
      nearbyIds
        .map((id) => TOWERS.find((t) => t.id === id))
        .filter((t): t is TowerDef => !!t && !consumedIds.has(t.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          position: t.position,
          height: t.height,
          category: t.category ?? "software",
        })),
    [nearbyIds, consumedIds]
  );

  const [robotPos, setRobotPos] = useState<[number, number, number] | null>(
    null
  );

  const handleNearestId = useCallback(
    (id: string | null) => {
      onNearestTower(id ? (TOWERS.find((t) => t.id === id) ?? null) : null);
    },
    [onNearestTower]
  );

  const handlePos = useCallback(
    (pos: [number, number, number]) => {
      setRobotPos(pos);
      onRobotPos(pos);
    },
    [onRobotPos]
  );

  const handleMount = useCallback(
    (mounted: boolean) => {
      speedMultRef.current = mounted ? DRIVE_SPEED_MULT : 1;
      onMountChange(mounted);
    },
    [onMountChange, speedMultRef]
  );

  return (
    <>
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[14, 22, 10]}
        intensity={1.15}
        color="#f0e0c8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={70}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-bias={-0.0002}
      />
      <hemisphereLight args={["#6b8f71", "#8a6b4a", 0.35]} />
      <pointLight position={[-10, 8, -6]} intensity={1.05} color="#00ffaa" />
      <pointLight position={[8, 6, 5]} intensity={0.7} color={CYAN} />
      <pointLight position={[0, 10, 0]} intensity={0.35} color={YELLOW} />
      <DesertPlanetEnvironment />
      <CelestialAgentMesh enabled />
      <AmbientDrift />
      <AlienArtifactField />
      <InstancedHardwareGrid
        avatarPosRef={avatarPosRef}
        locked={locked}
        onInteract={onHardwareInteract}
        onPinRequest={onPinRequest}
      />
      <SwarmAgentTopology enabled />
      <NodeAnomalyHalos enabled />
      <RepairSubAgentDispatch enabled />
      <TorNode
        locked={locked}
        avatarPosRef={avatarPosRef}
        activeRef={torActiveRef}
        onActivate={onTorActivate}
      />
      <AutomobileUnit
        locked={locked}
        avatarPosRef={avatarPosRef}
        mountedRef={mountedRef}
        speedRef={speedRef}
        camBoostRef={camBoostRef}
        blurIntensityRef={blurIntensityRef}
        mountSnapRef={mountSnapRef}
        onMountChange={handleMount}
      />
      <Constellation
        activeId={activeId}
        hoveredId={hoveredId}
        consumedIds={consumedIds}
        onHover={onHover}
        onInspect={onInspect}
      />
      <RobotAvatar
        locked={locked}
        targets={targets}
        proximity={PROXIMITY}
        morphProximity={MORPH_PROX}
        onNearestChange={handleNearestId}
        onNearbyChange={onNearbyIds}
        onPositionChange={handlePos}
        onInteract={onInteract}
        positionRef={avatarPosRef}
        mountedRef={mountedRef}
        speedMultRef={speedMultRef}
        camBoostRef={camBoostRef}
        mountSnapRef={mountSnapRef}
        pathQueueRef={pathQueueRef}
        onPathComplete={onPathComplete}
      />
      <ObjectMorpher
        nearbyNodes={nearbyNodes}
        robotPosition={robotPos}
        locked={locked && !mountedRef.current}
        consumedIds={consumedIds}
        onMorph={onMorph}
      />
      {nearestTower && !consumedIds.has(nearestTower.id) ? (
        <ProximityBillboard tower={nearestTower} />
      ) : null}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={1.25}
          luminanceThreshold={0.5}
          luminanceSmoothing={0.32}
          mipmapBlur
        />
        <Vignette
          offset={0.28}
          darkness={0.72}
          blendFunction={BlendFunction.NORMAL}
        />
        <DriveMotionFx blurIntensityRef={blurIntensityRef} />
      </EffectComposer>
    </>
  );
}

function InspectModal({
  tower,
  onClose,
}: {
  tower: TowerDef;
  onClose: () => void;
}) {
  const { script } = tower;
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="inspect-tower-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#040907]/95 shadow-[0_0_48px_rgba(16,185,129,0.18)] backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
              inspect · constellation node
            </p>
            <h3
              id="inspect-tower-title"
              className="truncate text-sm font-semibold text-white"
            >
              {tower.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-muted">
              {script.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Close inspect modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-cyan-accent">
            <Radio className="h-3 w-3" aria-hidden />
            {script.runtime}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-300">
            <Activity className="h-3 w-3" aria-hidden />
            {script.status}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 font-mono text-slate-muted">
            {tower.kind === "gas" ? (
              <Zap className="h-3 w-3" aria-hidden />
            ) : tower.kind === "vault" || tower.id === "vault-core" ? (
              <Shield className="h-3 w-3" aria-hidden />
            ) : tower.kind === "webhook" ? (
              <Webhook className="h-3 w-3" aria-hidden />
            ) : tower.kind === "hardware" ? (
              tower.id === "edge-router" ? (
                <Router className="h-3 w-3" aria-hidden />
              ) : (
                <Cpu className="h-3 w-3" aria-hidden />
              )
            ) : tower.kind === "software" ? (
              <Terminal className="h-3 w-3" aria-hidden />
            ) : (
              <Database className="h-3 w-3" aria-hidden />
            )}
            {tower.status}
          </span>
        </div>
        <pre className="max-h-52 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-emerald-200/90">
          {script.lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function ProximityChip({
  tower,
  onInspect,
  onDismiss,
  riskPct = 12,
}: {
  tower: TowerDef;
  onInspect: () => void;
  onDismiss: () => void;
  riskPct?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
  }, [tower.id]);

  if (isMobile && collapsed) {
    return (
      <div className="pointer-events-auto absolute bottom-[4.5rem] left-3 z-20 md:hidden">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="inline-flex max-w-[14rem] items-center gap-2 rounded-xl border border-emerald-500/35 bg-[#040907]/92 px-3 py-2 shadow-[0_0_24px_rgba(16,185,129,0.2)] backdrop-blur-xl"
        >
          <span className="truncate font-mono text-[10px] text-emerald-300">
            near · {tower.name}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto absolute z-20 ${
        isMobile
          ? "bottom-[4.5rem] left-3 right-3"
          : "bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[min(20rem,calc(100%-2rem))]"
      }`}
    >
      <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-[#040907]/90 shadow-[0_0_40px_rgba(16,185,129,0.2)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
              proximity · 3u
            </p>
            <h3 className="truncate text-sm font-semibold text-white">
              {tower.name}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-emerald-300/90">
              {isMobile ? "Tap Connect" : "[E] Interact / Open Script"}
            </p>
            <div className="mt-2">
              <PredictiveHealthChip riskPct={riskPct} compact />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isMobile) setCollapsed(true);
              else onDismiss();
            }}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label={isMobile ? "Collapse" : "Dismiss"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="border-t border-white/5 px-3.5 py-2">
          <button
            type="button"
            onClick={onInspect}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
          >
            Connect / Open Script
          </button>
        </div>
      </div>
    </div>
  );
}

function SpeedometerHud({
  speedRef,
  visible,
}: {
  speedRef: MutableRefObject<number>;
  visible: boolean;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      const spd = speedRef.current;
      const display = Math.round(spd * 3.6);
      if (valueRef.current) valueRef.current.textContent = String(display);
      if (barRef.current) {
        const pct = Math.min(100, (spd / 22) * 100);
        barRef.current.style.width = `${pct}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, speedRef]);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute bottom-4 left-1/2 z-20 w-[min(16rem,calc(100%-2rem))] -translate-x-1/2"
    >
      <div className="overflow-hidden rounded-xl border border-[#00ffaa]/30 bg-[#0a0e12]/9 px-3.5 py-2.5 shadow-[0_0_40px_rgba(0,255,170,0.15)] backdrop-blur-xl">
        <div className="flex items-end justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/75">
            velocity · 2× drive
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums text-[#00ffaa]">
            <span ref={valueRef}>0</span>
            <span className="ml-1 text-[10px] text-emerald-400/80">u/h</span>
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            ref={barRef}
            className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-[#00ffaa] shadow-[0_0_12px_rgba(0,255,170,0.55)] transition-[width] duration-75"
            style={{ width: "0%" }}
          />
        </div>
      </div>
    </div>
  );
}

export type SpatialUniverseProps = {
  onOpenTerminal?: (towerId: string) => void;
};

export default function SpatialUniverse({
  onOpenTerminal,
}: SpatialUniverseProps = {}) {
  const { mode: streamMode } = useStreamEngine();
  const [webgl, setWebgl] = useState(true);
  const [forceWebgl, setForceWebgl] = useState(false);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [locked, setLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [nearest, setNearest] = useState<TowerDef | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<TowerDef | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [consumedIds, setConsumedIds] = useState<Set<string>>(() => new Set());
  const [driving, setDriving] = useState(false);
  const [pinNode, setPinNode] = useState<HardwareInteractable | null>(null);
  const [toolNode, setToolNode] = useState<HardwareInteractable | null>(null);
  const [memoryNode, setMemoryNode] = useState<HardwareInteractable | null>(
    null
  );
  const [edgeNode, setEdgeNode] = useState<HardwareInteractable | null>(null);
  const [nodeRiskMap, setNodeRiskMap] = useState<Record<string, number>>({});
  const [sentryTelemetry, setSentryTelemetry] = useState<
    SentryTelemetryPayload | Record<string, unknown> | null
  >(null);
  const [torProxyIp, setTorProxyIp] = useState<string | null>(null);
  const [unlockedPins, setUnlockedPins] = useState<Set<string>>(
    () => new Set()
  );
  const nearestRef = useRef<string | null>(null);

  const avatarPosRef = useRef(new THREE.Vector3(0, 0, 8));
  const mountedRef = useRef(false);
  const speedMultRef = useRef(1);
  const camBoostRef = useRef(0);
  const speedRef = useRef(0);
  const blurIntensityRef = useRef(0);
  const mountSnapRef = useRef<THREE.Vector3 | null>(null);
  const pathQueueRef = useRef<THREE.Vector3[]>([]);
  const torActiveRef = useRef(false);
  const sessionIdRef = useRef(
    `spatial-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`
  );
  const [navStatus, setNavStatus] = useState<string | null>(null);

  useEffect(() => {
    const forced = readForceWebglFlag();
    setForceWebgl(forced);
    setWebgl(forced || supportsWebGL());
  }, []);

  const forceLoadCanvas = useCallback(() => {
    writeForceWebglFlag(true);
    setForceWebgl(true);
    setWebgl(true);
    // Force Three.js Canvas remount so it re-acquires a GPU context
    setCanvasEpoch((n) => n + 1);
  }, []);

  const showCanvas = webgl || forceWebgl;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (pinNode) {
          setPinNode(null);
          return;
        }
        if (memoryNode) {
          setMemoryNode(null);
          return;
        }
        if (edgeNode) {
          setEdgeNode(null);
          return;
        }
        if (toolNode) {
          setToolNode(null);
          setSentryTelemetry(null);
          return;
        }
        if (inspect) {
          setInspect(null);
          return;
        }
        if (fullscreen) {
          setFullscreen(false);
          setLocked(false);
          return;
        }
        setLocked(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspect, fullscreen, pinNode, toolNode, memoryNode, edgeNode]);

  useEffect(() => {
    let cancelled = false;
    const loadRisk = async () => {
      try {
        const res = await fetch("/api/spatial/predictive-tune?limit=20", {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          tune?: { targets?: Array<{ nodeId: string; riskPct: number }> };
        };
        if (!res.ok || cancelled || !json.tune?.targets) return;
        const map: Record<string, number> = {};
        for (const t of json.tune.targets) map[t.nodeId] = t.riskPct;
        setNodeRiskMap(map);
      } catch {
        /* soft */
      }
    };
    void loadRisk();
    const id = window.setInterval(loadRisk, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const handleNearest = useCallback(
    (tower: TowerDef | null) => {
      const id = tower?.id ?? null;
      if (nearestRef.current === id) return;
      nearestRef.current = id;
      setNearest(tower);
      if (tower && dismissed === tower.id) setDismissed(null);
    },
    [dismissed]
  );

  const handleInspect = useCallback(
    (tower: TowerDef) => {
      setInspect(tower);
      onOpenTerminal?.(tower.id);
    },
    [onOpenTerminal]
  );

  const handleInteract = useCallback(
    (towerId: string) => {
      if (mountedRef.current) return;
      const tower = TOWERS.find((t) => t.id === towerId);
      if (!tower || consumedIds.has(towerId)) return;
      setInspect(tower);
      onOpenTerminal?.(towerId);
    },
    [onOpenTerminal, consumedIds]
  );

  const openUnlockedNode = useCallback(
    (node: HardwareInteractable) => {
      if (isMemoryHudNode(node)) {
        setMemoryNode(node);
        setToolNode(null);
        setEdgeNode(null);
      } else if (isEdgeWorkstation(node)) {
        setEdgeNode(node);
        setToolNode(null);
        setMemoryNode(null);
      } else {
        setToolNode(node);
        setMemoryNode(null);
        setEdgeNode(null);
      }
      setLocked(false);
      onOpenTerminal?.(node.id);
    },
    [onOpenTerminal]
  );

  const handleHardwareInteract = useCallback(
    (node: HardwareInteractable) => {
      if (mountedRef.current) return;
      if (node.requiresPin && !unlockedPins.has(node.id)) {
        setPinNode(node);
        setLocked(false);
        return;
      }
      openUnlockedNode(node);
    },
    [unlockedPins, openUnlockedNode]
  );

  const handlePinRequest = useCallback(
    (node: HardwareInteractable) => {
      if (mountedRef.current) return;
      if (unlockedPins.has(node.id)) {
        openUnlockedNode(node);
        return;
      }
      setPinNode(node);
      setLocked(false);
    },
    [unlockedPins, openUnlockedNode]
  );

  const handlePinSuccess = useCallback(
    (result: PinVerifySuccess) => {
      if (!pinNode) return;
      setUnlockedPins((prev) => {
        const next = new Set(prev);
        next.add(pinNode.id);
        return next;
      });
      setSentryTelemetry(
        (result.sentryTelemetry as SentryTelemetryPayload) ?? null
      );
      setPinNode(null);
      playSpatialCue("unlock");
      openUnlockedNode(pinNode);
    },
    [pinNode, openUnlockedNode]
  );

  const handleTorActivate = useCallback((maskedIp: string) => {
    setTorProxyIp(maskedIp);
  }, []);

  const handlePathComplete = useCallback(() => {
    playSpatialCue("arrive");
    setNavStatus("Arrived");
    window.setTimeout(() => setNavStatus(null), 2200);
  }, []);

  const handleCommandNavigate = useCallback((cmd: ParsedSpatialCommand) => {
    const pts = cmd.path.map(
      (p) => new THREE.Vector3(p.x, p.y ?? 0, p.z)
    );
    pathQueueRef.current = pts;
    setNavStatus(cmd.utterance);
    setLocked(true);
    const dest = pts[pts.length - 1] ?? null;
    if (dest) {
      requestCameraFocus(dest.x, dest.y, dest.z);
    }
  }, []);

  const commandFrom = useCallback(
    () => ({
      x: avatarPosRef.current.x,
      y: avatarPosRef.current.y,
      z: avatarPosRef.current.z,
    }),
    []
  );

  const handleMorph = useCallback(
    (_suite: CompositeSuite, consumed: string[]) => {
      setConsumedIds((prev) => {
        const next = new Set(prev);
        for (const id of consumed) next.add(id);
        return next;
      });
    },
    []
  );

  const toggleFullscreen = useCallback(() => {
    setFullscreen((v) => !v);
  }, []);

  const overlayOpen = !!(
    inspect ||
    pinNode ||
    toolNode ||
    memoryNode ||
    edgeNode
  );

  const showChip =
    nearest &&
    dismissed !== nearest.id &&
    !overlayOpen &&
    !driving &&
    !consumedIds.has(nearest.id)
      ? nearest
      : null;

  return (
    <section
      className={
        fullscreen
          ? "fixed inset-0 z-[80] flex h-[100vh] w-[100vw] flex-col overflow-hidden bg-[#040907]"
          : "glass-panel relative flex min-h-[420px] flex-col overflow-hidden"
      }
      aria-label="Spatial sandbox universe"
    >
      <header className="relative z-40 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-[#040907]/80 px-3.5 py-2.5 backdrop-blur-xl sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
            <Zap className="h-4 w-4 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Spatial Universe
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              Repair drones · edge tty · predictive risk ·{" "}
              {fullscreen ? "fullscreen" : "embedded"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-muted">
          <span className="hidden rounded border border-white/10 bg-white/[0.03] px-2 py-1 sm:inline">
            WASD / arrows
          </span>
          <span className="hidden rounded border border-white/10 bg-white/[0.03] px-2 py-1 md:inline">
            E interact · Z PIN · F CyberRover · M morph
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)] backdrop-blur-md transition hover:bg-emerald-500/20"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Minimize (Esc)" : "Maximize"}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            )}
            {fullscreen ? "Minimize" : "Maximize"}
          </button>
        </div>
      </header>

      <div
        className={
          fullscreen
            ? "relative min-h-0 flex-1 bg-[#040907]"
            : "relative min-h-[360px] flex-1 bg-[#040907] sm:min-h-[480px] lg:min-h-[560px]"
        }
        style={
          streamMode === "ue5"
            ? { opacity: 0.35, filter: "saturate(0.7)" }
            : undefined
        }
      >
        {!showCanvas ? (
          <Spatial2DGridFallback onForceLoad={forceLoadCanvas} />
        ) : (
          <WebGLErrorBoundary
            key={`spatial-gl-${canvasEpoch}`}
            label="spatial-universe"
            onError={() => {
              // Under Force Load, stay on the Canvas remount path (error boundary
              // Retry) instead of snapping back to the 2D grid fallback.
              if (!readForceWebglFlag()) {
                setForceWebgl(false);
                setWebgl(false);
              }
            }}
          >
            <Suspense fallback={null}>
              <Canvas
                key={`canvas-${canvasEpoch}`}
                shadows={!forceWebgl}
                dpr={forceWebgl ? [1, 1] : [1, 1.5]}
                frameloop="always"
                camera={{
                  fov: 55,
                  near: 0.1,
                  far: 500,
                  position: [0, 3.2, 14],
                }}
                gl={{
                  antialias: !forceWebgl,
                  alpha: false,
                  powerPreference: "default",
                  failIfMajorPerformanceCaveat: false,
                }}
                onCreated={({ gl }) => {
                  // Soften context if browser exposed a caveat after force-load
                  gl.setPixelRatio(
                    Math.min(window.devicePixelRatio || 1, forceWebgl ? 1 : 1.5)
                  );
                }}
                onPointerDown={() => {
                  if (!overlayOpen) setLocked(true);
                }}
                className="h-full w-full touch-none"
                style={{ width: "100%", height: "100%" }}
              >
                <Scene
                  locked={locked && !overlayOpen}
                  activeId={inspect?.id ?? showChip?.id ?? null}
                  hoveredId={hoveredId}
                  nearestTower={nearest && !overlayOpen ? nearest : null}
                  consumedIds={consumedIds}
                  nearbyIds={nearbyIds}
                  avatarPosRef={avatarPosRef}
                  mountedRef={mountedRef}
                  speedMultRef={speedMultRef}
                  camBoostRef={camBoostRef}
                  speedRef={speedRef}
                  blurIntensityRef={blurIntensityRef}
                  mountSnapRef={mountSnapRef}
                  pathQueueRef={pathQueueRef}
                  torActiveRef={torActiveRef}
                  onNearestTower={handleNearest}
                  onNearbyIds={setNearbyIds}
                  onRobotPos={() => {}}
                  onHover={setHoveredId}
                  onInspect={handleInspect}
                  onInteract={handleInteract}
                  onMorph={handleMorph}
                  onHardwareInteract={handleHardwareInteract}
                  onPinRequest={handlePinRequest}
                  onTorActivate={handleTorActivate}
                  onMountChange={setDriving}
                  onPathComplete={handlePathComplete}
                />
              </Canvas>
            </Suspense>
          </WebGLErrorBoundary>
        )}

        {!locked && showCanvas && !overlayOpen ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="rounded-lg border border-[#00ffaa]/25 bg-gradient-to-b from-slate-950/95 via-zinc-900/90 to-emerald-950/50 px-4 py-3 text-center backdrop-blur-xl">
              <Terminal className="mx-auto mb-2 h-5 w-5 text-[#00ffaa]" />
              <p className="text-sm font-medium text-white">
                Click to pilot alien avatar
              </p>
              <p className="mt-1 text-[11px] text-slate-muted">
                E interact · Z PIN · F CyberRover · Tor onion
              </p>
            </div>
          </div>
        ) : null}

        <SpeedometerHud speedRef={speedRef} visible={driving && locked} />

        <MobileTouchHud enabled={showCanvas && !overlayOpen} locked={locked} />

        {torProxyIp ? (
          <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border border-[#00ffaa]/30 bg-[#080b0c]/9 px-3 py-2 font-mono text-[11px] text-[#00ffaa] shadow-[0_0_24px_rgba(0,255,170,0.2)] backdrop-blur-md">
            <p className="text-[9px] uppercase tracking-wider text-[#00ffaa]/70">
              tor proxy · masked
            </p>
            <p className="mt-0.5 font-semibold">{torProxyIp}</p>
          </div>
        ) : null}

        {navStatus ? (
          <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border border-[#00ffaa]/25 bg-[#0b120f]/9 px-3 py-2 font-mono text-[11px] text-[#00ffaa] shadow-[0_0_20px_rgba(0,255,170,0.15)] backdrop-blur-md">
            <p className="text-[9px] uppercase tracking-wider text-[#00ffaa]/65">
              pathfinder
            </p>
            <p className="mt-0.5 text-slate-200">{navStatus}</p>
          </div>
        ) : null}

        {!overlayOpen ? (
          <SpatialCommandBar
            sessionId={sessionIdRef.current}
            from={commandFrom}
            onNavigate={handleCommandNavigate}
            disabled={driving}
          />
        ) : null}

        {showChip ? (
          <ProximityChip
            tower={showChip}
            riskPct={nodeRiskMap[showChip.id] ?? 12}
            onInspect={() => handleInspect(showChip)}
            onDismiss={() => setDismissed(showChip.id)}
          />
        ) : null}

        {inspect ? (
          <InspectModal tower={inspect} onClose={() => setInspect(null)} />
        ) : null}

        {pinNode ? (
          <PinKeypadModal
            node={pinNode}
            sessionId={sessionIdRef.current}
            coordinates={{
              x: avatarPosRef.current.x,
              y: avatarPosRef.current.y,
              z: avatarPosRef.current.z,
            }}
            onClose={() => setPinNode(null)}
            onSuccess={handlePinSuccess}
          />
        ) : null}

        {memoryNode && !pinNode ? (
          <MetaSreTerminalModal
            node={memoryNode}
            sessionId={sessionIdRef.current}
            onClose={() => setMemoryNode(null)}
          />
        ) : null}

        {edgeNode && !pinNode && !memoryNode ? (
          <EdgeTerminalModal
            node={edgeNode}
            sessionId={sessionIdRef.current}
            riskPct={nodeRiskMap[edgeNode.id] ?? 22}
            onClose={() => setEdgeNode(null)}
          />
        ) : null}

        {toolNode && !pinNode && !memoryNode && !edgeNode ? (
          <NodeToolOverlay
            node={toolNode}
            sentryTelemetry={sentryTelemetry}
            riskPct={nodeRiskMap[toolNode.id] ?? 18}
            onOpenEdgeTerminal={
              isEdgeWorkstation(toolNode)
                ? () => {
                    setEdgeNode(toolNode);
                    setToolNode(null);
                  }
                : undefined
            }
            onClose={() => {
              setToolNode(null);
              setSentryTelemetry(null);
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
