"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import {
  SWARM_LASER_EVENT,
  type SwarmLaserDetail,
} from "@/lib/spatial/swarmEvents";

const BIO = "#00ffaa";
const AMBER = "#fbbf24";
const CYAN = "#22d3ee";

export type SwarmClusterId = "sentry" | "meta_sre" | "sandbox";

export const SWARM_CLUSTERS: Record<
  SwarmClusterId,
  { label: string; center: [number, number, number]; color: string }
> = {
  sentry: {
    label: "Sentry Node",
    center: [18.5, 0, -4.2],
    color: AMBER,
  },
  meta_sre: {
    label: "Meta-SRE Core",
    center: [-10.2, 0, 9.8],
    color: BIO,
  },
  sandbox: {
    label: "Sandbox Executor",
    center: [8.5, 0, -8.2],
    color: CYAN,
  },
};

type OrbitAgent = {
  id: string;
  label: string;
  cluster: SwarmClusterId;
  radius: number;
  height: number;
  speed: number;
  phase: number;
};

const ORBIT_AGENTS: OrbitAgent[] = [
  {
    id: "sentry-watch",
    label: "Watch",
    cluster: "sentry",
    radius: 2.4,
    height: 1.6,
    speed: 0.55,
    phase: 0.2,
  },
  {
    id: "sentry-fix",
    label: "Fixer",
    cluster: "sentry",
    radius: 3.1,
    height: 2.1,
    speed: -0.42,
    phase: 2.1,
  },
  {
    id: "meta-orch",
    label: "Orch",
    cluster: "meta_sre",
    radius: 2.6,
    height: 1.8,
    speed: 0.48,
    phase: 0.8,
  },
  {
    id: "meta-patch",
    label: "Patch",
    cluster: "meta_sre",
    radius: 3.3,
    height: 2.4,
    speed: -0.38,
    phase: 3.4,
  },
  {
    id: "sandbox-run",
    label: "Run",
    cluster: "sandbox",
    radius: 2.5,
    height: 1.7,
    speed: 0.5,
    phase: 1.4,
  },
  {
    id: "sandbox-verify",
    label: "Verify",
    cluster: "sandbox",
    radius: 3.0,
    height: 2.2,
    speed: -0.45,
    phase: 4.0,
  },
];

type LaserPulse = {
  id: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
  duration: number;
  color: string;
};

/** Hub visual height — celestial orbs float above desert floor hitboxes. */
const HUB_Y = 3.4;

function clusterPos(id: SwarmClusterId, y = HUB_Y) {
  const c = SWARM_CLUSTERS[id].center;
  return new THREE.Vector3(c[0], y, c[2]);
}

function AgentOrb({ agent }: { agent: OrbitAgent }) {
  const root = useRef<Group>(null);
  const color = SWARM_CLUSTERS[agent.cluster].color;

  useFrame(({ clock }) => {
    if (!root.current) return;
    const t = clock.elapsedTime * agent.speed + agent.phase;
    const c = SWARM_CLUSTERS[agent.cluster].center;
    root.current.position.set(
      c[0] + Math.cos(t) * agent.radius,
      HUB_Y - 0.6 + agent.height * 0.35 + Math.sin(t * 1.7) * 0.12,
      c[2] + Math.sin(t) * agent.radius
    );
  });

  return (
    <group ref={root}>
      <mesh>
        <icosahedronGeometry args={[0.22, 1]} />
        <meshStandardMaterial
          color="#121e18"
          metalness={0.85}
          roughness={0.22}
          emissive={color}
          emissiveIntensity={0.65}
        />
      </mesh>
      <mesh scale={1.85}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
      <Html
        position={[0, 0.42, 0]}
        center
        distanceFactor={14}
        style={{ pointerEvents: "none" }}
        zIndexRange={[40, 0]}
      >
        <span
          className="whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] backdrop-blur-sm"
          style={{
            color,
            borderColor: `${color}55`,
            background: "rgba(5,8,7,0.75)",
          }}
        >
          {agent.label}
        </span>
      </Html>
    </group>
  );
}

function LaserBeam({ pulse }: { pulse: LaserPulse }) {
  const mid = useMemo(
    () => new THREE.Vector3().addVectors(pulse.from, pulse.to).multiplyScalar(0.5),
    [pulse.from, pulse.to]
  );
  const dir = useMemo(
    () => new THREE.Vector3().subVectors(pulse.to, pulse.from),
    [pulse.from, pulse.to]
  );
  const len = dir.length();
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    if (len > 1e-4) {
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    }
    return q;
  }, [dir, len]);

  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const bead = useRef<Mesh>(null);

  useFrame(() => {
    const age = (performance.now() - pulse.born) / pulse.duration;
    const life = Math.max(0, 1 - age);
    if (glowMat.current) glowMat.current.opacity = 0.12 + life * 0.35;
    if (bead.current) {
      bead.current.position.lerpVectors(pulse.from, pulse.to, Math.min(1, Math.max(0, age)));
      const m = bead.current.material as THREE.MeshBasicMaterial;
      m.opacity = life;
    }
  });

  return (
    <group>
      <mesh position={mid} quaternion={quat}>
        <cylinderGeometry args={[0.032, 0.032, Math.max(len, 0.01), 6]} />
        <meshBasicMaterial
          color={pulse.color}
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </mesh>
      <mesh position={mid} quaternion={quat}>
        <cylinderGeometry args={[0.085, 0.085, Math.max(len, 0.01), 6]} />
        <meshBasicMaterial
          ref={glowMat}
          color={pulse.color}
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={bead}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial
          color={pulse.color}
          transparent
          opacity={1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Orbiting sub-agent nodes + bioluminescent hand-off lasers.
 */
export default function SwarmAgentTopology({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const [pulses, setPulses] = useState<LaserPulse[]>([]);
  const hubRefs = useRef<Partial<Record<SwarmClusterId, Mesh | null>>>({});
  const pruneAcc = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const onLaser = (ev: Event) => {
      const detail = (ev as CustomEvent<SwarmLaserDetail>).detail;
      if (!detail) return;
      const color =
        SWARM_CLUSTERS[detail.toCluster]?.color ??
        SWARM_CLUSTERS[detail.fromCluster].color;
      setPulses((prev) =>
        [
          ...prev,
          {
            id: `laser_${performance.now()}`,
            from: clusterPos(detail.fromCluster),
            to: clusterPos(detail.toCluster),
            born: performance.now(),
            duration: detail.durationMs ?? 1600,
            color,
          },
        ].slice(-5)
      );
    };
    window.addEventListener(SWARM_LASER_EVENT, onLaser);
    return () => window.removeEventListener(SWARM_LASER_EVENT, onLaser);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const pairs: Array<[SwarmClusterId, SwarmClusterId]> = [
      ["sentry", "meta_sre"],
      ["meta_sre", "sandbox"],
      ["sandbox", "meta_sre"],
      ["meta_sre", "sentry"],
    ];
    let i = 0;
    const id = window.setInterval(() => {
      const [from, to] = pairs[i % pairs.length]!;
      i++;
      window.dispatchEvent(
        new CustomEvent(SWARM_LASER_EVENT, {
          detail: {
            fromCluster: from,
            toCluster: to,
            label: "swarm pulse",
            durationMs: 1400,
          } satisfies SwarmLaserDetail,
        })
      );
    }, 5200);
    return () => window.clearInterval(id);
  }, [enabled]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    (Object.keys(SWARM_CLUSTERS) as SwarmClusterId[]).forEach((key, idx) => {
      const mesh = hubRefs.current[key];
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.45 + Math.sin(t * 2.2 + idx) * 0.25;
      mesh.rotation.y = t * 0.35 + idx;
    });
    pruneAcc.current += delta;
    if (pruneAcc.current > 0.5) {
      pruneAcc.current = 0;
      const now = performance.now();
      setPulses((prev) => {
        const next = prev.filter((p) => now - p.born <= p.duration + 120);
        return next.length === prev.length ? prev : next;
      });
    }
  });

  if (!enabled) return null;

  return (
    <group>
      {(Object.keys(SWARM_CLUSTERS) as SwarmClusterId[]).map((key) => {
        const c = SWARM_CLUSTERS[key];
        return (
          <group key={key} position={c.center}>
            {/* Miniature glowing planet hub */}
            <mesh
              ref={(el) => {
                hubRefs.current[key] = el;
              }}
              position={[0, HUB_Y, 0]}
            >
              <icosahedronGeometry args={[0.48, 1]} />
              <meshStandardMaterial
                color="#0b120f"
                metalness={0.88}
                roughness={0.2}
                emissive={c.color}
                emissiveIntensity={0.55}
              />
            </mesh>
            <mesh position={[0, HUB_Y, 0]}>
              <octahedronGeometry args={[0.62, 0]} />
              <meshBasicMaterial
                color={c.color}
                wireframe
                transparent
                opacity={0.28}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, HUB_Y, 0]} scale={2.4}>
              <sphereGeometry args={[0.48, 12, 12]} />
              <meshBasicMaterial
                color={c.color}
                transparent
                opacity={0.1}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <Html
              position={[0, HUB_Y + 1.05, 0]}
              center
              distanceFactor={16}
              style={{ pointerEvents: "none" }}
            >
              <span
                className="whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                style={{
                  color: c.color,
                  borderColor: `${c.color}44`,
                  background: "rgba(5,8,7,0.8)",
                }}
              >
                {c.label}
              </span>
            </Html>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
              <ringGeometry args={[2.3, 2.38, 48]} />
              <meshBasicMaterial
                color={c.color}
                transparent
                opacity={0.22}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      {ORBIT_AGENTS.map((agent) => (
        <AgentOrb key={agent.id} agent={agent} />
      ))}

      {pulses.map((p) => (
        <LaserBeam key={p.id} pulse={p} />
      ))}
    </group>
  );
}
