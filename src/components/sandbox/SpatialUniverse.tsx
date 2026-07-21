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
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import {
  Activity,
  Database,
  Radio,
  Terminal,
  Webhook,
  X,
  Zap,
} from "lucide-react";

const EMERALD = "#34d399";
const CYAN = "#22d3ee";
const AMBER = "#f59e0b";
const YELLOW = "#facc15";

/** OrbitControls-equivalent pitch limits (polar from +Y). */
const MIN_POLAR_ANGLE = Math.PI / 6;
const MAX_POLAR_ANGLE = Math.PI / 2 + 0.3;
const MIN_PITCH = MIN_POLAR_ANGLE - Math.PI / 2; // −π/3 — no straight-up flip
const MAX_PITCH = MAX_POLAR_ANGLE - Math.PI / 2; // +0.3 — no below-grid clip

const CAM_BOUNDS = {
  minX: -100,
  maxX: 100,
  minY: 1,
  maxY: 30,
  minZ: -100,
  maxZ: 100,
} as const;

const GRID_SIZE = 80;
const PROXIMITY = 4.5;

type NodeKind =
  | "gas"
  | "swarm"
  | "vault"
  | "sre"
  | "webhook";

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
        "[ok] emerald path · recharge ready",
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
        "[*] cable sync · cyan pulse 42ms",
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
        "[sre] radar sweep · 360° emerald",
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
        args={[GRID_SIZE, 80, "#0891b2", "#0f766e"]}
        position={[0, 0.01, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID_SIZE, GRID_SIZE]} />
        <meshStandardMaterial
          color="#09090B"
          metalness={0.75}
          roughness={0.88}
          transparent
          opacity={0.94}
        />
      </mesh>
    </>
  );
}

function FloatingCamera({
  locked,
  onNearestTower,
}: {
  locked: boolean;
  onNearestTower: (tower: TowerDef | null) => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const velocity = useRef(new THREE.Vector3());
  const look = useRef({ pitch: 0, yaw: 0 });
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const wish = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const probe = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(0, 2.2, 14);
    camera.rotation.set(0, 0, 0);
    look.current.pitch = 0;
    look.current.yaw = 0;
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const upKey = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", upKey);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", upKey);
    };
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: MouseEvent) => {
      if (!locked) return;
      const sens = 0.002;
      look.current.yaw -= e.movementX * sens;
      look.current.pitch -= e.movementY * sens;
      // Clamp polar pitch — blocks 360° inversion / gimbal flip
      look.current.pitch = THREE.MathUtils.clamp(
        look.current.pitch,
        MIN_PITCH,
        MAX_PITCH
      );
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [gl, locked]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    euler.current.set(look.current.pitch, look.current.yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler.current);

    const speed = keys.current.ShiftLeft || keys.current.ShiftRight ? 12 : 6.5;
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() > 1e-6) forward.current.normalize();
    right.current.crossVectors(forward.current, up.current).normalize();

    wish.current.set(0, 0, 0);
    if (keys.current.KeyW || keys.current.ArrowUp) wish.current.add(forward.current);
    if (keys.current.KeyS || keys.current.ArrowDown) wish.current.sub(forward.current);
    if (keys.current.KeyD || keys.current.ArrowRight) wish.current.add(right.current);
    if (keys.current.KeyA || keys.current.ArrowLeft) wish.current.sub(right.current);
    if (keys.current.Space || keys.current.KeyE) wish.current.y += 1;
    if (keys.current.ControlLeft || keys.current.KeyQ) wish.current.y -= 1;

    if (wish.current.lengthSq() > 0) wish.current.normalize().multiplyScalar(speed);
    velocity.current.lerp(wish.current, 1 - Math.exp(-8 * dt));
    camera.position.addScaledVector(velocity.current, dt);

    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      CAM_BOUNDS.minX,
      CAM_BOUNDS.maxX
    );
    camera.position.y = THREE.MathUtils.clamp(
      camera.position.y,
      CAM_BOUNDS.minY,
      CAM_BOUNDS.maxY
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      CAM_BOUNDS.minZ,
      CAM_BOUNDS.maxZ
    );

    let nearest: TowerDef | null = null;
    let best = PROXIMITY;
    for (const t of TOWERS) {
      probe.current.set(t.position[0], Math.min(t.height * 0.45, 3), t.position[2]);
      const d = camera.position.distanceTo(probe.current);
      if (d < best) {
        best = d;
        nearest = t;
      }
    }
    onNearestTower(nearest);
  });

  return null;
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

function GasObelisk({
  tower,
  active,
  hovered,
  onHover,
  onInspect,
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
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
          color="#0b1220"
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
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
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
      {/* cyan cable beams between monoliths */}
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
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
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
        <meshStandardMaterial color="#0b1220" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh ref={orb} position={[0, 2.4, 0]}>
        <sphereGeometry args={[1.05, 32, 32]} />
        <meshPhysicalMaterial
          color="#a7f3d0"
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
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
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
          color="#0b1220"
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
}: {
  tower: TowerDef;
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
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
          color="#0b1220"
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
      <mesh ref={frame} position={[0, tower.height + 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
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
  onHover,
  onInspect,
}: {
  activeId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
}) {
  return (
    <>
      {TOWERS.map((t) => {
        const active = activeId === t.id;
        const hovered = hoveredId === t.id;
        const props = { tower: t, active, hovered, onHover, onInspect };
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
          default:
            return null;
        }
      })}
    </>
  );
}

function Scene({
  locked,
  activeId,
  hoveredId,
  onNearestTower,
  onHover,
  onInspect,
}: {
  locked: boolean;
  activeId: string | null;
  hoveredId: string | null;
  onNearestTower: (tower: TowerDef | null) => void;
  onHover: (id: string | null) => void;
  onInspect: (tower: TowerDef) => void;
}) {
  return (
    <>
      <color attach="background" args={["#09090B"]} />
      <fog attach="fog" args={["#09090B", 35, 120]} />
      <ambientLight intensity={0.32} />
      <directionalLight
        position={[10, 18, 8]}
        intensity={0.8}
        color="#e2e8f0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-10, 8, -6]} intensity={1.1} color={EMERALD} />
      <pointLight position={[8, 6, 5]} intensity={0.95} color={CYAN} />
      <pointLight position={[0, 10, 0]} intensity={0.4} color={YELLOW} />
      <CyberGrid />
      <AmbientDrift />
      <Constellation
        activeId={activeId}
        hoveredId={hoveredId}
        onHover={onHover}
        onInspect={onInspect}
      />
      <FloatingCamera locked={locked} onNearestTower={onNearestTower} />
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
            ) : tower.kind === "vault" ? (
              <Database className="h-3 w-3" aria-hidden />
            ) : tower.kind === "webhook" ? (
              <Webhook className="h-3 w-3" aria-hidden />
            ) : (
              <Terminal className="h-3 w-3" aria-hidden />
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
      <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#09090B]/90 shadow-[0_0_40px_rgba(16,185,129,0.12)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
              proximity zone
            </p>
            <h3 className="truncate text-sm font-semibold text-white">
              {tower.name}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-slate-muted">
              {tower.status}
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
            Inspect node
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SpatialUniverse() {
  const [webgl, setWebgl] = useState(true);
  const [locked, setLocked] = useState(false);
  const [nearest, setNearest] = useState<TowerDef | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<TowerDef | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const nearestRef = useRef<string | null>(null);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (inspect) setInspect(null);
        else setLocked(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspect]);

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

  const handleInspect = useCallback((tower: TowerDef) => {
    setInspect(tower);
  }, []);

  const showChip =
    nearest && dismissed !== nearest.id && !inspect ? nearest : null;

  return (
    <section
      className="glass-panel relative flex min-h-[420px] flex-col overflow-hidden"
      aria-label="Spatial sandbox universe"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3.5 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
            <Zap className="h-4 w-4 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Spatial Universe
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              Scale Systems constellation · cyber grid · WASD
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-muted">
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            WASD move
          </span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            Q/E · Space/Ctrl altitude
          </span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            hover · click inspect
          </span>
        </div>
      </header>

      <div className="relative min-h-[360px] flex-1 bg-[#09090B] sm:min-h-[480px] lg:min-h-[560px]">
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
                camera={{
                  fov: 60,
                  near: 0.1,
                  far: 500,
                  position: [0, 2.2, 14],
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
              >
                <Scene
                  locked={locked && !inspect}
                  activeId={inspect?.id ?? showChip?.id ?? null}
                  hoveredId={hoveredId}
                  onNearestTower={handleNearest}
                  onHover={setHoveredId}
                  onInspect={handleInspect}
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
                Click to enter viewport
              </p>
              <p className="mt-1 text-[11px] text-slate-muted">
                Explore Gas · Swarm · Vault · SRE · Webhook towers
              </p>
            </div>
          </div>
        ) : null}

        {showChip ? (
          <ProximityChip
            tower={showChip}
            onInspect={() => setInspect(showChip)}
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
