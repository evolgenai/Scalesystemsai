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

const BIO_GREEN = "#00ffaa";
const EMERALD = "#10b981";
const GUNMETAL = "#1a1f2a";
const CHARCOAL = "#0a0e12";

/** Adjacent to BioluminescentNeuralPod alien artifact at [-16, 2.4, 10]. */
export const VEHICLE_SPAWN: [number, number, number] = [-13.5, 0, 11.5];

export const MOUNT_RADIUS = 3.4;
export const DRIVE_SPEED_MULT = 2;

const TRAIL_COUNT = 48;

export type AutomobileUnitProps = {
  locked: boolean;
  avatarPosRef: MutableRefObject<THREE.Vector3>;
  /** Shared mount flag — mutated in useFrame / key handlers, no React state. */
  mountedRef: MutableRefObject<boolean>;
  /** Live planar speed (u/s) for HUD — written every frame, read by DOM HUD. */
  speedRef: MutableRefObject<number>;
  /** Camera distance boost target while driving (written for RobotAvatar). */
  camBoostRef: MutableRefObject<number>;
  /** Chromatic aberration intensity 0–1 while driving. */
  blurIntensityRef: MutableRefObject<number>;
  /** One-shot snap target consumed by RobotAvatar on mount. */
  mountSnapRef: MutableRefObject<THREE.Vector3 | null>;
  onMountChange?: (mounted: boolean) => void;
  onProximityChange?: (near: boolean) => void;
};

function VehicleMesh({
  bodyRef,
}: {
  bodyRef: MutableRefObject<Group | null>;
}) {
  const glow = useRef<THREE.Mesh>(null);
  const stripe = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.55 + Math.sin(t * 3.2) * 0.25;
    }
    if (stripe.current) {
      const mat = stripe.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.7 + Math.sin(t * 5.5) * 0.35;
    }
  });

  return (
    <group ref={bodyRef}>
      {/* Chassis */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[2.35, 0.38, 4.4]} />
        <meshStandardMaterial
          color={GUNMETAL}
          metalness={0.96}
          roughness={0.14}
          envMapIntensity={1.4}
        />
      </mesh>
      {/* Cabin canopy */}
      <mesh position={[0, 0.92, -0.15]} castShadow>
        <boxGeometry args={[1.85, 0.55, 2.2]} />
        <meshPhysicalMaterial
          color="#064e3b"
          metalness={0.35}
          roughness={0.08}
          transmission={0.35}
          thickness={0.4}
          transparent
          opacity={0.78}
          emissive="#022c22"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Nose cone */}
      <mesh position={[0, 0.48, 2.05]} castShadow rotation={[0.15, 0, 0]}>
        <boxGeometry args={[2.1, 0.28, 0.7]} />
        <meshStandardMaterial
          color={CHARCOAL}
          metalness={0.94}
          roughness={0.16}
        />
      </mesh>
      {/* Bioluminescent underglow */}
      <mesh ref={glow} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.1, 4.0]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={BIO_GREEN}
          emissiveIntensity={0.6}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      {/* Side stripe */}
      <mesh ref={stripe} position={[1.2, 0.5, 0]}>
        <boxGeometry args={[0.06, 0.12, 3.6]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={EMERALD}
          emissiveIntensity={0.8}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[-1.2, 0.5, 0]}>
        <boxGeometry args={[0.06, 0.12, 3.6]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={EMERALD}
          emissiveIntensity={0.8}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>
      {/* Wheels */}
      {(
        [
          [-1.05, 0.28, 1.35],
          [1.05, 0.28, 1.35],
          [-1.05, 0.28, -1.45],
          [1.05, 0.28, -1.45],
        ] as const
      ).map((p, i) => (
        <mesh key={i} position={[...p]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.28, 16]} />
          <meshStandardMaterial
            color="#05070a"
            metalness={0.85}
            roughness={0.35}
          />
        </mesh>
      ))}
      {/* Headlamps */}
      <mesh position={[-0.7, 0.55, 2.25]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={BIO_GREEN}
          emissiveIntensity={1.4}
        />
      </mesh>
      <mesh position={[0.7, 0.55, 2.25]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={BIO_GREEN}
          emissiveIntensity={1.4}
        />
      </mesh>
      {/* Antenna */}
      <mesh position={[0.55, 1.35, -0.8]}>
        <cylinderGeometry args={[0.02, 0.02, 0.55, 6]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.55, 1.65, -0.8]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color={BIO_GREEN}
          emissive={BIO_GREEN}
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
}

function ExhaustTrail({
  activeRef,
  originRef,
}: {
  activeRef: MutableRefObject<boolean>;
  originRef: MutableRefObject<Group | null>;
}) {
  const points = useRef<Points>(null);
  const cursor = useRef(0);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL_COUNT * 3);
    const ages = new Float32Array(TRAIL_COUNT);
    ages.fill(1);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aAge", new THREE.BufferAttribute(ages, 1));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: BIO_GREEN,
        size: 0.18,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    []
  );

  useFrame((_, dt) => {
    const pts = points.current;
    const car = originRef.current;
    if (!pts || !car) return;
    const attr = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ages = pts.geometry.getAttribute("aAge") as THREE.BufferAttribute;

    for (let i = 0; i < TRAIL_COUNT; i++) {
      ages.array[i] = Math.min(1, (ages.array[i] as number) + dt * 1.8);
    }

    if (activeRef.current) {
      const i = cursor.current % TRAIL_COUNT;
      const back = new THREE.Vector3(0, 0.25, -2.3);
      back.applyQuaternion(car.quaternion);
      back.add(car.position);
      attr.setXYZ(
        i,
        back.x + (Math.random() - 0.5) * 0.15,
        back.y + Math.random() * 0.1,
        back.z + (Math.random() - 0.5) * 0.15
      );
      ages.array[i] = 0;
      cursor.current++;
    }

    let visible = 0;
    let sumAge = 0;
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const a = ages.array[i] as number;
      sumAge += a;
      if (a < 0.95) visible++;
    }
    mat.opacity = activeRef.current
      ? 0.55 + (1 - sumAge / TRAIL_COUNT) * 0.4
      : Math.max(0, mat.opacity - dt * 2);
    mat.size = 0.12 + (visible / TRAIL_COUNT) * 0.14;
    attr.needsUpdate = true;
    ages.needsUpdate = true;
  });

  return <points ref={points} geometry={geo} material={mat} />;
}

/**
 * CyberRover — bio-cybernetic automobile near alien spawn.
 * [F] mount/dismount, 2× drive speed via RobotAvatar speedMultRef,
 * camera zoom + trail FX while driving.
 */
export default function AutomobileUnit({
  locked,
  avatarPosRef,
  mountedRef,
  speedRef,
  camBoostRef,
  blurIntensityRef,
  mountSnapRef,
  onMountChange,
  onProximityChange,
}: AutomobileUnitProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const nearRef = useRef(false);
  const [near, setNear] = useState(false);
  const [mountedUi, setMountedUi] = useState(false);
  const trailActive = useRef(false);
  const lastPos = useRef(new THREE.Vector3(...VEHICLE_SPAWN));
  const parkPos = useRef(new THREE.Vector3(...VEHICLE_SPAWN));
  const parkYaw = useRef(Math.PI * 0.35);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!locked || e.code !== "KeyF") return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (mountedRef.current) {
        mountedRef.current = false;
        parkPos.current.copy(avatarPosRef.current);
        parkPos.current.y = 0;
        if (root.current) parkYaw.current = root.current.rotation.y;
        camBoostRef.current = 0;
        blurIntensityRef.current = 0;
        trailActive.current = false;
        setMountedUi(false);
        onMountChange?.(false);
        return;
      }
      if (!nearRef.current) return;
      mountedRef.current = true;
      mountSnapRef.current = parkPos.current.clone();
      avatarPosRef.current.copy(parkPos.current);
      lastPos.current.copy(parkPos.current);
      setMountedUi(true);
      onMountChange?.(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    locked,
    mountedRef,
    avatarPosRef,
    camBoostRef,
    blurIntensityRef,
    mountSnapRef,
    onMountChange,
  ]);

  useFrame((_, dt) => {
    const car = root.current;
    if (!car) return;

    if (mountedRef.current) {
      const p = avatarPosRef.current;
      car.position.set(p.x, 0, p.z);
      // Face velocity / movement from avatar facing
      const dx = p.x - lastPos.current.x;
      const dz = p.z - lastPos.current.z;
      const spd = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      speedRef.current = spd;
      if (spd > 0.8) {
        const yaw = Math.atan2(dx, dz);
        let diff = yaw - car.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.rotation.y += diff * (1 - Math.exp(-8 * dt));
      }
      lastPos.current.copy(p);
      camBoostRef.current = 4.5;
      const driveBlur = THREE.MathUtils.clamp((spd - 4) / 18, 0, 1);
      blurIntensityRef.current = driveBlur;
      trailActive.current = spd > 2.5;
      parkPos.current.set(p.x, 0, p.z);
      parkYaw.current = car.rotation.y;
    } else {
      car.position.copy(parkPos.current);
      car.rotation.y = parkYaw.current;
      speedRef.current = 0;
      camBoostRef.current = 0;
      blurIntensityRef.current *= Math.max(0, 1 - dt * 4);
      trailActive.current = false;

      const d = Math.hypot(
        avatarPosRef.current.x - car.position.x,
        avatarPosRef.current.z - car.position.z
      );
      const isNear = d < MOUNT_RADIUS;
      if (isNear !== nearRef.current) {
        nearRef.current = isNear;
        setNear(isNear);
        onProximityChange?.(isNear);
      }
    }
  });

  return (
    <group ref={root} position={VEHICLE_SPAWN} rotation={[0, parkYaw.current, 0]}>
      <VehicleMesh bodyRef={body} />
      <ExhaustTrail activeRef={trailActive} originRef={root} />
      <pointLight
        position={[0, 0.6, 0]}
        intensity={mountedUi ? 1.2 : 0.55}
        distance={7}
        color={BIO_GREEN}
      />
      {near && locked && !mountedUi ? (
        <Html position={[0, 2.1, 0]} center distanceFactor={10} zIndexRange={[55, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-[#00ffaa]/40 bg-[#0a0e12]/92 px-3 py-1.5 font-mono text-[11px] font-semibold text-[#00ffaa] shadow-[0_0_28px_rgba(0,255,170,0.3)] backdrop-blur-md">
            [F] Enter CyberRover
          </div>
        </Html>
      ) : null}
      {mountedUi && locked ? (
        <Html position={[0, 2.35, 0]} center distanceFactor={11} zIndexRange={[55, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-emerald-400/35 bg-[#0a0e12]/9 px-3 py-1 font-mono text-[10px] text-emerald-300/90 backdrop-blur-md">
            [F] Exit · 2× drive
          </div>
        </Html>
      ) : null}
    </group>
  );
}
