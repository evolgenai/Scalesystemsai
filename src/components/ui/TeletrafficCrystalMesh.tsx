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
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh, PointLight } from "three";

const EMERALD = "#10B981";
const CYAN = "#34d399";
const GLASS = "#a7f3d0";

export type TeletrafficCrystalMeshProps = {
  className?: string;
  size?: number;
  active?: boolean;
  label?: string;
};

function Prism({
  position,
  scale,
  speed,
  phase,
}: {
  position: [number, number, number];
  scale: number;
  speed: number;
  phase: number;
}) {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!mesh.current) return;
    mesh.current.rotation.x = t * speed * 0.55 + phase;
    mesh.current.rotation.y = t * speed * 0.85 + phase * 0.6;
    mesh.current.position.y =
      position[1] + Math.sin(t * 1.3 + phase) * 0.06;
    const mat = mesh.current.material as THREE.MeshPhysicalMaterial;
    mat.iridescence = 0.55 + Math.sin(t * 2 + phase) * 0.25;
    mat.emissiveIntensity = 0.25 + Math.sin(t * 2.4 + phase) * 0.2;
  });

  return (
    <mesh ref={mesh} position={position} scale={scale}>
      <octahedronGeometry args={[0.38, 0]} />
      <meshPhysicalMaterial
        color={GLASS}
        emissive={EMERALD}
        emissiveIntensity={0.3}
        metalness={0.15}
        roughness={0.08}
        transmission={0.65}
        thickness={0.55}
        ior={2.2}
        transparent
        opacity={0.88}
        iridescence={0.6}
        iridescenceIOR={1.8}
        clearcoat={1}
        clearcoatRoughness={0.08}
      />
    </mesh>
  );
}

function CrystalCluster({
  scale = 1,
  active = true,
}: {
  scale?: number;
  active?: boolean;
}) {
  const root = useRef<Group>(null);
  const glow = useRef<PointLight>(null);
  const crystals = useMemo(
    () =>
      [
        { pos: [0, 0.05, 0] as [number, number, number], s: 1, sp: 0.7, ph: 0 },
        {
          pos: [-0.42, -0.12, 0.18] as [number, number, number],
          s: 0.55,
          sp: 1.05,
          ph: 1.2,
        },
        {
          pos: [0.4, -0.08, -0.15] as [number, number, number],
          s: 0.48,
          sp: 0.9,
          ph: 2.4,
        },
      ] as const,
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.rotation.y = t * 0.28;
    }
    if (glow.current) {
      glow.current.intensity = active
        ? 0.55 + Math.sin(t * 2.2) * 0.25
        : 0.2;
    }
  });

  return (
    <group ref={root} scale={scale}>
      {crystals.map((c, i) => (
        <Prism
          key={i}
          position={c.pos}
          scale={c.s}
          speed={c.sp}
          phase={c.ph}
        />
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.38, 0]}>
        <torusGeometry args={[0.55, 0.012, 10, 64]} />
        <meshStandardMaterial
          color={CYAN}
          emissive={EMERALD}
          emissiveIntensity={0.55}
          metalness={0.7}
          roughness={0.25}
          transparent
          opacity={0.7}
        />
      </mesh>
      <pointLight
        ref={glow}
        position={[0.2, 0.4, 0.7]}
        color={EMERALD}
        intensity={0.5}
        distance={3}
        decay={2}
      />
    </group>
  );
}

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

class WebGLBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_e: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function FlatFallback({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border border-emerald-500/25 bg-white/[0.03] ${className ?? "h-10 w-10"}`}
      aria-hidden
      style={{ boxShadow: `0 0 14px ${EMERALD}44` }}
    >
      <span
        className="h-3.5 w-3.5 rotate-45 border border-emerald-400/60 bg-emerald-400/30"
        style={{ boxShadow: `0 0 10px ${EMERALD}` }}
      />
    </span>
  );
}

export default function TeletrafficCrystalMesh({
  className = "",
  size = 56,
  active = true,
  label,
}: TeletrafficCrystalMeshProps) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(supportsWebGL());
  }, []);

  const fallback = (
    <FlatFallback className={`h-full w-full ${className}`} />
  );
  const shellClass = `pointer-events-none relative inline-flex shrink-0 overflow-hidden ${className}`;

  if (!ok) {
    return (
      <span
        className={shellClass}
        style={{ width: size, height: size, pointerEvents: "none" }}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      className={shellClass}
      style={{ width: size, height: size, pointerEvents: "none" }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <WebGLBoundary fallback={fallback}>
        <Canvas
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "low-power",
          }}
          camera={{ position: [1.2, 0.7, 1.7], fov: 34 }}
          className="pointer-events-none h-full w-full"
          style={{
            background: "transparent",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
          onCreated={({ gl, camera }) => {
            gl.setClearColor(0x000000, 0);
            camera.lookAt(0, 0, 0);
          }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[2.5, 3.2, 2]}
              intensity={1.25}
              color="#e8fff5"
            />
            <pointLight position={[-1.3, 1.2, 1]} intensity={0.45} color={CYAN} />
            <CrystalCluster scale={0.95} active={active} />
          </Suspense>
        </Canvas>
      </WebGLBoundary>
    </span>
  );
}
