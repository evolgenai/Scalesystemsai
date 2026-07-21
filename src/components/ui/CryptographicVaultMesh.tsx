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

const SAPPHIRE = "#10B981";
const METAL = "#c8d0d8";
const BODY = "#12141a";

export type CryptographicVaultMeshProps = {
  className?: string;
  size?: number;
  active?: boolean;
  label?: string;
};

function VaultAssembly({
  scale = 1,
  active = true,
}: {
  scale?: number;
  active?: boolean;
}) {
  const root = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const glow = useRef<PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.rotation.y = t * 0.55;
      root.current.position.y = Math.sin(t * 1.4) * 0.04;
    }
    if (ring.current) {
      ring.current.rotation.z = t * 1.1;
      ring.current.rotation.x = Math.sin(t * 0.7) * 0.25;
    }
    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      const pulse = 0.55 + Math.sin(t * 3.2) * 0.45;
      mat.emissiveIntensity = active ? 0.9 + pulse * 0.85 : 0.35;
    }
    if (glow.current) {
      glow.current.intensity = active
        ? 0.55 + Math.sin(t * 3.2) * 0.35
        : 0.2;
    }
  });

  return (
    <group ref={root} scale={scale} position={[0, -0.02, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.72, 0.72, 0.72]} />
        <meshStandardMaterial
          color={BODY}
          metalness={0.92}
          roughness={0.18}
          envMapIntensity={1.2}
        />
      </mesh>

      <mesh position={[0, 0, 0.365]}>
        <boxGeometry args={[0.42, 0.42, 0.04]} />
        <meshStandardMaterial
          color={METAL}
          metalness={1}
          roughness={0.12}
          emissive={SAPPHIRE}
          emissiveIntensity={0.15}
        />
      </mesh>

      <mesh ref={core} position={[0, 0, 0.4]}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial
          color={SAPPHIRE}
          emissive={SAPPHIRE}
          emissiveIntensity={1}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>

      {[
        [-0.38, 0.38, 0.38],
        [0.38, 0.38, 0.38],
        [-0.38, -0.38, 0.38],
        [0.38, -0.38, 0.38],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <boxGeometry args={[0.06, 0.06, 0.06]} />
          <meshStandardMaterial
            color={SAPPHIRE}
            emissive={SAPPHIRE}
            emissiveIntensity={0.8}
            metalness={0.6}
            roughness={0.25}
          />
        </mesh>
      ))}

      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.018, 12, 64]} />
        <meshStandardMaterial
          color={SAPPHIRE}
          emissive={SAPPHIRE}
          emissiveIntensity={0.7}
          metalness={0.8}
          roughness={0.2}
          transparent
          opacity={0.85}
        />
      </mesh>

      <pointLight
        ref={glow}
        position={[0, 0.2, 0.8]}
        color={SAPPHIRE}
        intensity={0.6}
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
      className={`inline-flex items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 ${className ?? "h-10 w-10"}`}
      aria-hidden
      style={{ boxShadow: `0 0 14px ${SAPPHIRE}55` }}
    >
      <span
        className="h-3 w-3 rounded-sm"
        style={{ background: SAPPHIRE, boxShadow: `0 0 10px ${SAPPHIRE}` }}
      />
    </span>
  );
}

export default function CryptographicVaultMesh({
  className = "",
  size = 48,
  active = true,
  label,
}: CryptographicVaultMeshProps) {
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
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          camera={{ position: [1.15, 0.85, 1.55], fov: 34 }}
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
            <ambientLight intensity={0.4} />
            <directionalLight
              position={[2.4, 3.2, 2]}
              intensity={1.2}
              color="#e8eef5"
            />
            <pointLight position={[-1.4, 1.2, 1]} intensity={0.4} color={SAPPHIRE} />
            <VaultAssembly scale={0.95} active={active} />
          </Suspense>
        </Canvas>
      </WebGLBoundary>
    </span>
  );
}
