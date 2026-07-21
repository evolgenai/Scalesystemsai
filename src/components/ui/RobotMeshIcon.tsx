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

const SAPPHIRE = "#3B82F6";
const AMBER = "#f59e0b";
const ROSE = "#f43f5e";
const METAL = "#c8d0d8";
const BODY = "#1a1a1a";

export type RobotMeshVariant = "supervisor" | "writer" | "validator" | "agent";
export type RobotMeshStatus = "idle" | "working" | "error";

export type RobotMeshProps = {
  scale?: number;
  variant?: RobotMeshVariant;
  /** Force hover spin / trail without pointer. */
  active?: boolean;
  status?: RobotMeshStatus;
  position?: [number, number, number];
};

const VARIANT_TINT: Record<RobotMeshVariant, string> = {
  supervisor: "#3B82F6",
  writer: "#60A5FA",
  validator: "#0066FF",
  agent: "#3B82F6",
};

function resolveAccent(
  variant: RobotMeshVariant,
  status: RobotMeshStatus
): string {
  if (status === "error") return ROSE;
  if (status === "working") return SAPPHIRE;
  return VARIANT_TINT[variant];
}

function statusMotion(status: RobotMeshStatus, hot: boolean) {
  if (status === "error") {
    return {
      ringMul: hot ? 3.2 : 2.4,
      pulseHz: 14,
      bodySpin: hot ? 2.6 : 1.4,
      floatAmp: 0.09,
      glowBase: 1.35,
      trail: true,
    };
  }
  if (status === "working") {
    return {
      ringMul: hot ? 4.2 : 3.4,
      pulseHz: 11,
      bodySpin: hot ? 2.8 : 1.9,
      floatAmp: 0.08,
      glowBase: 1.15,
      trail: true,
    };
  }
  return {
    ringMul: hot ? 2.4 : 0.9,
    pulseHz: hot ? 8 : 3.2,
    bodySpin: hot ? 1.8 : 0.35,
    floatAmp: 0.06,
    glowBase: hot ? 1.4 : 0.45,
    trail: hot,
  };
}

/**
 * Polished geometric agent rig — metallic visor capsule, hover rings, SAPPHIRE core.
 * Status drives ring velocity, core pulse, and glow palette.
 */
export function RobotMesh({
  scale = 1,
  variant = "agent",
  active = false,
  status = "idle",
  position = [0, 0, 0],
}: RobotMeshProps) {
  const root = useRef<Group>(null);
  const ringA = useRef<Mesh>(null);
  const ringB = useRef<Mesh>(null);
  const core = useRef<Mesh>(null);
  const visorBar = useRef<Mesh>(null);
  const chassis = useRef<Mesh>(null);
  const trail = useRef<THREE.Points>(null);
  const glow = useRef<PointLight>(null);
  const [hovered, setHovered] = useState(false);
  const accent = useMemo(
    () => resolveAccent(variant, status),
    [variant, status]
  );
  const secondary =
    status === "error" ? AMBER : status === "working" ? "#93C5FD" : "#93C5FD";
  const trailPos = useRef(new Float32Array(24 * 3));

  useEffect(() => {
    const color = new THREE.Color(accent);
    const setEmissive = (mesh: Mesh | null, intensity: number) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(color);
      mat.color.copy(color);
      mat.emissiveIntensity = intensity;
      mat.needsUpdate = true;
    };
    setEmissive(core.current, status === "error" ? 1.3 : 1);
    setEmissive(visorBar.current, status === "error" ? 1.4 : 1.1);
    if (ringA.current) {
      const mat = ringA.current.material as THREE.MeshStandardMaterial;
      mat.color.copy(color);
      mat.emissive.copy(color);
      mat.needsUpdate = true;
    }
    if (ringB.current) {
      const mat = ringB.current.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(color);
      mat.color.set(secondary);
      mat.needsUpdate = true;
    }
    if (chassis.current) {
      const mat = chassis.current.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(color);
      mat.emissiveIntensity = status === "error" ? 0.22 : 0.08;
      mat.needsUpdate = true;
    }
    if (glow.current) glow.current.color.set(accent);
    if (trail.current) {
      const mat = trail.current.material as THREE.PointsMaterial;
      mat.color.set(accent);
    }
  }, [accent, secondary, status]);

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const hot = hovered || active || status === "working";
    const m = statusMotion(status, hot);
    const damp = Math.min(1, dt * 8);
    const errJitter = status === "error" ? Math.sin(t * 28) * 0.02 : 0;

    g.position.y =
      position[1] + Math.sin(t * 1.6 + scale) * m.floatAmp + errJitter;
    g.rotation.y += m.bodySpin * dt;
    if (hot || status !== "idle") {
      g.rotation.x +=
        ((status === "error" ? 0.28 : 0.18) - g.rotation.x) * damp;
      g.rotation.z +=
        (Math.sin(t * (status === "working" ? 7 : 4)) * 0.1 - g.rotation.z) *
        damp;
    } else {
      g.rotation.x += (0 - g.rotation.x) * damp;
      g.rotation.z += (0 - g.rotation.z) * damp;
    }

    if (ringA.current) {
      ringA.current.rotation.x = Math.PI / 2 + Math.sin(t * 1.2) * 0.15;
      ringA.current.rotation.z = t * m.ringMul;
    }
    if (ringB.current) {
      ringB.current.rotation.y = t * -(m.ringMul * 0.85);
      ringB.current.rotation.x = Math.PI / 2.4;
    }

    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      const pulse = 0.55 + Math.sin(t * m.pulseHz) * 0.45;
      mat.emissiveIntensity =
        pulse * (status === "error" ? 1.9 : status === "working" ? 1.7 : hot ? 1.6 : 1);
      core.current.scale.setScalar(0.92 + pulse * 0.14);
    }

    if (glow.current) {
      glow.current.intensity =
        m.glowBase + Math.sin(t * (status === "error" ? 16 : 10)) * 0.35;
    }

    if (trail.current) {
      trail.current.visible = m.trail;
      if (m.trail) {
        const arr = trailPos.current;
        const speed = status === "working" ? 5.5 : status === "error" ? 6.2 : 3.5;
        for (let i = 0; i < 24; i++) {
          const u = i / 24;
          const a = t * speed + u * Math.PI * 2;
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
      <mesh ref={chassis} castShadow position={[0, -0.05, 0]}>
        <capsuleGeometry args={[0.22, 0.28, 6, 12]} />
        <meshStandardMaterial
          color={BODY}
          metalness={0.72}
          roughness={0.28}
          emissive={accent}
          emissiveIntensity={0.08}
        />
      </mesh>

      <mesh position={[0, 0.22, 0.12]} rotation={[0.15, 0, 0]}>
        <capsuleGeometry args={[0.14, 0.12, 4, 10]} />
        <meshStandardMaterial
          color={METAL}
          metalness={0.95}
          roughness={0.12}
          envMapIntensity={1.2}
        />
      </mesh>
      <mesh ref={visorBar} position={[0, 0.22, 0.2]}>
        <boxGeometry args={[0.18, 0.06, 0.04]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={1.1}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>

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
          color={secondary}
          emissive={accent}
          emissiveIntensity={0.4}
          metalness={0.85}
          roughness={0.2}
          transparent
          opacity={0.75}
        />
      </mesh>

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
      className={`inline-flex items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 ${className ?? "h-10 w-10"}`}
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
  status?: RobotMeshStatus;
  label?: string;
};

export default function RobotMeshIcon({
  className = "",
  size = 44,
  variant = "agent",
  active = false,
  status = "idle",
  label,
}: RobotMeshIconProps) {
  const [ok, setOk] = useState(false);
  const accent = resolveAccent(variant, status);

  useEffect(() => {
    setOk(supportsWebGL());
  }, []);

  const fallback = (
    <FlatRobotFallback
      className={`h-full w-full ${className}`}
      accent={accent}
    />
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
            <pointLight
              position={[-1.2, 1.4, 1]}
              intensity={0.35}
              color={accent}
            />
            <RobotMesh
              scale={0.95}
              variant={variant}
              active={active}
              status={status}
            />
          </Suspense>
        </Canvas>
      </RobotWebGLBoundary>
    </span>
  );
}
