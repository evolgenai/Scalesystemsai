"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { InstancedMesh } from "three";

const BIO_GREEN = "#00ffaa";
const EMERALD = "#10b981";
const GUNMETAL = "#13191c";
const MOSS = "#152e24";

const INTERACT_RADIUS = 3.2;
/** Scatter across a 500×500 logical grid (world units ±250). */
const WORLD_EXTENT = 250;
const TOTAL_INSTANCES = 160;

export type HardwareKind =
  | "server_rack"
  | "cyber_console"
  | "diagnostic_router"
  | "terminal";

export type HardwareAccess = "public" | "admin" | "superadmin";

export type HardwareInteractable = {
  id: string;
  kind: HardwareKind;
  label: string;
  position: [number, number, number];
  height: number;
  access: HardwareAccess;
  requiresPin: boolean;
  interactive: boolean;
};

export type InstancedHardwareGridProps = {
  avatarPosRef: MutableRefObject<THREE.Vector3>;
  onNearestInteractable?: (node: HardwareInteractable | null) => void;
  onInteract?: (node: HardwareInteractable) => void;
  locked?: boolean;
  highlightId?: string | null;
};

type ScatterSlot = {
  kind: HardwareKind;
  position: [number, number, number];
  yaw: number;
  scale: [number, number, number];
  interactive: boolean;
  id: string;
  label: string;
  access: HardwareAccess;
  requiresPin: boolean;
  height: number;
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const KIND_BUCKETS: HardwareKind[] = [
  "server_rack",
  "cyber_console",
  "diagnostic_router",
  "terminal",
];

function kindScale(kind: HardwareKind, rand: () => number): [number, number, number] {
  switch (kind) {
    case "server_rack":
      return [0.95 + rand() * 0.25, 2.4 + rand() * 1.6, 0.75 + rand() * 0.2];
    case "cyber_console":
      return [1.4 + rand() * 0.4, 1.0 + rand() * 0.45, 0.8 + rand() * 0.2];
    case "diagnostic_router":
      return [0.7 + rand() * 0.25, 1.5 + rand() * 0.7, 0.7 + rand() * 0.25];
    default:
      return [1.0 + rand() * 0.3, 1.6 + rand() * 0.6, 0.65 + rand() * 0.2];
  }
}

/** Deterministic scatter of 100+ IT hardware props + special interactables. */
export function generateHardwareScatter(seed = 48_001): ScatterSlot[] {
  const rand = mulberry32(seed);
  const slots: ScatterSlot[] = [];

  slots.push({
    id: "sentry-log-ws",
    kind: "terminal",
    label: "Sentry Log Workstation",
    position: [18.5, 0, -4.2],
    yaw: -0.6,
    scale: [1.15, 2.35, 0.75],
    interactive: true,
    access: "superadmin",
    requiresPin: true,
    height: 2.4,
  });
  slots.push({
    id: "ip-network-diag",
    kind: "diagnostic_router",
    label: "IP Network Diagnostic Node",
    position: [-19.2, 0, 5.4],
    yaw: 1.1,
    scale: [0.85, 2.0, 0.85],
    interactive: true,
    access: "admin",
    requiresPin: false,
    height: 2.1,
  });

  const avoid = [
    [0, 8],
    [-13.5, 11.5],
    [18.5, -4.2],
    [-19.2, 5.4],
    [-8, -6],
    [7, -5],
    [-5, 5],
    [6, 4],
    [-16, 10],
  ] as const;

  let i = 0;
  while (slots.length < TOTAL_INSTANCES && i < 8000) {
    i++;
    const x = (rand() - 0.5) * WORLD_EXTENT * 0.72;
    const z = (rand() - 0.5) * WORLD_EXTENT * 0.72;
    if (Math.hypot(x, z) < 8) continue;
    let blocked = false;
    for (const [ax, az] of avoid) {
      if (Math.hypot(x - ax, z - az) < 5) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    for (const s of slots) {
      if (Math.hypot(x - s.position[0], z - s.position[2]) < 3.2) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const kind = KIND_BUCKETS[Math.floor(rand() * KIND_BUCKETS.length)]!;
    const scale = kindScale(kind, rand);

    slots.push({
      id: `hw-${kind}-${slots.length}`,
      kind,
      label: kind.replace(/_/g, " "),
      position: [x, 0, z],
      yaw: rand() * Math.PI * 2,
      scale,
      interactive: false,
      access: "public",
      requiresPin: false,
      height: scale[1],
    });
  }

  return slots;
}

function InteractHighlight({
  node,
  active,
}: {
  node: HardwareInteractable;
  active: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = clock.elapsedTime;
    ring.current.rotation.z = t * 1.2;
    const mat = ring.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = active ? 0.9 + Math.sin(t * 5) * 0.45 : 0.25;
    const s = active ? 1.05 + Math.sin(t * 4) * 0.06 : 0.85;
    ring.current.scale.setScalar(s);
  });

  return (
    <group position={[node.position[0], node.height * 0.55, node.position[2]]}>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.15, 0.04, 8, 40]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={BIO_GREEN}
          emissiveIntensity={0.6}
          metalness={0.7}
          roughness={0.2}
          transparent
          opacity={active ? 0.95 : 0.45}
        />
      </mesh>
      {active ? (
        <Html center distanceFactor={9} zIndexRange={[50, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-[#00ffaa]/45 bg-[#0a0e12]/92 px-3 py-1.5 font-mono text-[11px] font-semibold text-[#00ffaa] shadow-[0_0_28px_rgba(0,255,170,0.35)] backdrop-blur-md">
            [E] Interact · {node.label}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/**
 * GPU-instanced IT hardware scatter — single `<instancedMesh>` draw call.
 * Scale/color encode rack vs console vs router variety without extra batches.
 */
export default function InstancedHardwareGrid({
  avatarPosRef,
  onNearestInteractable,
  onInteract,
  locked = false,
  highlightId = null,
}: InstancedHardwareGridProps) {
  const slots = useMemo(() => generateHardwareScatter(), []);
  const interactables = useMemo(
    () =>
      slots
        .filter((s) => s.interactive)
        .map(
          (s): HardwareInteractable => ({
            id: s.id,
            kind: s.kind,
            label: s.label,
            position: s.position,
            height: s.height,
            access: s.access,
            requiresPin: s.requiresPin,
            interactive: true,
          })
        ),
    [slots]
  );

  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mesh = useRef<InstancedMesh>(null);
  const nearestRef = useRef<HardwareInteractable | null>(null);
  const [nearId, setNearId] = useState<string | null>(null);
  const probe = useRef(new THREE.Vector3());

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      dummy.position.set(s.position[0], s.scale[1] * 0.5, s.position[2]);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.scale[0], s.scale[1], s.scale[2]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (s.interactive) c.set(BIO_GREEN);
      else if (s.kind === "server_rack") c.set(GUNMETAL);
      else if (s.kind === "diagnostic_router") c.set(MOSS);
      else c.set("#1a2428");
      m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [slots]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!locked || e.code !== "KeyE") return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      const n = nearestRef.current;
      if (n && onInteract) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onInteract(n);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [locked, onInteract]);

  useFrame(() => {
    const pos = avatarPosRef.current;
    let best: HardwareInteractable | null = null;
    let bestD = INTERACT_RADIUS;
    for (const n of interactables) {
      probe.current.set(n.position[0], 0, n.position[2]);
      const d = Math.hypot(pos.x - probe.current.x, pos.z - probe.current.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    const nextId = best?.id ?? null;
    if ((nearestRef.current?.id ?? null) !== nextId) {
      nearestRef.current = best;
      setNearId(nextId);
      onNearestInteractable?.(best);
    }
  });

  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[geo, undefined, slots.length]}
        castShadow
        receiveShadow
        frustumCulled
      >
        <meshStandardMaterial
          color="#1a2428"
          metalness={0.94}
          roughness={0.2}
          emissive={EMERALD}
          emissiveIntensity={0.06}
          envMapIntensity={1.15}
        />
      </instancedMesh>

      {interactables.map((n) => (
        <InteractHighlight
          key={n.id}
          node={n}
          active={(nearId === n.id && locked) || highlightId === n.id}
        />
      ))}
    </group>
  );
}

/** Stable interactable list for HUD / PIN overlays outside the canvas. */
export function getSpecialInteractables(): HardwareInteractable[] {
  return generateHardwareScatter()
    .filter((s) => s.interactive)
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      position: s.position,
      height: s.height,
      access: s.access,
      requiresPin: s.requiresPin,
      interactive: true,
    }));
}
