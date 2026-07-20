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

const EMERALD = "#34d399";
const METAL = "#c8d0d8";
const BODY = "#1a1a1a";

export type RobotMeshVariant = "supervisor" | "writer" | "validator" | "agent";

export type RobotMeshProps = {
  /** World scale of the assembled rig. */
  scale?: number;
  variant?: RobotMeshVariant;
  /** Force hover spin / trail without pointer (e.g. active agent). */
  active?: boolean;
  position?: [number, number, number];
};

const VARIANT_TINT: Record<RobotMeshVariant, string> = {
  supervisor: "#34d399",
  writer: "#6ee7b7",
  validator: "#10b981",
  agent: "#34d399",
};

/**
 * Polished geometric agent rig — metallic visor capsule, hover rings, emerald core.
 * Intended for placement inside an existing R3F `<Canvas>`.
 */
export function RobotMesh({
  scale = 1,
  variant = "agent",
  active = false,
  position = [0, 0, 0],
}: RobotMeshProps) {
  const root = useRef<Group>(null);
  const ringA = useRef<Mesh>(null);
  const ringB = useRef<Mesh>(null);
  const core = useRef<Mesh>(null);
  const trail = useRef<THREE.Points>(null);
  const glow = useRef<PointLight>(null);
  const [hovered, setHovered] = useState(false);
  const accent = VARIANT_TINT[variant];
  const trailPos = useRef(new Float32Array(24 * 3));

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const hot = hovered || active;
    const damp = Math.min(1, dt * 8);

    g.position.y = position[1] + Math.sin(t * 1.6 + scale) * 0.06;
    g.rotation.y += (hot ? 1.8 : 0.35) * dt;
    if (hot) {
      g.rotation.x += (0.18 - g.rotation.x) * damp;
      g.rotation.z += (Math.sin(t * 4) * 0.08 - g.rotation.z) * damp;
    } else {
      g.rotation.x += (0 - g.rotation.x) * damp;
      g.rotation.z += (0 - g.rotation.z) * damp;
    }

    if (ringA.current) {
      ringA.current.rotation.x = Math.PI / 2 + Math.sin(t * 1.2) * 0.15;
      ringA.current.rotation.z = t * (hot ? 2.4 : 0.9);
    }
    if (ringB.current) {
      ringB.current.rotation.y = t * (hot ? -2.1 : -0.7);
      ringB.current.rotation.x = Math.PI / 2.4;
    }

    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      const pulse = 0.55 + Math.sin(t * (hot ? 8 : 3.2)) * 0.45;
      mat.emissiveIntensity = pulse * (hot ? 1.6 : 1);
      core.current.scale.setScalar(0.92 + pulse * 0.12);
    }

    if (glow.current) {
      glow.current.intensity = hot ? 1.4 + Math.sin(t * 10) * 0.35 : 0.45;
    }

    if (trail.current) {
      trail.current.visible = hot;
      if (hot) {
        const arr = trailPos.current;
        for (let i = 0; i < 24; i++) {
          const u = i / 24;
          const a = t * 3.5 + u * Math.PI * 2;
          arr[i * 3] = Math.cos(a) * (0.55 + u * 0.25);
          arr[i * 3 + 1] = Math.sin(t * 5 + u * 6) * 0.12 + u * 0.35;
          arr[i * 3 + 2] = Math.sin(a) * (0.55 + u * 0.25);
        }
        const attr = trail.current.geometry.getAttribute(
          "position"
        ) as THREE.BufferAttribute;
        attr.needsUpdate = true;
      }
    }
  });

  return (
    <group
      ref={root}
      position={position}
      scale={scale}
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
      {/* Chassis */}
      <mesh castShadow position={[0, -0.05, 0]}>
        <capsuleGeometry args={[0.22, 0.28, 6, 12]} />
        <meshStandardMaterial
          color={BODY}
          metalness={0.72}
          roughness={0.28}
          emissive={accent}
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Metallic visor capsule */}
      <mesh position={[0, 0.22, 0.12]} rotation={[0.15, 0, 0]}>
        <capsuleGeometry args={[0.14, 0.12, 4, 10]} />
        <meshStandardMaterial
          color={METAL}
          metalness={0.95}
          roughness={0.12}
          envMapIntensity={1.2}
        />
      </mesh>
      <mesh position={[0, 0.22, 0.2]}>
        <boxGeometry args={[0.18, 0.06, 0.04]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={1.1}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>

      {/* Articulated hover rings */}
      <mesh ref={ringA} position={[0, -0.02, 0]}>
        <torusGeometry args={[0.42, 0.018, 8, 48]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.65}
          metalness={0.8}
          roughness={0.25}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh ref={ringB} position={[0, 0.08, 0]} scale={[0.78, 0.78, 0.78]}>
        <torusGeometry args={[0.38, 0.012, 8, 40]} />
        <meshStandardMaterial
          color="#a7f3d0"
          emissive={accent}
          emissiveIntensity={0.4}
          metalness={0.85}
          roughness={0.2}
          transparent
          opacity={0.75}
        />
      </mesh>

      {/* Pulsing emerald core */}
      <mesh ref={core} position={[0, -0.02, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={1}
          metalness={0.35}
          roughness={0.15}
        />
      </mesh>

      <pointLight
        ref={glow}
        position={[0, 0.1, 0.3]}
        color={accent}
        intensity={0.5}
        distance={2.4}
        decay={2}
      />

      {/* Hover light trail */}
      <points ref={trail} visible={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={24}
            array={trailPos.current}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color={accent}
          size={0.045}
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </points>
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

class RobotWebGLBoundary extends Component<
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

function FlatRobotFallback({
  className,
  accent,
}: {
  className?: string;
  accent: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 ${className ?? "h-10 w-10"}`}
      aria-hidden
      style={{ boxShadow: `0 0 12px ${accent}44` }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
      />
    </span>
  );
}

export type RobotMeshIconProps = {
  className?: string;
  size?: number;
  variant?: RobotMeshVariant;
  active?: boolean;
  /** Accessible label when not decorative. */
  label?: string;
};

/**
 * Standalone mini-canvas badge for dashboard HTML panes (marketplace, orchestrator).
 */
export default function RobotMeshIcon({
  className = "",
  size = 44,
  variant = "agent",
  active = false,
  label,
}: RobotMeshIconProps) {
  const [ok, setOk] = useState(false);
  const accent = VARIANT_TINT[variant];

  useEffect(() => {
    setOk(supportsWebGL());
  }, []);

  const fallback = (
    <FlatRobotFallback
      className={`h-full w-full ${className}`}
      accent={accent}
    />
  );

  /** Decoration never capture dashboard pointer routing — parent Hover3DIcon drives hover. */
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
      <RobotWebGLBoundary fallback={fallback}>
        <Canvas
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          camera={{ position: [0.9, 0.55, 1.35], fov: 36 }}
          className="pointer-events-none h-full w-full"
          style={{
            background: "transparent",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
          onCreated={({ gl, camera }) => {
            gl.setClearColor(0x000000, 0);
            camera.lookAt(0, 0.05, 0);
          }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.55} />
            <directionalLight
              position={[2.5, 3.5, 2]}
              intensity={1.15}
              color="#e8eef5"
            />
            <pointLight position={[-1.2, 1.4, 1]} intensity={0.35} color={accent} />
            <RobotMesh scale={0.95} variant={variant} active={active} />
          </Suspense>
        </Canvas>
      </RobotWebGLBoundary>
    </span>
  );
}
