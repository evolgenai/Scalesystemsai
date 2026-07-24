"use client";

/**
 * Celestial "Agent mesh - live" constellation — glowing alien stars & miniature
 * planets orbiting overhead, linked by bioluminescent data beams that pulse on hand-offs.
 * Ground-level SwarmAgentTopology / hitboxes remain separate for gameplay.
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import { SWARM_LASER_EVENT } from "@/lib/spatial/swarmEvents";

const BIO = "#00ffaa";
const AMBER = "#fbbf24";
const CYAN = "#22d3ee";
const VIOLET = "#a78bfa";

type CelestialBody = {
  id: string;
  label: string;
  /** Base orbit center in world space */
  home: [number, number, number];
  radius: number;
  speed: number;
  phase: number;
  color: string;
  kind: "planet" | "star" | "core" | "diamond";
  size: number;
};

const MESH_BODIES: CelestialBody[] = [
  {
    id: "security_sentinel",
    label: "Security Sentinel",
    home: [2, 22, -18],
    radius: 4.2,
    speed: 0.22,
    phase: 0.4,
    color: AMBER,
    kind: "diamond",
    size: 0.85,
  },
  {
    id: "meta_sre_core",
    label: "Meta-SRE Core",
    home: [0, 26, -22],
    radius: 0,
    speed: 0.12,
    phase: 0,
    color: BIO,
    kind: "core",
    size: 1.35,
  },
  {
    id: "sandbox_executor",
    label: "Sandbox Executor",
    home: [-6, 20, -14],
    radius: 5.1,
    speed: -0.18,
    phase: 1.8,
    color: CYAN,
    kind: "planet",
    size: 0.95,
  },
  {
    id: "database_auditor",
    label: "Database Auditor",
    home: [7, 19, -16],
    radius: 4.6,
    speed: 0.2,
    phase: 3.2,
    color: VIOLET,
    kind: "star",
    size: 0.75,
  },
  {
    id: "sat_a",
    label: "",
    home: [-2, 24, -20],
    radius: 6.5,
    speed: 0.35,
    phase: 0.9,
    color: AMBER,
    kind: "planet",
    size: 0.4,
  },
  {
    id: "sat_b",
    label: "",
    home: [4, 23, -24],
    radius: 5.8,
    speed: -0.28,
    phase: 2.5,
    color: BIO,
    kind: "star",
    size: 0.32,
  },
];

const LINKS: Array<[string, string]> = [
  ["meta_sre_core", "security_sentinel"],
  ["meta_sre_core", "sandbox_executor"],
  ["meta_sre_core", "database_auditor"],
  ["security_sentinel", "sandbox_executor"],
  ["sandbox_executor", "database_auditor"],
  ["meta_sre_core", "sat_a"],
  ["meta_sre_core", "sat_b"],
];

type BeamPulse = {
  id: string;
  a: string;
  b: string;
  born: number;
  duration: number;
};

function BodyMesh({
  body,
  posRef,
}: {
  body: CelestialBody;
  posRef: MutableRefObject<Map<string, THREE.Vector3>>;
}) {
  const root = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!root.current) return;
    const t = clock.elapsedTime * body.speed + body.phase;
    const [hx, hy, hz] = body.home;
    const x = hx + Math.cos(t) * body.radius;
    const y = hy + Math.sin(t * 1.3) * 0.55;
    const z = hz + Math.sin(t) * body.radius * 0.85;
    root.current.position.set(x, y, z);
    root.current.rotation.y = t * 0.6;
    root.current.rotation.x = Math.sin(t * 0.7) * 0.15;
    let v = posRef.current.get(body.id);
    if (!v) {
      v = new THREE.Vector3();
      posRef.current.set(body.id, v);
    }
    v.set(x, y, z);
  });

  const glow = body.color;

  return (
    <group ref={root}>
      {body.kind === "core" ? (
        <>
          <mesh castShadow>
            <icosahedronGeometry args={[body.size, 1]} />
            <meshStandardMaterial
              color="#0b120f"
              metalness={0.92}
              roughness={0.15}
              emissive={glow}
              emissiveIntensity={0.85}
            />
          </mesh>
          <mesh scale={1.35}>
            <icosahedronGeometry args={[body.size, 0]} />
            <meshBasicMaterial
              color={glow}
              wireframe
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>
        </>
      ) : null}
      {body.kind === "diamond" ? (
        <mesh castShadow>
          <octahedronGeometry args={[body.size, 0]} />
          <meshStandardMaterial
            color="#121e18"
            metalness={0.9}
            roughness={0.2}
            emissive={glow}
            emissiveIntensity={0.75}
          />
        </mesh>
      ) : null}
      {body.kind === "planet" ? (
        <>
          <mesh castShadow>
            <sphereGeometry args={[body.size, 24, 24]} />
            <meshStandardMaterial
              color="#1a3d32"
              metalness={0.4}
              roughness={0.45}
              emissive={glow}
              emissiveIntensity={0.4}
            />
          </mesh>
          <mesh scale={1.08}>
            <sphereGeometry args={[body.size, 16, 16]} />
            <meshBasicMaterial
              color={glow}
              transparent
              opacity={0.14}
              depthWrite={false}
            />
          </mesh>
        </>
      ) : null}
      {body.kind === "star" ? (
        <>
          <mesh>
            <tetrahedronGeometry args={[body.size, 0]} />
            <meshStandardMaterial
              color="#1a1510"
              metalness={0.85}
              roughness={0.25}
              emissive={glow}
              emissiveIntensity={1.1}
            />
          </mesh>
          <pointLight color={glow} intensity={1.4} distance={12} decay={2} />
        </>
      ) : null}
      <mesh scale={2.4}>
        <sphereGeometry args={[body.size * 0.55, 12, 12]} />
        <meshBasicMaterial
          color={glow}
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {body.label ? (
        <Html
          position={[0, body.size + 0.85, 0]}
          center
          distanceFactor={22}
          style={{ pointerEvents: "none" }}
          zIndexRange={[30, 0]}
        >
          <span
            className="whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider backdrop-blur-sm"
            style={{
              color: glow,
              borderColor: `${glow}55`,
              background: "rgba(5,8,7,0.78)",
            }}
          >
            {body.label}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

function DataBeam({
  aId,
  bId,
  posRef,
  pulseBoost,
}: {
  aId: string;
  bId: string;
  posRef: MutableRefObject<Map<string, THREE.Vector3>>;
  pulseBoost: number;
}) {
  const cyl = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const scratch = useMemo(
    () => ({
      mid: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      q: new THREE.Quaternion(),
    }),
    []
  );

  useFrame(({ clock }) => {
    const a = posRef.current.get(aId);
    const b = posRef.current.get(bId);
    if (!a || !b || !cyl.current || !glow.current) return;
    const { mid, dir, up, q } = scratch;
    mid.addVectors(a, b).multiplyScalar(0.5);
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-3) return;
    q.setFromUnitVectors(up, dir.normalize());
    cyl.current.position.copy(mid);
    cyl.current.quaternion.copy(q);
    cyl.current.scale.set(1, len, 1);
    glow.current.position.copy(mid);
    glow.current.quaternion.copy(q);
    glow.current.scale.set(1, len, 1);
    const pulse =
      0.35 +
      Math.sin(clock.elapsedTime * 3.2 + aId.length) * 0.15 +
      pulseBoost;
    if (mat.current) mat.current.opacity = Math.min(0.95, 0.45 + pulse * 0.35);
    if (glowMat.current)
      glowMat.current.opacity = Math.min(0.55, 0.12 + pulse * 0.28);
  });

  return (
    <group>
      <mesh ref={cyl}>
        <cylinderGeometry args={[0.028, 0.028, 1, 6]} />
        <meshBasicMaterial
          ref={mat}
          color={BIO}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={glow}>
        <cylinderGeometry args={[0.09, 0.09, 1, 6]} />
        <meshBasicMaterial
          ref={glowMat}
          color={BIO}
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

export default function CelestialAgentMesh({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const posRef = useRef(new Map<string, THREE.Vector3>());
  const [pulses, setPulses] = useState<BeamPulse[]>([]);
  const boostRef = useRef(0);
  const labelRef = useRef<Group>(null);
  const pruneAcc = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const onLaser = () => {
      boostRef.current = 1;
      const links = LINKS.slice(0, 4);
      const pick = links[Math.floor(Math.random() * links.length)]!;
      setPulses((prev) =>
        [
          ...prev,
          {
            id: `cel_${performance.now()}`,
            a: pick[0],
            b: pick[1],
            born: performance.now(),
            duration: 1600,
          },
        ].slice(-4)
      );
    };
    window.addEventListener(SWARM_LASER_EVENT, onLaser);
    return () => window.removeEventListener(SWARM_LASER_EVENT, onLaser);
  }, [enabled]);

  useFrame((_, dt) => {
    boostRef.current = Math.max(0, boostRef.current - dt * 0.85);
    if (labelRef.current) {
      labelRef.current.position.y =
        28 + Math.sin(performance.now() * 0.001) * 0.35;
    }
    pruneAcc.current += dt;
    if (pruneAcc.current > 0.4) {
      pruneAcc.current = 0;
      const now = performance.now();
      setPulses((prev) => {
        const next = prev.filter((p) => now - p.born <= p.duration);
        return next.length === prev.length ? prev : next;
      });
    }
  });

  const pulseIds = useMemo(
    () => new Set(pulses.flatMap((p) => [p.a, p.b])),
    [pulses]
  );

  if (!enabled) return null;

  return (
    <group>
      <group ref={labelRef} position={[0, 28, -20]}>
        <Html center distanceFactor={28} style={{ pointerEvents: "none" }}>
          <div
            className="whitespace-nowrap rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{
              color: BIO,
              borderColor: `${BIO}44`,
              background: "rgba(5,8,7,0.72)",
              boxShadow: `0 0 18px ${BIO}33`,
            }}
          >
            Agent mesh — live
          </div>
        </Html>
      </group>

      {MESH_BODIES.map((body) => (
        <BodyMesh key={body.id} body={body} posRef={posRef} />
      ))}

      {LINKS.map(([a, b]) => {
        const hot = pulseIds.has(a) && pulseIds.has(b);
        return (
          <DataBeam
            key={`${a}-${b}`}
            aId={a}
            bId={b}
            posRef={posRef}
            pulseBoost={hot ? boostRef.current + 0.55 : boostRef.current * 0.35}
          />
        );
      })}
    </group>
  );
}
