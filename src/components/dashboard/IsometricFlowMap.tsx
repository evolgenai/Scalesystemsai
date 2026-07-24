"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import { RobotMesh } from "@/components/ui/RobotMeshIcon";

export type FlowHealth = "healthy" | "incident" | "healing";
export type FlowNodeId = "error" | "sandbox" | "iot" | "notify";

type IsometricFlowMapProps = {
  health?: FlowHealth;
  /** Nodes under active chaos glitch / chromatic stress. */
  stressedNodeIds?: FlowNodeId[];
};

const SAPPHIRE = "#10B981";
const AMBER = "#f59e0b";
const ROSE = "#f43f5e";
const CYAN_GLITCH = "#22d3ee";

const NODES: {
  id: FlowNodeId;
  label: string;
  sub: string;
  position: [number, number, number];
  size: [number, number, number];
}[] = [
  {
    id: "error",
    label: "Error Source",
    sub: "Telemetry",
    position: [-3.2, 0.35, 1.1],
    size: [1.1, 0.55, 1.1],
  },
  {
    id: "sandbox",
    label: "Sandbox MicroVM",
    sub: "Engine",
    position: [-0.9, 0.55, 0.2],
    size: [1.25, 0.7, 1.15],
  },
  {
    id: "iot",
    label: "IoT / Gate / Solar",
    sub: "Infrastructure",
    position: [1.4, 0.45, -0.6],
    size: [1.35, 0.6, 1.2],
  },
  {
    id: "notify",
    label: "Notification GW",
    sub: "Outbound",
    position: [3.5, 0.4, 0.5],
    size: [1.1, 0.55, 1.05],
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

function flowColor(health: FlowHealth): string {
  if (health === "incident") return ROSE;
  if (health === "healing") return AMBER;
  return SAPPHIRE;
}

function FlowNode({
  id,
  label,
  sub,
  position,
  size,
  health,
  stressed,
}: {
  id: FlowNodeId;
  label: string;
  sub: string;
  position: [number, number, number];
  size: [number, number, number];
  health: FlowHealth;
  stressed: boolean;
}) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const ghostR = useRef<Mesh>(null);
  const ghostB = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const target = useRef({ rx: 0, ry: 0, y: position[1] });
  const accent = stressed
    ? ROSE
    : flowColor(health);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = Math.min(1, dt * 10);
    const time = state.clock.elapsedTime;

    if (stressed) {
      const jx = Math.sin(time * 48 + id.length) * 0.045;
      const jz = Math.cos(time * 61 + 1.7) * 0.04;
      g.position.x = position[0] + jx;
      g.position.z = position[2] + jz;
      target.current.rx = Math.sin(time * 22) * 0.12;
      target.current.ry = Math.cos(time * 19) * 0.14;
      target.current.y = position[1] + 0.06 + Math.abs(Math.sin(time * 30)) * 0.08;
    } else {
      g.position.x += (position[0] - g.position.x) * t;
      g.position.z += (position[2] - g.position.z) * t;
      target.current.rx = hovered ? -0.18 : 0;
      target.current.ry = hovered ? 0.22 : 0;
      target.current.y = hovered ? position[1] + 0.18 : position[1];
    }

    g.rotation.x += (target.current.rx - g.rotation.x) * t;
    g.rotation.y += (target.current.ry - g.rotation.y) * t;
    g.position.y += (target.current.y - g.position.y) * t;

    if (mesh.current) {
      const mat = mesh.current.material as THREE.MeshStandardMaterial;
      if (stressed) {
        const strobe = Math.sin(time * 28) > 0;
        mat.emissive.set(strobe ? ROSE : CYAN_GLITCH);
        mat.emissiveIntensity = 0.55 + Math.abs(Math.sin(time * 36)) * 0.9;
        mat.color.set(strobe ? "#2a1010" : "#102028");
      } else {
        mat.emissive.set(accent);
        mat.emissiveIntensity = hovered
          ? 0.85
          : health === "healthy"
            ? 0.35
            : 0.55;
        mat.color.set("#1a1a1a");
      }
    }

    // Chromatic aberration ghosts
    if (ghostR.current && ghostB.current) {
      ghostR.current.visible = stressed;
      ghostB.current.visible = stressed;
      if (stressed) {
        const ox = Math.sin(time * 40) * 0.06;
        ghostR.current.position.set(ox, 0, 0);
        ghostB.current.position.set(-ox, 0, 0);
        const rMat = ghostR.current.material as THREE.MeshBasicMaterial;
        const bMat = ghostB.current.material as THREE.MeshBasicMaterial;
        rMat.opacity = 0.35 + Math.abs(Math.sin(time * 20)) * 0.25;
        bMat.opacity = 0.3 + Math.abs(Math.cos(time * 24)) * 0.25;
      }
    }
  });

  return (
    <group ref={group} position={position}>
      <mesh
        ref={ghostR}
        visible={false}
        scale={[1.02, 1.02, 1.02]}
      >
        <boxGeometry args={size} />
        <meshBasicMaterial color="#ff0040" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh
        ref={ghostB}
        visible={false}
        scale={[1.02, 1.02, 1.02]}
      >
        <boxGeometry args={size} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh
        ref={mesh}
        castShadow
        receiveShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color="#1a1a1a"
          emissive={accent}
          emissiveIntensity={0.35}
          metalness={0.55}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0] * 0.92, size[2] * 0.92]} />
        <meshStandardMaterial
          color="#121212"
          emissive={accent}
          emissiveIntensity={hovered || stressed ? 0.45 : 0.18}
          transparent
          opacity={0.95}
        />
      </mesh>
      <Html
        position={[0, size[1] / 2 + 0.35, 0]}
        center
        distanceFactor={7.5}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div className="whitespace-nowrap text-center">
          <p
            className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${
              stressed ? "text-rose-300" : "text-white/90"
            }`}
          >
            {label}
          </p>
          <p
            className={`font-mono text-[8px] ${
              stressed ? "text-cyan-300 animate-pulse" : "text-emerald-400/80"
            }`}
          >
            {stressed ? "GLITCH" : sub}
          </p>
        </div>
      </Html>
    </group>
  );
}

function ParticleStream({
  from,
  to,
  health,
  count = 18,
  delay = 0,
}: {
  from: [number, number, number];
  to: [number, number, number];
  health: FlowHealth;
  count?: number;
  delay?: number;
}) {
  const points = useRef<THREE.Points>(null);
  const phases = useMemo(
    () => Float32Array.from({ length: count }, (_, i) => i / count + delay),
    [count, delay]
  );
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  const color = flowColor(health);
  const speed = health === "incident" ? 0.35 : health === "healing" ? 0.55 : 0.85;

  useFrame((state) => {
    const t = state.clock.elapsedTime * speed;
    for (let i = 0; i < count; i++) {
      const u = (phases[i]! + t) % 1;
      const ease = u * u * (3 - 2 * u);
      positions[i * 3] = from[0] + (to[0] - from[0]) * ease;
      positions[i * 3 + 1] =
        from[1] + (to[1] - from[1]) * ease + Math.sin(u * Math.PI) * 0.28;
      positions[i * 3 + 2] = from[2] + (to[2] - from[2]) * ease;
    }
    const attr = points.current?.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute | undefined;
    if (attr) attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={health === "incident" ? 0.09 : 0.07}
        sizeAttenuation
        transparent
        opacity={health === "incident" ? 0.95 : 0.85}
        depthWrite={false}
      />
    </points>
  );
}

function IsoCameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(0.2, 0.25, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return (
    <OrthographicCamera
      makeDefault
      position={[7.2, 6.4, 7.2]}
      zoom={52}
      near={0.1}
      far={80}
    />
  );
}

function Conduit({
  from,
  to,
  health,
}: {
  from: [number, number, number];
  to: [number, number, number];
  health: FlowHealth;
}) {
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2 + 0.05,
    (from[2] + to[2]) / 2,
  ];
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );

  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[0.025, 0.025, len, 6]} />
      <meshStandardMaterial
        color="#1f1f1f"
        emissive={flowColor(health)}
        emissiveIntensity={0.22}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

function IsoGrid() {
  return (
    <gridHelper
      args={[14, 14, "#1a1a1a", "#141414"]}
      position={[0, -0.02, 0]}
      rotation={[0, Math.PI / 4, 0]}
    />
  );
}

/** Decorative agent rigs aligned to operational heal roles. */
const AGENT_ROBOTS: {
  variant: "supervisor" | "writer" | "validator";
  label: string;
  position: [number, number, number];
}[] = [
  {
    variant: "supervisor",
    label: "Supervisor Agent",
    position: [-3.2, 1.15, 1.1],
  },
  {
    variant: "writer",
    label: "Writer Agent",
    position: [-0.9, 1.35, 0.2],
  },
  {
    variant: "validator",
    label: "Validator Agent",
    position: [1.4, 1.25, -0.6],
  },
];

function FlowScene({
  health,
  stressedNodeIds,
}: {
  health: FlowHealth;
  stressedNodeIds: FlowNodeId[];
}) {
  const stressed = useMemo(
    () => new Set(stressedNodeIds),
    [stressedNodeIds]
  );
  const edges = useMemo(() => {
    const pts = NODES.map((n) => n.position);
    return [
      { from: pts[0]!, to: pts[1]!, a: "error" as FlowNodeId, b: "sandbox" as FlowNodeId },
      { from: pts[1]!, to: pts[2]!, a: "sandbox" as FlowNodeId, b: "iot" as FlowNodeId },
      { from: pts[2]!, to: pts[3]!, a: "iot" as FlowNodeId, b: "notify" as FlowNodeId },
    ];
  }, []);

  const sceneHealth: FlowHealth =
    stressed.size > 0
      ? "incident"
      : health;

  return (
    <>
      <IsoCameraRig />
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 10, 4]} intensity={1.05} color="#e2e8f0" />
      <pointLight
        position={[0, 4, 0]}
        intensity={stressed.size ? 1.1 : 0.7}
        color={flowColor(sceneHealth)}
        distance={18}
      />
      <IsoGrid />
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial
          color="#121212"
          metalness={0.15}
          roughness={0.92}
          transparent
          opacity={0.001}
          depthWrite={false}
        />
      </mesh>

      {NODES.map((node) => (
        <FlowNode
          key={node.id}
          {...node}
          health={health}
          stressed={stressed.has(node.id)}
        />
      ))}

      {AGENT_ROBOTS.map((bot) => (
        <group key={bot.variant} position={bot.position}>
          <RobotMesh scale={0.55} variant={bot.variant} />
          <Html
            position={[0.55, 0.05, 0]}
            center={false}
            distanceFactor={7.5}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <p className="whitespace-nowrap font-mono text-[8px] font-semibold uppercase tracking-wider text-emerald-400/90">
              {bot.label}
            </p>
          </Html>
        </group>
      ))}

      {edges.map((edge, i) => {
        const edgeHot = stressed.has(edge.a) || stressed.has(edge.b);
        const edgeHealth: FlowHealth = edgeHot ? "incident" : health;
        return (
          <group key={i}>
            <Conduit from={edge.from} to={edge.to} health={edgeHealth} />
            <ParticleStream
              from={edge.from}
              to={edge.to}
              health={edgeHealth}
              count={16}
              delay={i * 0.22}
            />
          </group>
        );
      })}
    </>
  );
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_e: Error, _info: ErrorInfo) {
    this.props.onError();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function FlatFlowFallback({
  health,
  stressedNodeIds = [],
}: {
  health: FlowHealth;
  stressedNodeIds?: FlowNodeId[];
}) {
  const stressed = new Set(stressedNodeIds);
  const accent =
    health === "incident"
      ? "text-rose-400 border-rose-400/40"
      : health === "healing"
        ? "text-amber-300 border-amber-400/40"
        : "text-emerald-400 border-emerald-500/30";
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {NODES.map((n, i) => {
        const hot = stressed.has(n.id);
        return (
          <div
            key={n.id}
            className={`rounded-lg border bg-[#121212] px-3 py-2.5 ${
              hot
                ? "animate-pulse border-rose-400/50 text-rose-300"
                : accent
            }`}
          >
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider">
              {n.label}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-dim">
              {hot ? "GLITCH" : n.sub}
            </p>
            {i < NODES.length - 1 ? (
              <p className="mt-1 font-mono text-[9px] text-slate-dim">→ stream</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function IsometricFlowMap({
  health = "healthy",
  stressedNodeIds = [],
}: IsometricFlowMapProps) {
  const [mounted, setMounted] = useState(false);
  const [use3d, setUse3d] = useState(true);
  const glitching = stressedNodeIds.length > 0;

  useEffect(() => {
    setMounted(true);
    setUse3d(supportsWebGL());
  }, []);

  const effectiveHealth: FlowHealth = glitching ? "incident" : health;

  const statusLabel = glitching
    ? `Chaos stress · ${stressedNodeIds.join(", ")}`
    : health === "incident"
      ? "Incident — flow degraded"
      : health === "healing"
        ? "Self-heal loop active"
        : "Nominal Cyber Blue flow";

  const border = glitching
    ? "border-rose-400/50 ring-1 ring-cyan-400/25"
    : health === "incident"
      ? "border-rose-400/35 ring-1 ring-rose-400/20"
      : health === "healing"
        ? "border-amber-400/35 ring-1 ring-amber-400/20"
        : "border-white/5";

  if (!mounted || !use3d) {
    return (
      <section aria-labelledby="iso-flow-heading" className="mb-8 space-y-2">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h2
              id="iso-flow-heading"
              className="font-display text-sm font-semibold text-white"
            >
              Telemetry Flow Map
            </h2>
            <p className="text-[11px] text-slate-dim">{statusLabel}</p>
          </div>
        </header>
        <div className={`rounded-lg border bg-[#121212] p-3 ${border}`}>
          <FlatFlowFallback
            health={effectiveHealth}
            stressedNodeIds={stressedNodeIds}
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="iso-flow-heading" className="mb-8 space-y-2">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="iso-flow-heading"
            className="font-display text-sm font-semibold text-white"
          >
            Isometric Telemetry Flow
          </h2>
          <p className="text-[11px] text-slate-dim">{statusLabel}</p>
        </div>
        <span
          className={`hidden font-mono text-[10px] sm:inline ${
            glitching
              ? "animate-pulse text-rose-400"
              : health === "incident"
                ? "text-rose-400"
                : health === "healing"
                  ? "text-amber-300"
                  : "text-emerald-400"
          }`}
        >
          {glitching ? "GLITCH" : health.toUpperCase()}
        </span>
      </header>

      <WebGLErrorBoundary onError={() => setUse3d(false)}>
        <div
          className={`relative h-[260px] w-full overflow-hidden rounded-lg border bg-[#121212] pointer-events-auto sm:h-[300px] md:h-[340px] ${border}`}
        >
          {glitching ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 mix-blend-screen"
              aria-hidden
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,0,64,0.12), transparent 40%, rgba(0,229,255,0.12))",
                animation: "chaos-skew 0.12s steps(2) infinite",
              }}
            />
          ) : null}
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(16, 185, 129,0.07),transparent_55%)]"
            aria-hidden
          />
          <Canvas
            dpr={[1, 1.75]}
            gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
            className="pointer-events-auto relative z-[1] h-full w-full touch-none"
            style={{ background: "transparent" }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x121212, 0);
            }}
          >
            <Suspense fallback={null}>
              <FlowScene health={health} stressedNodeIds={stressedNodeIds} />
            </Suspense>
          </Canvas>
          <style>{`
            @keyframes chaos-skew {
              0% { transform: translate(0, 0); opacity: 0.7; }
              50% { transform: translate(-2px, 1px); opacity: 1; }
              100% { transform: translate(2px, -1px); opacity: 0.85; }
            }
          `}</style>
        </div>
      </WebGLErrorBoundary>
    </section>
  );
}
