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
import type { Group, Points } from "three";

const BIO = "#00ffaa";
const TOR_SPAWN: [number, number, number] = [6.5, 0, 10.5];
const PROX = 3.4;
const MATRIX_COUNT = 96;

export type TorNodeProps = {
  locked: boolean;
  avatarPosRef: MutableRefObject<THREE.Vector3>;
  /** When true, matrix particles orbit the avatar. */
  activeRef: MutableRefObject<boolean>;
  onActivate?: (maskedIp: string) => void;
  onProximityChange?: (near: boolean) => void;
};

function OnionMesh() {
  const core = useRef<THREE.Mesh>(null);
  const layers = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.9 + Math.sin(t * 3.2) * 0.4;
      core.current.scale.setScalar(1 + Math.sin(t * 2.4) * 0.05);
    }
    if (layers.current) {
      layers.current.rotation.y = t * 0.35;
      layers.current.rotation.x = Math.sin(t * 0.4) * 0.12;
    }
  });

  return (
    <group>
      <group ref={layers}>
        {[1.15, 0.9, 0.65].map((r, i) => (
          <mesh key={i} scale={[1, 0.72 + i * 0.04, 1]}>
            <sphereGeometry args={[r, 28, 20]} />
            <meshStandardMaterial
              color={i === 0 ? "#152e24" : i === 1 ? "#0a1f18" : "#13191c"}
              metalness={0.55}
              roughness={0.35}
              emissive={BIO}
              emissiveIntensity={0.15 + i * 0.08}
              wireframe={i === 0}
              transparent
              opacity={i === 0 ? 0.55 : 0.85}
            />
          </mesh>
        ))}
      </group>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.38, 1]} />
        <meshStandardMaterial
          color={BIO}
          emissive={BIO}
          emissiveIntensity={1}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>
      {/* Stem / leaf accent */}
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.35, 8]} />
        <meshStandardMaterial color="#064e3b" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0.12, 1.22, 0]} rotation={[0, 0, -0.6]}>
        <boxGeometry args={[0.28, 0.06, 0.14]} />
        <meshStandardMaterial
          color={BIO}
          emissive={BIO}
          emissiveIntensity={0.5}
          metalness={0.5}
          roughness={0.25}
        />
      </mesh>
    </group>
  );
}

function MatrixAura({
  activeRef,
  avatarPosRef,
}: {
  activeRef: MutableRefObject<boolean>;
  avatarPosRef: MutableRefObject<THREE.Vector3>;
}) {
  const pts = useRef<Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MATRIX_COUNT * 3);
    const seed = new Float32Array(MATRIX_COUNT);
    for (let i = 0; i < MATRIX_COUNT; i++) {
      seed[i] = Math.random() * Math.PI * 2;
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: BIO,
        size: 0.09,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    []
  );

  useFrame(({ clock }) => {
    const p = pts.current;
    if (!p) return;
    const attr = p.geometry.getAttribute("position") as THREE.BufferAttribute;
    const seeds = p.geometry.getAttribute("aSeed") as THREE.BufferAttribute;
    const on = activeRef.current;
    mat.opacity += ((on ? 0.85 : 0) - mat.opacity) * 0.08;
    if (mat.opacity < 0.02 && !on) return;

    const origin = avatarPosRef.current;
    const t = clock.elapsedTime;
    for (let i = 0; i < MATRIX_COUNT; i++) {
      const s = seeds.array[i] as number;
      const r = 0.6 + (i % 7) * 0.18;
      const y = ((t * 1.8 + s * 3) % 3.2) - 0.4;
      const ang = s + t * (1.2 + (i % 5) * 0.15);
      attr.setXYZ(
        i,
        origin.x + Math.cos(ang) * r,
        origin.y + y,
        origin.z + Math.sin(ang) * r
      );
    }
    attr.needsUpdate = true;
  });

  return <points ref={pts} geometry={geo} material={mat} />;
}

function maskOnionIp(seed: number): string {
  const a = 10 + (seed % 40);
  const b = (seed * 7) % 256;
  return `${a}.${b}.xxx.xxx`;
}

/**
 * Tor Onion Router — glowing bio-green onion. [E] activates encrypted
 * matrix particles around the alien and exposes a masked proxy IP on HUD.
 */
export default function TorNode({
  locked,
  avatarPosRef,
  activeRef,
  onActivate,
  onProximityChange,
}: TorNodeProps) {
  const nearRef = useRef(false);
  const [near, setNear] = useState(false);
  const masked = useMemo(() => maskOnionIp(48_077), []);

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
      if (!nearRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      activeRef.current = true;
      onActivate?.(masked);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [locked, activeRef, masked, onActivate]);

  const follow = useRef<Group>(null);

  useFrame(() => {
    const d = Math.hypot(
      avatarPosRef.current.x - TOR_SPAWN[0],
      avatarPosRef.current.z - TOR_SPAWN[2]
    );
    const isNear = d < PROX;
    if (isNear !== nearRef.current) {
      nearRef.current = isNear;
      setNear(isNear);
      onProximityChange?.(isNear);
    }
    if (follow.current && activeRef.current) {
      follow.current.position.set(
        avatarPosRef.current.x,
        2.35,
        avatarPosRef.current.z
      );
      follow.current.visible = true;
    } else if (follow.current) {
      follow.current.visible = false;
    }
  });

  return (
    <>
      <group position={TOR_SPAWN}>
        <OnionMesh />
        <pointLight intensity={1.1} distance={8} color={BIO} />
        <Html position={[0, 2.05, 0]} center distanceFactor={10} zIndexRange={[52, 0]}>
          <div className="pointer-events-none rounded-md border border-[#00ffaa]/40 bg-[#080b0c]/92 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#00ffaa] shadow-[0_0_20px_rgba(0,255,170,0.3)] backdrop-blur-md">
            Tor Node
            {near && locked ? (
              <span className="ml-2 opacity-90">· [E] Connect</span>
            ) : null}
          </div>
        </Html>
      </group>
      <MatrixAura activeRef={activeRef} avatarPosRef={avatarPosRef} />
      <group ref={follow} visible={false}>
        <Html center distanceFactor={11}>
          <div className="pointer-events-none whitespace-nowrap rounded border border-[#00ffaa]/30 bg-black/70 px-2 py-0.5 font-mono text-[9px] text-[#00ffaa]/90">
            tor · {masked}
          </div>
        </Html>
      </group>
    </>
  );
}

export { TOR_SPAWN };
