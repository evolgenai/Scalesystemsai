"use client";

import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh, PointLight } from "three";

const AMBER = "#F59E0B";
const IDLE = "#64748b";
const BODY = "#141210";
const METAL = "#d4c4a8";

export type WarningBeaconMeshProps = {
  className?: string;
  size?: number;
  /** Amber alert state when true. */
  active?: boolean;
  label?: string;
};

function BeaconAssembly({
  scale = 1,
  active = false,
}: {
  scale?: number;
  active?: boolean;
}) {
  const root = useRef<Group>(null);
  const crystal = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const glow = useRef<PointLight>(null);
  const accent = active ? AMBER : IDLE;

  useEffect(() => {
    const apply = (mesh: Mesh | null, intensity: number) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(accent);
      mat.emissive.set(accent);
      mat.emissiveIntensity = intensity;
      mat.needsUpdate = true;
    };
    apply(crystal.current, active ? 1.35 : 0.35);
    apply(ring.current, active ? 0.9 : 0.2);
    if (glow.current) glow.current.color.set(accent);
  }, [accent, active]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.rotation.y = t * 0.35;
    }
    if (crystal.current) {
      crystal.current.rotation.y = t * 0.9;
      const mat = crystal.current.material as THREE.MeshStandardMaterial;
      const pulse = active ? 0.7 + Math.sin(t * 5.5) * 0.55 : 0.25;
      mat.emissiveIntensity = pulse;
    }
    if (ring.current) {
      ring.current.rotation.z = -t * 0.65;
    }
    if (glow.current) {
      glow.current.intensity = active
        ? 0.85 + Math.sin(t * 5.5) * 0.45
        : 0.18;
    }
  });

  return (
    <group ref={root} scale={scale}>
      <mesh position={[0, -0.42, 0]}>
        <cylinderGeometry args={[0.38, 0.48, 0.14, 6]} />
        <meshStandardMaterial
          color={BODY}
          metalness={0.88}
          roughness={0.22}
        />
      </mesh>

      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[0.12, 0.22, 0.28, 6]} />
        <meshStandardMaterial
          color={METAL}
          metalness={0.95}
          roughness={0.15}
        />
      </mesh>

      <mesh ref={crystal} position={[0, 0.12, 0]}>
        <coneGeometry args={[0.28, 0.62, 6]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={active ? 1.2 : 0.3}
          metalness={0.35}
          roughness={0.18}
          transparent
          opacity={0.92}
        />
      </mesh>

      <mesh position={[0, 0.48, 0]}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial
          color="#fff7ed"
          emissive={accent}
          emissiveIntensity={active ? 1.4 : 0.25}
          metalness={0.2}
          roughness={0.1}
        />
      </mesh>

      <mesh ref={ring} position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.016, 10, 48]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={active ? 0.9 : 0.2}
          metalness={0.7}
          roughness={0.25}
          transparent
          opacity={0.8}
        />
      </mesh>

      <pointLight
        ref={glow}
        position={[0, 0.35, 0.55]}
        color={accent}
        intensity={0.4}
        distance={3.2}
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

function FlatFallback({
  className,
  active,
}: {
  className?: string;
  active: boolean;
}) {
  const c = active ? AMBER : IDLE;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border bg-white/[0.03] ${className ?? "h-10 w-10"}`}
      aria-hidden
      style={{
        borderColor: `${c}55`,
        boxShadow: active ? `0 0 16px ${c}66` : undefined,
      }}
    >
      <span
        className="h-0 w-0 border-x-[6px] border-b-[12px] border-x-transparent"
        style={{ borderBottomColor: c, filter: `drop-shadow(0 0 6px ${c})` }}
      />
    </span>
  );
}

export default function WarningBeaconMesh({
  className = "",
  size = 52,
  active = false,
  label,
}: WarningBeaconMeshProps) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(supportsWebGL());
  }, []);

  const fallback = (
    <FlatFallback className={`h-full w-full ${className}`} active={active} />
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
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          camera={{ position: [1.05, 0.75, 1.65], fov: 34 }}
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
            <ambientLight intensity={0.45} />
            <directionalLight
              position={[2.2, 3.4, 1.8]}
              intensity={1.1}
              color="#fff8eb"
            />
            <pointLight
              position={[-1.2, 1.1, 1]}
              intensity={0.35}
              color={active ? AMBER : IDLE}
            />
            <BeaconAssembly scale={0.95} active={active} />
          </Suspense>
        </Canvas>
      </WebGLBoundary>
    </span>
  );
}
