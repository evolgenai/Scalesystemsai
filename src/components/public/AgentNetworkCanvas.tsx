"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh } from "three";

const OBSIDIAN = "#060810";
const SAPPHIRE = "#0066FF";
const SAPPHIRE_DIM = "#0052CC";
const GLASS = "#93C5FD";

type NodeDef = {
  id: string;
  label: string;
  position: [number, number, number];
  role: "router" | "worker";
};

/** Swarm mesh centered at world origin (0, 0, 0) ≈ viewport center. */
const NODES: NodeDef[] = [
  { id: "router", label: "Router", position: [0, 0.12, 0.15], role: "router" },
  { id: "scraper", label: "Scraper", position: [-1.35, 0.08, 0.7], role: "worker" },
  { id: "sandbox", label: "Sandbox", position: [1.3, 0.06, 0.65], role: "worker" },
  { id: "sre", label: "SRE", position: [-0.7, -0.22, -0.8], role: "worker" },
  { id: "content", label: "Content", position: [0.72, -0.18, -0.75], role: "worker" },
];

const EDGES: [string, string][] = [
  ["router", "scraper"],
  ["router", "sandbox"],
  ["router", "sre"],
  ["router", "content"],
  ["scraper", "sandbox"],
  ["sre", "content"],
];

function SceneBackdrop() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const color = new THREE.Color(OBSIDIAN);
    scene.background = color;
    gl.setClearColor(color, 1);
    gl.setClearAlpha(1);
    const canvas = gl.domElement;
    canvas.classList.add("block", "h-full", "w-full", "bg-[#060810]");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.backgroundColor = OBSIDIAN;
    canvas.style.objectFit = "cover";
  }, [gl, scene]);

  return null;
}

function ResizeBinder({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const { gl, setSize, camera, scene } = useThree();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const applySize = (width: number, height: number) => {
      if (width < 1 || height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      gl.setPixelRatio(dpr);
      setSize(width, height, false);
      const canvas = gl.domElement;
      const bw = Math.floor(width * dpr);
      const bh = Math.floor(height * dpr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.backgroundColor = OBSIDIAN;
      canvas.style.objectFit = "cover";
      scene.background = new THREE.Color(OBSIDIAN);
      gl.setClearColor(OBSIDIAN, 1);
      gl.setClearAlpha(1);
      gl.setViewport(0, 0, bw, bh);
      gl.clear(true, true, true);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };

    const onWindowResize = () => {
      const rect = el.getBoundingClientRect();
      applySize(rect.width, rect.height);
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      applySize(width, height);
    });

    ro.observe(el);
    onWindowResize();
    window.addEventListener("resize", onWindowResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [camera, containerRef, gl, scene, setSize]);

  return null;
}

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
    const bob = Math.sin(t * 1.4 + pulse) * 0.05;
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
        color={isRouter ? SAPPHIRE : GLASS}
        emissive={SAPPHIRE}
        emissiveIntensity={0.4}
        metalness={0.2}
        roughness={0.12}
        transmission={0}
        thickness={0.5}
        ior={1.9}
        transparent={false}
        opacity={1}
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
  const length = useMemo(
    () => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)),
    [a, b]
  );
  const quat = useMemo(() => {
    const dir = new THREE.Vector3(
      b[0] - a[0],
      b[1] - a[1],
      b[2] - a[2]
    ).normalize();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir
    );
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
      <meshBasicMaterial color={SAPPHIRE_DIM} transparent opacity={0.28} />
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
      <meshBasicMaterial color={SAPPHIRE} />
    </mesh>
  );
}

function SwarmScene() {
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
    <group ref={root} position={[0, 0, 0]}>
      <ambientLight intensity={0.35} />
      <pointLight position={[2.2, 2.4, 1.5]} intensity={1.1} color={SAPPHIRE} />
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
    <div className="flex h-full w-full items-center justify-center bg-[#060810]">
      <div className="relative h-40 w-40">
        <div className="absolute inset-0 animate-pulse rounded-full border border-blue-500/30 bg-blue-600/10 blur-sm" />
        <div className="absolute inset-6 rounded-full border border-blue-400/40 bg-blue-600/15 shadow-[0_0_40px_rgba(0,102,255,0.25)]" />
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-blue-400">
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  return (
    <div
      ref={containerRef}
      className={`relative isolate aspect-[4/3] h-full w-full min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-[#060810] sm:min-h-[280px] ${className}`}
    >
      <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-blue-500/25 bg-blue-600/10 px-2.5 py-1 font-mono text-[10px] text-blue-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
        Agent mesh · live
      </div>
      <div className="absolute inset-0 bg-[#060810]">
        <CanvasErrorBoundary fallback={<FallbackMesh />}>
          <Suspense fallback={<FallbackMesh />}>
            <Canvas
              className="block h-full w-full bg-[#060810]"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                backgroundColor: OBSIDIAN,
              }}
              dpr={[1, 1.5]}
              camera={{ position: [0, 0, 4.35], fov: 40, near: 0.1, far: 40 }}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
              }}
              resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
              onCreated={({ camera, gl, scene }) => {
                camera.lookAt(0, 0, 0);
                const color = new THREE.Color(OBSIDIAN);
                scene.background = color;
                gl.setClearColor(0x060810, 1);
                gl.setClearAlpha(1);
                gl.domElement.className = "block h-full w-full bg-[#060810]";
                gl.domElement.style.backgroundColor = OBSIDIAN;
                gl.clear(true, true, true);
                setReady(true);
              }}
            >
              <SceneBackdrop />
              <ResizeBinder containerRef={containerRef} />
              <color attach="background" args={[OBSIDIAN]} />
              <SwarmScene />
            </Canvas>
          </Suspense>
        </CanvasErrorBoundary>
      </div>
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#060810]">
          <FallbackMesh />
        </div>
      ) : null}
    </div>
  );
}
