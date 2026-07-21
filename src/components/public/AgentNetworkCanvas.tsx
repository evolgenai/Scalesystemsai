"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh, PerspectiveCamera } from "three";

const EMERALD = "#10B981";
const EMERALD_DIM = "#059669";
const GLASS = "#a7f3d0";

type NodeDef = {
  id: string;
  label: string;
  position: [number, number, number];
  role: "router" | "worker";
};

const NODES: NodeDef[] = [
  { id: "router", label: "Router", position: [0, 0.35, 0], role: "router" },
  { id: "scraper", label: "Scraper", position: [-1.35, -0.45, 0.4], role: "worker" },
  { id: "sandbox", label: "Sandbox", position: [1.25, -0.35, 0.55], role: "worker" },
  { id: "sre", label: "SRE", position: [-0.55, -0.7, -1.1], role: "worker" },
  { id: "content", label: "Content", position: [0.7, -0.55, -0.95], role: "worker" },
];

const EDGES: [string, string][] = [
  ["router", "scraper"],
  ["router", "sandbox"],
  ["router", "sre"],
  ["router", "content"],
  ["scraper", "sandbox"],
  ["sre", "content"],
];

const MESH_CENTER: [number, number, number] = [0, -0.34, -0.22];
const BASE_FOV = 42;

function AgentNode({
  def,
  pulse,
}: {
  def: NodeDef;
  pulse: number;
}) {
  const mesh = useRef<Mesh>(null);
  const isRouter = def.role === "router";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!mesh.current) return;
    const bob = Math.sin(t * 1.4 + pulse) * 0.06;
    mesh.current.position.y = def.position[1] + bob;
    mesh.current.rotation.y = t * (isRouter ? 0.55 : 0.35) + pulse;
    const mat = mesh.current.material as THREE.MeshPhysicalMaterial;
    mat.emissiveIntensity = isRouter
      ? 0.55 + Math.sin(t * 2.6 + pulse) * 0.25
      : 0.28 + Math.sin(t * 2.1 + pulse) * 0.15;
  });

  return (
    <mesh ref={mesh} position={def.position} scale={isRouter ? 1.15 : 0.78}>
      {isRouter ? (
        <icosahedronGeometry args={[0.32, 1]} />
      ) : (
        <octahedronGeometry args={[0.28, 0]} />
      )}
      <meshPhysicalMaterial
        color={isRouter ? EMERALD : GLASS}
        emissive={EMERALD}
        emissiveIntensity={0.4}
        metalness={0.2}
        roughness={0.12}
        transmission={0.45}
        thickness={0.5}
        ior={1.9}
        transparent
        opacity={0.92}
        clearcoat={1}
        clearcoatRoughness={0.1}
      />
    </mesh>
  );
}

function ConnectionBeam({
  a,
  b,
  phase,
}: {
  a: [number, number, number];
  b: [number, number, number];
  phase: number;
}) {
  const mesh = useRef<Mesh>(null);
  const mid = useMemo<[number, number, number]>(
    () => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    [a, b]
  );
  const length = useMemo(() => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)), [a, b]);
  const quat = useMemo(() => {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }, [a, b]);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    const mat = mesh.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.18 + Math.sin(t * 3.2 + phase) * 0.14;
  });

  return (
    <mesh ref={mesh} position={mid} quaternion={quat}>
      <cylinderGeometry args={[0.012, 0.012, length, 6]} />
      <meshBasicMaterial color={EMERALD_DIM} transparent opacity={0.28} />
    </mesh>
  );
}

function Packet({
  a,
  b,
  speed,
  offset,
}: {
  a: [number, number, number];
  b: [number, number, number];
  speed: number;
  offset: number;
}) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const u = ((state.clock.elapsedTime * speed + offset) % 1 + 1) % 1;
    mesh.current.position.set(
      a[0] + (b[0] - a[0]) * u,
      a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI) * 0.08,
      a[2] + (b[2] - a[2]) * u
    );
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.045, 10, 10]} />
      <meshBasicMaterial color={EMERALD} />
    </mesh>
  );
}

function ResponsiveCamera({
  viewportWidth,
  viewportHeight,
}: {
  viewportWidth: number;
  viewportHeight: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.fov = BASE_FOV;
    cam.near = 0.1;
    cam.far = 50;
    cam.updateProjectionMatrix();
  }, [camera]);

  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = viewportWidth / Math.max(viewportHeight, 1);
    const isPortrait = aspect < 1;
    const dist = isPortrait ? 4.6 : 4.2;
    const yLift = isPortrait ? 0.72 : 0.6;

    cam.position.set(MESH_CENTER[0], MESH_CENTER[1] + yLift, dist);
    cam.lookAt(MESH_CENTER[0], MESH_CENTER[1], MESH_CENTER[2]);
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  });

  return null;
}

function SwarmScene({
  viewportWidth,
  viewportHeight,
}: {
  viewportWidth: number;
  viewportHeight: number;
}) {
  const root = useRef<Group>(null);
  const byId = useMemo(() => {
    const map = new Map<string, NodeDef>();
    for (const n of NODES) map.set(n.id, n);
    return map;
  }, []);

  useFrame((state) => {
    if (root.current) {
      root.current.rotation.y = state.clock.elapsedTime * 0.12;
    }
  });

  return (
    <group ref={root}>
      <ambientLight intensity={0.35} />
      <pointLight position={[2.2, 2.4, 1.5]} intensity={1.1} color={EMERALD} />
      <pointLight position={[-2, -1, -1.5]} intensity={0.45} color="#67e8f9" />

      {NODES.map((n, i) => (
        <AgentNode key={n.id} def={n} pulse={i * 0.9} />
      ))}

      {EDGES.map(([from, to], i) => {
        const a = byId.get(from)!;
        const b = byId.get(to)!;
        return (
          <group key={`${from}-${to}`}>
            <ConnectionBeam a={a.position} b={b.position} phase={i * 0.7} />
            <Packet
              a={a.position}
              b={b.position}
              speed={0.35 + (i % 3) * 0.08}
              offset={i * 0.17}
            />
          </group>
        );
      })}

      <ResponsiveCamera
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
      />
    </group>
  );
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: boolean }
> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch() {
    /* swallow WebGL failures for marketing canvas */
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

function FallbackMesh() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative h-40 w-40">
        <div className="absolute inset-0 animate-pulse rounded-full border border-emerald-500/30 bg-emerald-500/10 blur-sm" />
        <div className="absolute inset-6 rounded-full border border-emerald-400/40 bg-emerald-500/15 shadow-[0_0_40px_rgba(16,185,129,0.25)]" />
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">
          Swarm live
        </div>
      </div>
    </div>
  );
}

export default function AgentNetworkCanvas({
  className = "",
}: {
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (width: number, height: number) => {
      const aspect = width / Math.max(height, 1);
      const targetHeight = Math.round(
        width / (aspect < 0.85 ? 0.82 : aspect < 1.15 ? 1 : 1.18)
      );
      setSize({ width, height: Math.max(targetHeight, 220) });
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      update(width, height);
    });

    ro.observe(el);
    update(el.clientWidth, el.clientHeight);

    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#09090B]/80 shadow-[0_0_48px_rgba(16,185,129,0.12)] backdrop-blur-xl ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.12),_transparent_65%)]" />
      <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        Agent mesh · live
      </div>
      <div
        className="w-full"
        style={{ height: size.height > 0 ? size.height : undefined }}
      >
        <CanvasErrorBoundary fallback={<FallbackMesh />}>
          <Suspense fallback={<FallbackMesh />}>
            <Canvas
              className="h-full w-full"
              style={{ minHeight: size.height > 0 ? size.height : 280 }}
              dpr={[1, Math.min(1.75, typeof window !== "undefined" ? window.devicePixelRatio : 1.75)]}
              camera={{ position: [0, 0.6, 4.2], fov: BASE_FOV }}
              gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
              onCreated={() => setReady(true)}
            >
              <color attach="background" args={["#09090B"]} />
              <SwarmScene
                viewportWidth={size.width || 360}
                viewportHeight={size.height || 280}
              />
            </Canvas>
          </Suspense>
        </CanvasErrorBoundary>
      </div>
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <FallbackMesh />
        </div>
      ) : null}
    </div>
  );
}
