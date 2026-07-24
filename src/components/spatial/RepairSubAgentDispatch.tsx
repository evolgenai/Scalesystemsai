"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import type { PredictiveDispatchTarget } from "@/lib/spatial/predictiveTune";
import { useWorkspaceScope } from "@/components/navigation/WorkspaceScopeContext";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { emitSwarmLaser } from "@/lib/spatial/swarmEvents";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";

const BIO = "#00ffaa";
const META_SPAWN: [number, number, number] = [-10.2, 3.4, 9.8];

type TuneResponse = {
  success?: boolean;
  tune?: {
    targets: PredictiveDispatchTarget[];
  };
};

type ActiveMission = {
  id: string;
  target: PredictiveDispatchTarget;
  born: number;
  duration: number;
  phase: "transit" | "repair" | "done";
};

function RepairDrone({ mission }: { mission: ActiveMission }) {
  const root = useRef<Group>(null);
  const beam = useRef<Mesh>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const from = useMemo(() => new THREE.Vector3(...META_SPAWN), []);
  const to = useMemo(
    () =>
      new THREE.Vector3(
        mission.target.position[0],
        mission.target.position[1] + 1.8,
        mission.target.position[2]
      ),
    [mission.target.position]
  );
  const mid = useMemo(
    () => new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5),
    [from, to]
  );
  const dir = useMemo(
    () => new THREE.Vector3().subVectors(to, from),
    [from, to]
  );
  const len = dir.length();
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    if (len > 1e-4) {
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    }
    return q;
  }, [dir, len]);

  useFrame(({ clock }) => {
    if (!root.current) return;
    const age = (performance.now() - mission.born) / mission.duration;
    const transitEnd = 0.55;
    let t = Math.min(1, Math.max(0, age));
    let phase: ActiveMission["phase"] = "transit";
    if (age >= transitEnd && age < 1) phase = "repair";
    if (age >= 1) phase = "done";

    const travelT = Math.min(1, age / transitEnd);
    // ease-in-out
    const eased =
      travelT < 0.5
        ? 2 * travelT * travelT
        : 1 - Math.pow(-2 * travelT + 2, 2) / 2;
    root.current.position.lerpVectors(from, to, eased);
    root.current.position.y += Math.sin(clock.elapsedTime * 8 + eased * 6) * 0.08;
    root.current.visible = phase !== "done";

    if (beam.current) {
      beam.current.visible = phase === "repair";
      if (glowMat.current) {
        glowMat.current.opacity =
          0.15 + Math.sin(clock.elapsedTime * 14) * 0.12;
      }
    }
  });

  return (
    <group>
      <group ref={root}>
        <mesh>
          <octahedronGeometry args={[0.28, 0]} />
          <meshStandardMaterial
            color="#0b120f"
            metalness={0.9}
            roughness={0.18}
            emissive={BIO}
            emissiveIntensity={0.85}
          />
        </mesh>
        <mesh scale={2.1}>
          <sphereGeometry args={[0.28, 12, 12]} />
          <meshBasicMaterial
            color={BIO}
            transparent
            opacity={0.14}
            depthWrite={false}
          />
        </mesh>
        <Html
          position={[0, 0.5, 0]}
          center
          distanceFactor={14}
          style={{ pointerEvents: "none" }}
        >
          <span className="whitespace-nowrap rounded border border-[#00ffaa]/40 bg-[#050807]/85 px-1.5 py-0.5 font-mono text-[9px] text-[#00ffaa]">
            repair · {mission.target.riskPct}%
          </span>
        </Html>
      </group>

      {/* Repair pulse beam — Meta-SRE → target during mitigation */}
      <mesh ref={beam} position={mid} quaternion={quat} visible={false}>
        <cylinderGeometry args={[0.04, 0.04, Math.max(len, 0.01), 6]} />
        <meshBasicMaterial
          color={BIO}
          transparent
          opacity={0.75}
          depthWrite={false}
        />
      </mesh>
      <mesh position={mid} quaternion={quat}>
        <cylinderGeometry args={[0.11, 0.11, Math.max(len, 0.01), 6]} />
        <meshBasicMaterial
          ref={glowMat}
          color={BIO}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Autonomous repair drones dispatched from predictive-tune at-risk nodes.
 */
export default function RepairSubAgentDispatch({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const { workspaceId } = useWorkspaceScope();
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const qs = new URLSearchParams({
          workspaceId,
          limit: "8",
        });
        const res = await fetch(`/api/spatial/predictive-tune?${qs}`, {
          headers: getClientAuthHeaders(),
          cache: "no-store",
        });
        const json = (await res.json()) as TuneResponse;
        if (!res.ok || !json.tune || cancelled) return;

        const now = performance.now();
        const next: ActiveMission[] = [];
        for (const target of json.tune.targets) {
          if (target.riskPct < 35) continue;
          const id = `${target.nodeId}:${Math.floor(Date.now() / 45_000)}`;
          if (seenRef.current.has(id)) continue;
          seenRef.current.add(id);
          // keep set bounded
          if (seenRef.current.size > 40) {
            seenRef.current = new Set([...seenRef.current].slice(-20));
          }
          next.push({
            id,
            target,
            born: now,
            duration: target.etaMs + 2200,
            phase: "transit",
          });
          playSpatialCue("navigate");
          emitSwarmLaser({
            fromCluster: "meta_sre",
            toCluster:
              target.nodeId.includes("sentry")
                ? "sentry"
                : target.nodeId.includes("sandbox")
                  ? "sandbox"
                  : "meta_sre",
            label: `repair → ${target.label}`,
            durationMs: 1600,
          });
        }
        if (next.length) {
          setMissions((prev) => [...prev, ...next].slice(-6));
        }
      } catch {
        /* soft-fail */
      }
    };

    void poll();
    const id = window.setInterval(poll, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, workspaceId]);

  useFrame(() => {
    const now = performance.now();
    if (missions.some((m) => now - m.born > m.duration + 400)) {
      setMissions((prev) =>
        prev.filter((m) => now - m.born <= m.duration + 400)
      );
    }
  });

  if (!enabled || missions.length === 0) return null;

  return (
    <group>
      {missions.map((m) => (
        <RepairDrone key={m.id} mission={m} />
      ))}
    </group>
  );
}
