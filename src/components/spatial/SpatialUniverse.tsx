"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
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
import ObjectMorpher, {
  type CompositeSuite,
  type MorphNode,
  EMERALD,
  EMERALD_DEEP,
  CYAN,
  AMBER,
} from "@/components/spatial/ObjectMorpher";

const YELLOW = "#facc15";
const GRID_SIZE = 80;
const PROXIMITY = 3;
const MORPH_PROX = 5.5;

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

function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function CyberGrid() {
  const gridRef = useRef<THREE.GridHelper>(null);
  useFrame(({ clock }) => {
    if (!gridRef.current) return;
    const mat = gridRef.current.material;
    if (Array.isArray(mat)) return;
    mat.opacity = 0.32 + Math.sin(clock.elapsedTime * 0.6) * 0.05;
  });

  return (
    <>
      <gridHelper
        ref={gridRef}
        args={[GRID_SIZE, 80, "#059669", "#064e3b"]}
        position={[0, 0.01, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID_SIZE, GRID_SIZE]} />
        <meshStandardMaterial
          color="#09090B"
          metalness={0.82}
          roughness={0.42}
          envMapIntensity={1.1}
          transparent
          opacity={0.96}
        />
      </mesh>
    </>
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
      className="pointer-events-none whitespace-nowrap rounded-lg border border-white/15 bg-[#09090B]/90 px-2.5 py-1.5 shadow-[0_0_24px_rgba(16,185,129,0.2)] backdrop-blur-md"
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
          color="#05110d"
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
          color="#05110d"
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
              color="#09090B"
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
        <meshStandardMaterial color="#05110d" metalness={0.8} roughness={0.3} />
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
          color="#05110d"
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
          color="#05110d"
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
        <div className="pointer-events-none whitespace-nowrap rounded-md border border-emerald-400/50 bg-[#09090B]/92 px-3 py-1.5 font-mono text-[11px] font-semibold text-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.45)] backdrop-blur-md">
          [Press E to Connect / Open Script]
        </div>
      </Html>
    </group>
  );
}

function Scene({
  locked,
  activeId,
  hoveredId,
  nearestTower,
  consumedIds,
  nearbyIds,
  onNearestTower,
  onNearbyIds,
  onRobotPos,
  onHover,
  onInspect,
  onInteract,
  onMorph,
}: {
  locked: boolean;
  activeId: string | null;
  hoveredId: string | null;
  nearestTower: TowerDef | null;
  consumedIds: Set<string>;
  nearbyIds: string[];
  onNearestTower: (tower: TowerDef | null) => void;
  onNearbyIds: (ids: string[]) => void;
  onRobotPos: (pos: [number, number, number]) => void;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
  onInteract: (towerId: string) => void;
  onMorph: (suite: CompositeSuite, consumed: string[]) => void;
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
        .filter((t): t is TowerDef => Boolean(t) && !consumedIds.has(t!.id))
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

  return (
    <>
      <color attach="background" args={["#09090B"]} />
      <fog attach="fog" args={["#05110d", 35, 120]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[10, 18, 8]}
        intensity={0.85}
        color="#e2e8f0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={60}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.0002}
      />
      <pointLight position={[-10, 8, -6]} intensity={1.15} color={EMERALD} />
      <pointLight position={[8, 6, 5]} intensity={1} color={CYAN} />
      <pointLight position={[0, 10, 0]} intensity={0.45} color={YELLOW} />
      <CyberGrid />
      <AmbientDrift />
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
      />
      <ObjectMorpher
        nearbyNodes={nearbyNodes}
        robotPosition={robotPos}
        locked={locked}
        consumedIds={consumedIds}
        onMorph={onMorph}
      />
      {nearestTower && !consumedIds.has(nearestTower.id) ? (
        <ProximityBillboard tower={nearestTower} />
      ) : null}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={1.15}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.35}
          mipmapBlur
        />
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
        className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#09090B]/95 shadow-[0_0_48px_rgba(16,185,129,0.18)] backdrop-blur-xl"
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
}: {
  tower: TowerDef;
  onInspect: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 sm:left-auto sm:right-4 sm:w-[min(20rem,calc(100%-2rem))]">
      <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-[#09090B]/90 shadow-[0_0_40px_rgba(16,185,129,0.2)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
              proximity · 3u
            </p>
            <h3 className="truncate text-sm font-semibold text-white">
              {tower.name}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-emerald-300/90">
              [Press E to Connect / Open Script]
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Dismiss"
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

export type SpatialUniverseProps = {
  onOpenTerminal?: (towerId: string) => void;
};

export default function SpatialUniverse({
  onOpenTerminal,
}: SpatialUniverseProps = {}) {
  const [webgl, setWebgl] = useState(true);
  const [locked, setLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [nearest, setNearest] = useState<TowerDef | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<TowerDef | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [consumedIds, setConsumedIds] = useState<Set<string>>(() => new Set());
  const nearestRef = useRef<string | null>(null);
  const shellRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
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
  }, [inspect, fullscreen]);

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
      const tower = TOWERS.find((t) => t.id === towerId);
      if (!tower || consumedIds.has(towerId)) return;
      setInspect(tower);
      onOpenTerminal?.(towerId);
    },
    [onOpenTerminal, consumedIds]
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

  const showChip =
    nearest &&
    dismissed !== nearest.id &&
    !inspect &&
    !consumedIds.has(nearest.id)
      ? nearest
      : null;

  return (
    <section
      ref={shellRef}
      className={
        fullscreen
          ? "fixed inset-0 z-[80] flex h-[100vh] w-[100vw] flex-col overflow-hidden bg-[#09090B]"
          : "glass-panel relative flex min-h-[420px] flex-col overflow-hidden"
      }
      aria-label="Spatial sandbox universe"
    >
      <header className="relative z-40 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-[#05110d]/80 px-3.5 py-2.5 backdrop-blur-xl sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
            <Zap className="h-4 w-4 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Spatial Universe
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              {TOWERS.length} nodes · morph · WASD ·{" "}
              {fullscreen ? "fullscreen" : "embedded"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-muted">
          <span className="hidden rounded border border-white/10 bg-white/[0.03] px-2 py-1 sm:inline">
            WASD / arrows
          </span>
          <span className="hidden rounded border border-white/10 bg-white/[0.03] px-2 py-1 md:inline">
            E connect · M morph
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
            ? "relative min-h-0 flex-1 bg-[#09090B]"
            : "relative min-h-[360px] flex-1 bg-[#09090B] sm:min-h-[480px] lg:min-h-[560px]"
        }
      >
        {!webgl ? (
          <div className="flex h-full min-h-[360px] items-center justify-center p-6 text-center">
            <p className="text-sm text-slate-muted">
              WebGL unavailable — spatial viewport disabled on this device.
            </p>
          </div>
        ) : (
          <SceneErrorBoundary onError={() => setWebgl(false)}>
            <Suspense fallback={null}>
              <Canvas
                shadows
                dpr={[1, 1.5]}
                frameloop="always"
                camera={{
                  fov: 55,
                  near: 0.1,
                  far: 500,
                  position: [0, 3.2, 14],
                }}
                gl={{
                  antialias: true,
                  alpha: false,
                  powerPreference: "high-performance",
                  failIfMajorPerformanceCaveat: false,
                }}
                onPointerDown={() => {
                  if (!inspect) setLocked(true);
                }}
                className="h-full w-full touch-none"
                style={{ width: "100%", height: "100%" }}
              >
                <Scene
                  locked={locked && !inspect}
                  activeId={inspect?.id ?? showChip?.id ?? null}
                  hoveredId={hoveredId}
                  nearestTower={nearest && !inspect ? nearest : null}
                  consumedIds={consumedIds}
                  nearbyIds={nearbyIds}
                  onNearestTower={handleNearest}
                  onNearbyIds={setNearbyIds}
                  onRobotPos={() => {}}
                  onHover={setHoveredId}
                  onInspect={handleInspect}
                  onInteract={handleInteract}
                  onMorph={handleMorph}
                />
              </Canvas>
            </Suspense>
          </SceneErrorBoundary>
        )}

        {!locked && webgl && !inspect ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="rounded-lg border border-white/10 bg-[#09090B]/80 px-4 py-3 text-center backdrop-blur-xl">
              <Terminal className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
              <p className="text-sm font-medium text-white">
                Click to pilot robot avatar
              </p>
              <p className="mt-1 text-[11px] text-slate-muted">
                Approach nodes · E connect · M morph composites
              </p>
            </div>
          </div>
        ) : null}

        {showChip ? (
          <ProximityChip
            tower={showChip}
            onInspect={() => handleInspect(showChip)}
            onDismiss={() => setDismissed(showChip.id)}
          />
        ) : null}

        {inspect ? (
          <InspectModal tower={inspect} onClose={() => setInspect(null)} />
        ) : null}
      </div>
    </section>
  );
}
