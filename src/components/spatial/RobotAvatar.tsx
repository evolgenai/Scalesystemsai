"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh } from "three";

const SAPPHIRE = "#3B82F6";
const ROBOT_HEIGHT = 1.15;
const GROUND_Y = 0;
const PROXIMITY_DEFAULT = 3;

const MIN_POLAR = Math.PI / 6;
const MAX_POLAR = Math.PI / 2 + 0.28;
const CAM_DIST_MIN = 3.2;
const CAM_DIST_MAX = 11;
const CAM_DIST_DEFAULT = 5.5;

const BOUNDS = {
  minX: -38,
  maxX: 38,
  minZ: -38,
  maxZ: 38,
} as const;

export type ProximityTarget = {
  id: string;
  position: [number, number, number];
  height: number;
};

export type RobotAvatarProps = {
  locked: boolean;
  targets?: ProximityTarget[];
  proximity?: number;
  onNearestChange?: (id: string | null) => void;
  onInteract?: (id: string) => void;
  enabled?: boolean;
};

function RobotMesh({
  state,
}: {
  state: MutableRefObject<{ moving: boolean; hovering: boolean }>;
}) {
  const group = useRef<Group>(null);
  const eyeL = useRef<Mesh>(null);
  const eyeR = useRef<Mesh>(null);
  const thrusterL = useRef<Mesh>(null);
  const thrusterR = useRef<Mesh>(null);
  const core = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { moving, hovering } = state.current;
    const bob = hovering ? Math.sin(t * 6.5) * 0.04 : Math.sin(t * 3.2) * 0.012;
    if (group.current) group.current.position.y = bob;

    const eyePulse = 0.85 + Math.sin(t * 5.5) * 0.35;
    for (const eye of [eyeL.current, eyeR.current]) {
      if (!eye) continue;
      const mat = eye.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = eyePulse;
    }

    const thrust = hovering || moving ? 1.4 + Math.sin(t * 18) * 0.55 : 0.25;
    for (const thr of [thrusterL.current, thrusterR.current]) {
      if (!thr) continue;
      const mat = thr.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = thrust;
      thr.scale.y = hovering || moving ? 1.2 + Math.sin(t * 22) * 0.35 : 0.55;
    }

    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.45 + Math.sin(t * 2.8) * 0.2;
    }
  });

  return (
    <group ref={group}>
      {/* Torso */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[0.55, 0.7, 0.38]} />
        <meshStandardMaterial
          color="#1a1f2a"
          metalness={0.92}
          roughness={0.18}
          envMapIntensity={1.2}
        />
      </mesh>
      {/* Chest plate */}
      <mesh ref={core} position={[0, 0.78, 0.2]} castShadow>
        <boxGeometry args={[0.32, 0.28, 0.06]} />
        <meshStandardMaterial
          color="#0b1220"
          metalness={0.85}
          roughness={0.22}
          emissive={SAPPHIRE}
          emissiveIntensity={0.5}
        />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.36, 0.36]} />
        <meshStandardMaterial
          color="#121820"
          metalness={0.95}
          roughness={0.14}
        />
      </mesh>
      {/* Visor */}
      <mesh position={[0, 1.18, 0.19]}>
        <boxGeometry args={[0.34, 0.14, 0.04]} />
        <meshStandardMaterial
          color="#04120e"
          metalness={0.4}
          roughness={0.08}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Eyes */}
      <mesh ref={eyeL} position={[-0.1, 1.18, 0.22]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial
          color={SAPPHIRE}
          emissive={SAPPHIRE}
          emissiveIntensity={1}
          metalness={0.2}
          roughness={0.15}
        />
      </mesh>
      <mesh ref={eyeR} position={[0.1, 1.18, 0.22]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial
          color={SAPPHIRE}
          emissive={SAPPHIRE}
          emissiveIntensity={1}
          metalness={0.2}
          roughness={0.15}
        />
      </mesh>
      {/* Antenna */}
      <mesh position={[0.12, 1.42, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.22, 6]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0.12, 1.55, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial
          color={SAPPHIRE}
          emissive={SAPPHIRE}
          emissiveIntensity={0.9}
        />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.42, 0.72, 0]} castShadow>
        <boxGeometry args={[0.16, 0.55, 0.16]} />
        <meshStandardMaterial color="#151b24" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.42, 0.72, 0]} castShadow>
        <boxGeometry args={[0.16, 0.55, 0.16]} />
        <meshStandardMaterial color="#151b24" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Legs / thruster mounts */}
      <mesh position={[-0.16, 0.28, 0]} castShadow>
        <boxGeometry args={[0.18, 0.4, 0.2]} />
        <meshStandardMaterial color="#0f141c" metalness={0.88} roughness={0.22} />
      </mesh>
      <mesh position={[0.16, 0.28, 0]} castShadow>
        <boxGeometry args={[0.18, 0.4, 0.2]} />
        <meshStandardMaterial color="#0f141c" metalness={0.88} roughness={0.22} />
      </mesh>
      {/* Hover thrusters */}
      <mesh ref={thrusterL} position={[-0.16, 0.04, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.09, 0.28, 8]} />
        <meshStandardMaterial
          color={SAPPHIRE}
          emissive={SAPPHIRE}
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
          metalness={0.1}
          roughness={0.35}
        />
      </mesh>
      <mesh ref={thrusterR} position={[0.16, 0.04, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.09, 0.28, 8]} />
        <meshStandardMaterial
          color={SAPPHIRE}
          emissive={SAPPHIRE}
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
          metalness={0.1}
          roughness={0.35}
        />
      </mesh>
      {/* Shoulder pads */}
      <mesh position={[-0.38, 0.98, 0]} castShadow>
        <boxGeometry args={[0.22, 0.12, 0.28]} />
        <meshStandardMaterial color="#1e293b" metalness={0.95} roughness={0.16} />
      </mesh>
      <mesh position={[0.38, 0.98, 0]} castShadow>
        <boxGeometry args={[0.22, 0.12, 0.28]} />
        <meshStandardMaterial color="#1e293b" metalness={0.95} roughness={0.16} />
      </mesh>
    </group>
  );
}

/**
 * GTA-style third-person robot avatar: WASD relative to camera yaw,
 * Shift sprint, Space jump/hover, 360° orbit mouse look with damping.
 */
export default function RobotAvatar({
  locked,
  targets = [],
  proximity = PROXIMITY_DEFAULT,
  onNearestChange,
  onInteract,
  enabled = true,
}: RobotAvatarProps) {
  const { camera, gl } = useThree();
  const root = useRef<Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const vel = useRef(new THREE.Vector3());
  const wish = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const camOffset = useRef(new THREE.Vector3());
  const camDesired = useRef(new THREE.Vector3());
  const probe = useRef(new THREE.Vector3());
  const look = useRef({ yaw: 0, pitch: 0.28, dist: CAM_DIST_DEFAULT });
  const lookSmooth = useRef({ yaw: 0, pitch: 0.28, dist: CAM_DIST_DEFAULT });
  const vy = useRef(0);
  const grounded = useRef(true);
  const hovering = useRef(false);
  const moving = useRef(false);
  const nearestId = useRef<string | null>(null);
  const facing = useRef(0);
  const anim = useRef({ moving: false, hovering: false });

  useEffect(() => {
    if (!enabled) return;
    camera.position.set(0, 3.2, CAM_DIST_DEFAULT + 2);
  }, [camera, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (
        (e.code === "Space" || e.code === "KeyE") &&
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space" && locked) e.preventDefault();
      if (e.code === "KeyE" && locked && nearestId.current && onInteract) {
        e.preventDefault();
        onInteract(nearestId.current);
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled, locked, onInteract]);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    const onMove = (e: MouseEvent) => {
      if (!locked) return;
      const sens = 0.0022;
      look.current.yaw -= e.movementX * sens;
      look.current.pitch += e.movementY * sens;
      const minPitch = MIN_POLAR - Math.PI / 2;
      const maxPitch = MAX_POLAR - Math.PI / 2;
      look.current.pitch = THREE.MathUtils.clamp(
        look.current.pitch,
        minPitch,
        maxPitch
      );
    };
    const onWheel = (e: WheelEvent) => {
      if (!locked) return;
      look.current.dist = THREE.MathUtils.clamp(
        look.current.dist + e.deltaY * 0.008,
        CAM_DIST_MIN,
        CAM_DIST_MAX
      );
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl, locked, enabled]);

  useFrame((_, delta) => {
    if (!enabled || !root.current) return;
    const dt = Math.min(delta, 0.033);

    // Orbit damping (OrbitControls-equivalent)
    const damp = 1 - Math.exp(-10 * dt);
    lookSmooth.current.yaw += (look.current.yaw - lookSmooth.current.yaw) * damp;
    lookSmooth.current.pitch +=
      (look.current.pitch - lookSmooth.current.pitch) * damp;
    lookSmooth.current.dist +=
      (look.current.dist - lookSmooth.current.dist) * damp;

    const sprint = keys.current.ShiftLeft || keys.current.ShiftRight;
    const speed = sprint ? 11 : 5.5;

    // Camera-relative planar axes
    forward.current.set(
      -Math.sin(lookSmooth.current.yaw),
      0,
      -Math.cos(lookSmooth.current.yaw)
    );
    right.current.set(
      Math.cos(lookSmooth.current.yaw),
      0,
      -Math.sin(lookSmooth.current.yaw)
    );

    wish.current.set(0, 0, 0);
    if (keys.current.KeyW || keys.current.ArrowUp)
      wish.current.add(forward.current);
    if (keys.current.KeyS || keys.current.ArrowDown)
      wish.current.sub(forward.current);
    if (keys.current.KeyD || keys.current.ArrowRight)
      wish.current.add(right.current);
    if (keys.current.KeyA || keys.current.ArrowLeft)
      wish.current.sub(right.current);

    const hasWish = wish.current.lengthSq() > 1e-6;
    if (hasWish) wish.current.normalize().multiplyScalar(speed);

    vel.current.x += (wish.current.x - vel.current.x) * (1 - Math.exp(-12 * dt));
    vel.current.z += (wish.current.z - vel.current.z) * (1 - Math.exp(-12 * dt));

    moving.current = vel.current.lengthSq() > 0.04;
    anim.current.moving = moving.current;

    // Jump / hover
    const space = !!keys.current.Space;
    if (space && grounded.current && !hovering.current) {
      vy.current = 7.2;
      grounded.current = false;
    }
    if (space && !grounded.current && vy.current < 2.5) {
      hovering.current = true;
      vy.current = Math.max(vy.current, 0.8);
    } else if (!space) {
      hovering.current = false;
    }
    anim.current.hovering = hovering.current;

    if (hovering.current) {
      vy.current += (1.6 - vy.current) * (1 - Math.exp(-6 * dt));
    } else {
      vy.current -= 22 * dt;
    }

    const pos = root.current.position;
    pos.x += vel.current.x * dt;
    pos.z += vel.current.z * dt;
    pos.y += vy.current * dt;

    // Ground collision
    if (pos.y <= GROUND_Y) {
      pos.y = GROUND_Y;
      vy.current = 0;
      grounded.current = true;
      hovering.current = false;
      anim.current.hovering = false;
    } else {
      grounded.current = false;
    }

    pos.x = THREE.MathUtils.clamp(pos.x, BOUNDS.minX, BOUNDS.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, BOUNDS.minZ, BOUNDS.maxZ);

    // Face movement direction
    if (hasWish) {
      const targetYaw = Math.atan2(wish.current.x, wish.current.z);
      let diff = targetYaw - facing.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      facing.current += diff * (1 - Math.exp(-10 * dt));
    }
    root.current.rotation.y = facing.current;

    // Third-person orbit camera
    const pitch = lookSmooth.current.pitch;
    const yaw = lookSmooth.current.yaw;
    const dist = lookSmooth.current.dist;
    const focusY = pos.y + ROBOT_HEIGHT * 0.85;

    camOffset.current.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist + 0.35,
      Math.cos(yaw) * Math.cos(pitch) * dist
    );
    camDesired.current.set(pos.x, focusY, pos.z).add(camOffset.current);
    camera.position.lerp(camDesired.current, 1 - Math.exp(-14 * dt));
    camera.lookAt(pos.x, focusY, pos.z);

    // Proximity
    let bestId: string | null = null;
    let best = proximity;
    for (const t of targets) {
      probe.current.set(
        t.position[0],
        Math.min(t.height * 0.4, 2.5),
        t.position[2]
      );
      const d = Math.hypot(pos.x - probe.current.x, pos.z - probe.current.z);
      if (d < best) {
        best = d;
        bestId = t.id;
      }
    }
    if (nearestId.current !== bestId) {
      nearestId.current = bestId;
      onNearestChange?.(bestId);
    }
  });

  if (!enabled) return null;

  return (
    <group ref={root} position={[0, 0, 8]}>
      <RobotMesh state={anim} />
      <pointLight
        position={[0, 1.2, 0.4]}
        intensity={0.55}
        distance={4}
        color={SAPPHIRE}
      />
    </group>
  );
}
