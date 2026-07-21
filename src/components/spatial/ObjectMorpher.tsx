"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Group } from "three";

export const EMERALD = "#10B981";
export const EMERALD_DEEP = "#059669";
export const CYAN = "#34d399";
export const AMBER = "#f59e0b";

export type MorphNode = {
  id: string;
  name: string;
  position: [number, number, number];
  height: number;
  category: "software" | "hardware" | "composite";
};

export type CompositeSuite = {
  id: string;
  name: string;
  fromIds: string[];
  position: [number, number, number];
  height: number;
  status: string;
};

const COMPOSITE_RECIPES: {
  keys: string[];
  id: string;
  name: string;
  status: string;
}[] = [
  {
    keys: ["web-scraper", "llm-router"],
    id: "suite-intel-mesh",
    name: "Intel Harvest Suite",
    status: "Scrape → route → synthesize",
  },
  {
    keys: ["blackeye", "recon-agent"],
    id: "suite-ops-terminal",
    name: "Ops Recon Terminal",
    status: "blackeye × recon bonded",
  },
  {
    keys: ["slack-bot", "llm-router"],
    id: "suite-comms-brain",
    name: "Comms Brain Suite",
    status: "Slack ↔ LLM bridge live",
  },
  {
    keys: ["quantum-tpu", "vault-core"],
    id: "suite-secure-compute",
    name: "Secure Compute Cluster",
    status: "TPU + vault sealed",
  },
  {
    keys: ["edge-router", "vault-core"],
    id: "suite-edge-vault",
    name: "Edge Vault Gateway",
    status: "Encrypted edge path",
  },
  {
    keys: ["github-terminal", "recon-agent"],
    id: "suite-devsec",
    name: "DevSec Script Forge",
    status: "GitHub × recon fused",
  },
];

function findRecipe(nearbyIds: string[]) {
  const set = new Set(nearbyIds);
  for (const r of COMPOSITE_RECIPES) {
    if (r.keys.every((k) => set.has(k))) return r;
  }
  // Fallback: any two+ nearby → generic synthesis
  if (nearbyIds.length >= 2) {
    const sorted = [...nearbyIds].sort();
    return {
      keys: sorted.slice(0, 2),
      id: `suite-${sorted.slice(0, 2).join("-")}`,
      name: "Composite Tool Suite",
      status: `${sorted.length} nodes synthesized`,
    };
  }
  return null;
}

function MorphBurst({
  origin,
  active,
  color = EMERALD,
}: {
  origin: [number, number, number];
  active: boolean;
  color?: string;
}) {
  const pts = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 72;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r = 0.15 + Math.random() * 0.2;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      vel[i * 3] = pos[i * 3]! * 4;
      vel[i * 3 + 1] = pos[i * 3 + 1]! * 4 + 1.2;
      vel[i * 3 + 2] = pos[i * 3 + 2]! * 4;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    (g as THREE.BufferGeometry & { userData: { vel: Float32Array } }).userData =
      { vel };
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color,
        size: 0.08,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color]
  );

  const age = useRef(0);

  useFrame((_, dt) => {
    if (!active || !pts.current) return;
    age.current += dt;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const vel = (geo as THREE.BufferGeometry & { userData: { vel: Float32Array } })
      .userData.vel;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i]! += vel[i]! * dt;
      arr[i + 1]! += vel[i + 1]! * dt;
      arr[i + 2]! += vel[i + 2]! * dt;
      vel[i + 1]! -= 2.5 * dt;
    }
    posAttr.needsUpdate = true;
    mat.opacity = Math.max(0, 0.95 - age.current * 0.55);
  });

  if (!active) return null;
  return (
    <points
      ref={pts}
      position={origin}
      geometry={geo}
      material={mat}
    />
  );
}

function CompositeMesh({
  suite,
  pulsing,
}: {
  suite: CompositeSuite;
  pulsing: boolean;
}) {
  const core = useRef<Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.55;
      core.current.position.y =
        suite.height * 0.45 + Math.sin(t * 2.2) * 0.12;
    }
    if (ring.current) {
      ring.current.rotation.z = t * 1.2;
      ring.current.rotation.x = Math.PI / 2;
    }
  });

  return (
    <group position={suite.position}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.55, 0.75, 0.5, 8]} />
        <meshStandardMaterial
          color="#040907"
          metalness={0.9}
          roughness={0.2}
          emissive={EMERALD_DEEP}
          emissiveIntensity={0.25}
        />
      </mesh>
      <group ref={core}>
        <mesh castShadow>
          <octahedronGeometry args={[0.85, 0]} />
          <meshStandardMaterial
            color={EMERALD}
            emissive={EMERALD}
            emissiveIntensity={pulsing ? 1.4 : 0.85}
            metalness={0.55}
            roughness={0.18}
            transparent
            opacity={0.92}
          />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[1.15, 0]} />
          <meshStandardMaterial
            color="#6EE7B7"
            emissive={CYAN}
            emissiveIntensity={0.35}
            wireframe
            transparent
            opacity={0.45}
          />
        </mesh>
      </group>
      <mesh ref={ring} position={[0, suite.height * 0.45, 0]}>
        <torusGeometry args={[1.35, 0.045, 8, 48]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={1}
          transparent
          opacity={0.8}
        />
      </mesh>
      <Html position={[0, suite.height + 0.6, 0]} center distanceFactor={12}>
        <div className="pointer-events-none whitespace-nowrap rounded-lg border border-emerald-500/40 bg-[#040907]/92 px-2.5 py-1.5 shadow-[0_0_24px_rgba(16,185,129,0.35)] backdrop-blur-md">
          <p className="font-mono text-[10px] font-semibold text-emerald-300">
            {suite.name}
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-emerald-400/80">
            {suite.status}
          </p>
        </div>
      </Html>
    </group>
  );
}

export type ObjectMorpherProps = {
  nearbyNodes: MorphNode[];
  robotPosition: [number, number, number] | null;
  locked: boolean;
  consumedIds: Set<string>;
  onMorph: (suite: CompositeSuite, consumed: string[]) => void;
};

/**
 * When the robot is near 2+ nodes, shows [Press M to Combine / Morph Objects]
 * and runs a particle morph into a composite tool suite.
 */
export default function ObjectMorpher({
  nearbyNodes,
  robotPosition,
  locked,
  consumedIds,
  onMorph,
}: ObjectMorpherProps) {
  const eligible = useMemo(
    () => nearbyNodes.filter((n) => !consumedIds.has(n.id)),
    [nearbyNodes, consumedIds]
  );
  const canMorph = eligible.length >= 2 && locked;
  const [burst, setBurst] = useState<{
    origin: [number, number, number];
    key: number;
  } | null>(null);
  const [composites, setComposites] = useState<CompositeSuite[]>([]);

  const mid: [number, number, number] = useMemo(() => {
    if (eligible.length === 0) {
      return robotPosition ?? [0, 1.5, 0];
    }
    const ax =
      eligible.reduce((s, n) => s + n.position[0], 0) / eligible.length;
    const az =
      eligible.reduce((s, n) => s + n.position[2], 0) / eligible.length;
    const ay =
      eligible.reduce((s, n) => s + n.height * 0.5, 0) / eligible.length;
    return [ax, ay, az];
  }, [eligible, robotPosition]);

  const triggerMorph = useCallback(() => {
    if (!canMorph) return;
    const recipe = findRecipe(eligible.map((n) => n.id));
    if (!recipe) return;
    const used = eligible
      .filter((n) => recipe.keys.includes(n.id) || recipe.keys.length > 2)
      .slice(0, Math.max(2, recipe.keys.length));
    const ids = used.map((n) => n.id);
    // Prefer recipe keys if present
    const consume =
      recipe.keys.filter((k) => eligible.some((n) => n.id === k)).length >= 2
        ? recipe.keys.filter((k) => eligible.some((n) => n.id === k))
        : ids.slice(0, 2);

    const nodes = eligible.filter((n) => consume.includes(n.id));
    const cx =
      nodes.reduce((s, n) => s + n.position[0], 0) / Math.max(nodes.length, 1);
    const cz =
      nodes.reduce((s, n) => s + n.position[2], 0) / Math.max(nodes.length, 1);

    const suite: CompositeSuite = {
      id: `${recipe.id}-${[...consume].sort().join("|")}`,
      name: recipe.name,
      fromIds: consume,
      position: [cx, 0, cz],
      height: 3.6,
      status: recipe.status,
    };

    setBurst({ origin: [cx, 2.2, cz], key: Date.now() });
    setComposites((prev) => {
      if (prev.some((c) => c.id === suite.id)) return prev;
      return [...prev, suite];
    });
    onMorph(suite, consume);
    window.setTimeout(() => setBurst(null), 1800);
  }, [canMorph, eligible, onMorph]);

  useEffect(() => {
    if (!locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM") return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      triggerMorph();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, triggerMorph]);

  return (
    <>
      {canMorph ? (
        <group position={mid}>
          <Html center distanceFactor={10} zIndexRange={[50, 0]}>
            <div className="pointer-events-none animate-pulse whitespace-nowrap rounded-md border border-emerald-400/55 bg-[#040907]/95 px-3 py-1.5 font-mono text-[11px] font-semibold text-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.5)] backdrop-blur-md">
              [Press M to Combine / Morph Objects]
            </div>
          </Html>
          <mesh position={[0, -0.4, 0]}>
            <ringGeometry args={[1.1, 1.25, 48]} />
            <meshBasicMaterial
              color={EMERALD}
              transparent
              opacity={0.55}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ) : null}

      {burst ? (
        <MorphBurst
          key={burst.key}
          origin={burst.origin}
          active
          color={EMERALD}
        />
      ) : null}

      {composites.map((s) => (
        <CompositeMesh key={s.id} suite={s} pulsing />
      ))}
    </>
  );
}
