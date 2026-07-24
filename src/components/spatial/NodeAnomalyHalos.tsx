"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Mesh } from "three";
import type { NodeHealthReport } from "@/lib/spatial/nodeHealth";
import { useWorkspaceScope } from "@/components/navigation/WorkspaceScopeContext";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

const CRITICAL = "#ef4444";
const WARNING = "#f59e0b";

type HealthResponse = {
  success?: boolean;
  nodes?: NodeHealthReport[];
  health?: { nodes: NodeHealthReport[] };
};

function AnomalyHalo({ node }: { node: NodeHealthReport }) {
  const ring = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const color = node.state === "critical" ? CRITICAL : WARNING;
  const severity = (100 - node.score) / 100;
  const base = 1.1 + severity * 0.55;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse =
      node.state === "critical"
        ? 0.75 + Math.sin(t * 7.5) * 0.45
        : 0.55 + Math.sin(t * 4.2) * 0.35;
    if (ring.current) {
      ring.current.rotation.z = t * (node.state === "critical" ? 1.8 : 1.1);
      const mat = ring.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = pulse;
      const s = base * (1 + Math.sin(t * 5) * 0.06);
      ring.current.scale.set(s, s, s);
    }
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + pulse * 0.14;
      const s = base * 1.65 * (1 + Math.sin(t * 3.5) * 0.08);
      glow.current.scale.setScalar(s);
    }
  });

  const [x, , z] = node.coordinates;
  const y = 1.35;

  return (
    <group position={[x, y, z]}>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.055, 8, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.9}
          metalness={0.35}
          roughness={0.25}
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[1.05, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
      <Html
        position={[0, 1.15, 0]}
        center
        distanceFactor={12}
        style={{ pointerEvents: "none" }}
        zIndexRange={[45, 0]}
      >
        <div
          className="whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider backdrop-blur-md"
          style={{
            color,
            borderColor: `${color}66`,
            background: "rgba(5,8,7,0.85)",
            boxShadow: `0 0 18px ${color}44`,
          }}
        >
          {node.state} · score {node.score}
        </div>
      </Html>
    </group>
  );
}

/**
 * Pulsating red/amber halos for critical/warning spatial nodes.
 */
export default function NodeAnomalyHalos({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const { workspaceId } = useWorkspaceScope();
  const [nodes, setNodes] = useState<NodeHealthReport[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const qs = new URLSearchParams({ workspaceId, limit: "40" });
        const res = await fetch(`/api/spatial/node-health?${qs}`, {
          headers: getClientAuthHeaders(),
          cache: "no-store",
        });
        const json = (await res.json()) as HealthResponse;
        if (!res.ok || cancelled) return;
        const list = json.nodes ?? json.health?.nodes ?? [];
        setNodes(list);
      } catch {
        /* soft-fail */
      }
    };
    void load();
    const id = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, workspaceId]);

  const anomalous = useMemo(
    () =>
      nodes.filter((n) => n.state === "critical" || n.state === "warning"),
    [nodes]
  );

  if (!enabled || anomalous.length === 0) return null;

  return (
    <group>
      {anomalous.map((n) => (
        <AnomalyHalo key={n.nodeId} node={n} />
      ))}
    </group>
  );
}
