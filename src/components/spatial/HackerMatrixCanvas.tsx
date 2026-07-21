"use client";

/**
 * 3D Cyber-Hacker Matrix — neon-emerald wireframe grid, privacy orbs,
 * router racks, and a central GitHub workspace node.
 */

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
import { Html, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Group, Mesh, Points } from "three";
import { Github, Lock, Radio, Router, Shield } from "lucide-react";

const BACKDROP = "#050b08";
const EMERALD = "#10B981";
const EMERALD_DIM = "#059669";
const CYAN = "#34d399";
const GRID = 48;

export type MatrixNodeKind = "vpn" | "tor" | "router" | "github";

export type MatrixNodeDef = {
  id: string;
  kind: MatrixNodeKind;
  label: string;
  detail: string;
  position: [number, number, number];
};

export type MatrixTelemetryLine = {
  id: string;
  nodeId: string;
  text: string;
  ts: number;
};

const NODES: MatrixNodeDef[] = [
  {
    id: "vpn-orb-a",
    kind: "vpn",
    label: "VPN Privacy Orb",
    detail: "WireGuard · egress scrubbed",
    position: [-7.2, 1.4, 4.5],
  },
  {
    id: "tor-orb",
    kind: "tor",
    label: "TOR Circuit Orb",
    detail: "3-hop · onion relay mesh",
    position: [7.5, 1.6, 3.8],
  },
  {
    id: "vpn-orb-b",
    kind: "vpn",
    label: "VPN Edge Orb",
    detail: "Split-tunnel · LAN deny",
    position: [-5.5, 1.2, -6.2],
  },
  {
    id: "router-rack-a",
    kind: "router",
    label: "Core Router Rack",
    detail: "BGP · ACL · 10G fabric",
    position: [5.8, 0, -5.5],
  },
  {
    id: "router-rack-b",
    kind: "router",
    label: "Edge Router Rack",
    detail: "NAT · DPI bypass · QoS",
    position: [-8.2, 0, -1.5],
  },
  {
    id: "github-workspace",
    kind: "github",
    label: "GitHub Repository Workspace",
    detail: "monorepo · CI · signed commits",
    position: [0, 0, 0],
  },
];

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(_e: Error, _info: ErrorInfo): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function WireframeGrid() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.18 + Math.sin(clock.elapsedTime * 0.6) * 0.04;
  });

  return (
    <group>
      <gridHelper
        args={[GRID, 48, EMERALD_DIM, "#0a1f16"]}
        position={[0, 0.02, 0]}
      />
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[GRID, GRID, 24, 24]} />
        <meshBasicMaterial
          color={EMERALD}
          wireframe
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ParticleDrift() {
  const points = useRef<Points>(null);
  const { positions, speeds } = useMemo(() => {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * GRID;
      positions[i * 3 + 1] = 0.4 + Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * GRID;
      speeds[i] = 0.15 + Math.random() * 0.55;
    }
    return { positions, speeds };
  }, []);

  useFrame((_, dt) => {
    const p = points.current;
    if (!p) return;
    const attr = p.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < speeds.length; i++) {
      const y = i * 3 + 1;
      arr[y]! += speeds[i]! * dt;
      if (arr[y]! > 9) arr[y] = 0.3;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={EMERALD}
        size={0.06}
        transparent
        opacity={0.55}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function TelemetryRings({
  active,
  color,
}: {
  active: boolean;
  color: string;
}) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.visible = active;
    if (!active) return;
    const t = clock.elapsedTime;
    g.current.rotation.y = t * 1.4;
    g.current.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
  });

  return (
    <group ref={g} visible={active}>
      {[1.1, 1.45, 1.85].map((r, i) => (
        <mesh key={r} rotation={[Math.PI / 2, 0, i * 0.4]}>
          <torusGeometry args={[r, 0.02, 8, 48]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.2}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </group>
  );
}

function PrivacyOrb({
  node,
  selected,
  onSelect,
}: {
  node: MatrixNodeDef;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const body = useRef<Mesh>(null);
  const accent = node.kind === "tor" ? CYAN : EMERALD;

  useFrame(({ clock }) => {
    if (!body.current) return;
    const t = clock.elapsedTime;
    body.current.position.y =
      node.position[1] + Math.sin(t * 1.6 + node.position[0]) * 0.18;
    body.current.rotation.y = t * 0.45;
    const mat = body.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = selected
      ? 1.4 + Math.sin(t * 8) * 0.4
      : 0.45 + Math.sin(t * 2) * 0.15;
  });

  return (
    <group position={[node.position[0], 0, node.position[2]]}>
      <mesh
        ref={body}
        position={[0, node.position[1], 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial
          color="#04120e"
          emissive={accent}
          emissiveIntensity={0.5}
          metalness={0.85}
          roughness={0.2}
          wireframe={node.kind === "tor"}
        />
      </mesh>
      <TelemetryRings active={selected} color={accent} />
      {selected ? (
        <Html center distanceFactor={12} position={[0, node.position[1] + 1.6, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-emerald-400/40 bg-[#050b08]/92 px-2.5 py-1 font-mono text-[10px] text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.35)] backdrop-blur-md">
            {node.label} · LIVE
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function RouterRack({
  node,
  selected,
  onSelect,
}: {
  node: MatrixNodeDef;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const glow = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!glow.current) return;
    const mat = glow.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = selected
      ? 1.6 + Math.sin(clock.elapsedTime * 7) * 0.5
      : 0.35 + Math.sin(clock.elapsedTime * 2.2) * 0.12;
  });

  return (
    <group
      position={node.position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[1.6, 2.8, 1.1]} />
        <meshStandardMaterial
          color="#070f0c"
          metalness={0.9}
          roughness={0.25}
          emissive={EMERALD_DIM}
          emissiveIntensity={selected ? 0.55 : 0.15}
        />
      </mesh>
      {[0.4, 0.9, 1.4, 1.9, 2.4].map((y) => (
        <mesh key={y} position={[0, y, 0.56]}>
          <boxGeometry args={[1.35, 0.12, 0.08]} />
          <meshStandardMaterial
            color={EMERALD}
            emissive={EMERALD}
            emissiveIntensity={selected ? 1.1 : 0.4}
          />
        </mesh>
      ))}
      <mesh ref={glow} position={[0, 3.1, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={0.8}
        />
      </mesh>
      <TelemetryRings active={selected} color={EMERALD} />
    </group>
  );
}

function GithubWorkspaceNode({
  node,
  selected,
  onSelect,
}: {
  node: MatrixNodeDef;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const core = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.35;
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = selected
        ? 1.5 + Math.sin(t * 9) * 0.45
        : 0.55 + Math.sin(t * 2) * 0.2;
    }
    if (ring.current) {
      ring.current.rotation.z = t * 0.8;
      ring.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.5) * 0.15;
    }
  });

  return (
    <group
      position={node.position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.2, 2.45, 64]} />
        <meshBasicMaterial
          color={EMERALD}
          transparent
          opacity={selected ? 0.55 : 0.22}
        />
      </mesh>
      <mesh ref={core} position={[0, 1.6, 0]} castShadow>
        <octahedronGeometry args={[1.35, 0]} />
        <meshStandardMaterial
          color="#050b08"
          emissive={EMERALD}
          emissiveIntensity={0.7}
          metalness={0.92}
          roughness={0.18}
        />
      </mesh>
      <mesh ref={ring} position={[0, 1.6, 0]}>
        <torusGeometry args={[1.85, 0.045, 10, 64]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={CYAN}
          emissiveIntensity={selected ? 1.4 : 0.6}
        />
      </mesh>
      <TelemetryRings active={selected} color={CYAN} />
      <Html center distanceFactor={14} position={[0, 3.4, 0]}>
        <div className="pointer-events-none flex items-center gap-1.5 rounded-md border border-emerald-400/45 bg-[#050b08]/92 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.4)] backdrop-blur-md">
          <Github className="h-3 w-3" aria-hidden />
          {selected ? "REPO · TELEMETRY OPEN" : "GITHUB WORKSPACE"}
        </div>
      </Html>
    </group>
  );
}

function LinkBeams({ selectedId }: { selectedId: string | null }) {
  const hub = NODES.find((n) => n.id === "github-workspace")!;

  return (
    <>
      {NODES.filter((n) => n.id !== "github-workspace").map((n) => {
        const y0 = 1.6;
        const y1 = n.kind === "router" ? 1.4 : n.position[1];
        const midX = (hub.position[0] + n.position[0]) / 2;
        const midZ = (hub.position[2] + n.position[2]) / 2;
        const dx = n.position[0] - hub.position[0];
        const dz = n.position[2] - hub.position[2];
        const len = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        const hot =
          selectedId === n.id || selectedId === "github-workspace";
        return (
          <mesh
            key={n.id}
            position={[midX, (y0 + y1) / 2, midZ]}
            rotation={[0, angle, Math.PI / 2]}
          >
            <cylinderGeometry args={[hot ? 0.035 : 0.018, hot ? 0.035 : 0.018, len, 6]} />
            <meshStandardMaterial
              color={hot ? CYAN : EMERALD_DIM}
              emissive={hot ? CYAN : EMERALD_DIM}
              emissiveIntensity={hot ? 1.1 : 0.35}
              transparent
              opacity={hot ? 0.9 : 0.35}
            />
          </mesh>
        );
      })}
    </>
  );
}

function MatrixScene({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <color attach="background" args={[BACKDROP]} />
      <fog attach="fog" args={[BACKDROP, 18, 55]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 12, 0]} intensity={1.2} color={EMERALD} />
      <pointLight position={[-10, 6, 8]} intensity={0.7} color={CYAN} />
      <directionalLight position={[8, 14, -6]} intensity={0.45} color="#ecfdf5" />
      <WireframeGrid />
      <ParticleDrift />
      <LinkBeams selectedId={selectedId} />
      {NODES.map((node) => {
        if (node.kind === "vpn" || node.kind === "tor") {
          return (
            <PrivacyOrb
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              onSelect={onSelect}
            />
          );
        }
        if (node.kind === "router") {
          return (
            <RouterRack
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              onSelect={onSelect}
            />
          );
        }
        return (
          <GithubWorkspaceNode
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            onSelect={onSelect}
          />
        );
      })}
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={32}
        maxPolarAngle={Math.PI * 0.48}
        target={[0, 1.2, 0]}
      />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={1.05}
          luminanceThreshold={0.45}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

const TELEMETRY_TEMPLATES: Record<MatrixNodeKind, string[]> = {
  vpn: [
    "VPN handshake · noise_ik · keys rotated",
    "egress scrub · DNS leak check PASS",
    "tunnel RTT {rtt}ms · cipher chacha20",
  ],
  tor: [
    "TOR circuit built · 3 relays",
    "onion stream multiplex · cells={n}",
    "guard consensus · freshness OK",
  ],
  router: [
    "BGP withdraw/announce · peer UP",
    "ACL hit · drop LAN→WAN probe",
    "fabric util {pct}% · queue depth 0",
  ],
  github: [
    "git fetch origin · objects={n}",
    "signed commit verify · GPG OK",
    "Actions run queued · workflow=ci.yml",
  ],
};

function synthTelemetry(node: MatrixNodeDef): string {
  const pool = TELEMETRY_TEMPLATES[node.kind];
  const raw = pool[Math.floor(Math.random() * pool.length)]!;
  return raw
    .replace("{rtt}", String(12 + Math.floor(Math.random() * 40)))
    .replace("{n}", String(40 + Math.floor(Math.random() * 200)))
    .replace("{pct}", String(8 + Math.floor(Math.random() * 40)));
}

export type HackerMatrixCanvasProps = {
  onNodeSelect?: (node: MatrixNodeDef, line: MatrixTelemetryLine) => void;
  className?: string;
};

export default function HackerMatrixCanvas({
  onNodeSelect,
  className,
}: HackerMatrixCanvasProps) {
  const [webgl, setWebgl] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>("github-workspace");
  const [feed, setFeed] = useState<MatrixTelemetryLine[]>([]);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const node = NODES.find((n) => n.id === selectedId);
    if (!node) return;

    const tick = () => {
      const line: MatrixTelemetryLine = {
        id: `tel-${Date.now()}`,
        nodeId: node.id,
        text: `[${node.label}] ${synthTelemetry(node)}`,
        ts: Date.now(),
      };
      setFeed((prev) => [...prev.slice(-24), line]);
      onNodeSelect?.(node, line);
    };

    tick();
    const id = window.setInterval(tick, 1800);
    return () => window.clearInterval(id);
  }, [selectedId, onNodeSelect]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const selected = NODES.find((n) => n.id === selectedId) ?? null;

  return (
    <section
      className={
        className ??
        "glass-panel relative flex min-h-[420px] flex-col overflow-hidden"
      }
      aria-label="Cyber-Hacker Matrix"
    >
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-[#050b08]/85 px-3.5 py-2.5 backdrop-blur-xl sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
            <Shield className="h-4 w-4 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Cyber-Hacker Matrix
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              VPN · TOR · routers · GitHub workspace
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-muted">
          <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            <Lock className="h-3 w-3 text-emerald-400" aria-hidden />
            privacy mesh
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            <Router className="h-3 w-3 text-cyan-300" aria-hidden />
            fabric
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            <Radio className="h-3 w-3 text-emerald-300" aria-hidden />
            live telemetry
          </span>
        </div>
      </header>

      <div className="relative min-h-[360px] flex-1 bg-[#050b08] sm:min-h-[480px] lg:min-h-[560px]">
        {!webgl ? (
          <div className="flex h-full min-h-[360px] items-center justify-center p-6 text-center">
            <p className="text-sm text-slate-muted">
              WebGL unavailable — Cyber-Hacker Matrix disabled on this device.
            </p>
          </div>
        ) : (
          <SceneErrorBoundary onError={() => setWebgl(false)}>
            <Suspense fallback={null}>
              <Canvas
                dpr={[1, 1.5]}
                camera={{ fov: 50, near: 0.1, far: 200, position: [10, 8, 14] }}
                gl={{
                  antialias: true,
                  alpha: false,
                  powerPreference: "high-performance",
                }}
                className="h-full w-full touch-none"
                style={{ width: "100%", height: "100%" }}
                onPointerMissed={() => setSelectedId(null)}
              >
                <MatrixScene selectedId={selectedId} onSelect={handleSelect} />
              </Canvas>
            </Suspense>
          </SceneErrorBoundary>
        )}

        <aside className="pointer-events-none absolute bottom-3 left-3 right-3 max-w-md rounded-xl border border-emerald-500/20 bg-[#050b08]/88 p-3 font-mono text-[10px] text-emerald-200/90 shadow-[0_0_28px_rgba(16,185,129,0.15)] backdrop-blur-xl sm:left-auto sm:right-3">
          <p className="mb-1.5 text-[9px] uppercase tracking-wider text-slate-dim">
            {selected
              ? `${selected.label} · stream`
              : "select a node · matrix idle"}
          </p>
          <div className="max-h-28 space-y-0.5 overflow-hidden">
            {feed.length === 0 ? (
              <p className="text-slate-dim">awaiting telemetry…</p>
            ) : (
              feed
                .slice(-6)
                .reverse()
                .map((line) => (
                  <p key={line.id} className="truncate">
                    {line.text}
                  </p>
                ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

export { NODES as HACKER_MATRIX_NODES };
