"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import {
  consumeCameraFocus,
  consumeTouchLook,
  getTouchAxes,
} from "@/lib/spatial/touchInput";

const BIO_GLOW = "#00ffaa";
const EMERALD = "#10B981";
const ROBOT_HEIGHT = 1.15;
const GROUND_Y = 0;
const PROXIMITY_DEFAULT = 3;
const MORPH_PROXIMITY_DEFAULT = 5.5;

const MIN_POLAR = Math.PI / 6;
const MAX_POLAR = Math.PI / 2 + 0.28;
const CAM_DIST_MIN = 3.2;
const CAM_DIST_MAX = 11;
const CAM_DIST_DEFAULT = 5.5;

const BOUNDS = {
  minX: -95,
  maxX: 95,
  minZ: -95,
  maxZ: 95,
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
  morphProximity?: number;
  onNearestChange?: (id: string | null) => void;
  onNearbyChange?: (ids: string[]) => void;
  onPositionChange?: (pos: [number, number, number]) => void;
  onInteract?: (id: string) => void;
  enabled?: boolean;
  /** Shared world position — updated every frame (no React setState). */
  positionRef?: MutableRefObject<THREE.Vector3>;
  /** When true, avatar is seated in vehicle (hidden mesh, drive physics). */
  mountedRef?: MutableRefObject<boolean>;
  /** Extra speed multiplier (vehicle = 2). Read every frame from ref. */
  speedMultRef?: MutableRefObject<number>;
  /** Extra camera distance while driving. */
  camBoostRef?: MutableRefObject<number>;
  /** One-shot world snap on vehicle mount (cleared after apply). */
  mountSnapRef?: MutableRefObject<THREE.Vector3 | null>;
  /**
   * Pathfinding queue — world waypoints. Avatar auto-navigates while
   * non-empty; manual WASD clears the queue. Mutated in place each frame.
   */
  pathQueueRef?: MutableRefObject<THREE.Vector3[]>;
  /** Fired once when the path queue drains (arrival). */
  onPathComplete?: () => void;
};

/** Sprint 48 bio-metallic alien pilot mesh */
function AlienMesh({
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
  const cranium = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { moving, hovering } = state.current;
    const bob = hovering ? Math.sin(t * 6.5) * 0.04 : Math.sin(t * 3.2) * 0.012;
    if (group.current) group.current.position.y = bob;

    const eyePulse = 1.1 + Math.sin(t * 6.2) * 0.55;
    for (const eye of [eyeL.current, eyeR.current]) {
      if (!eye) continue;
      const mat = eye.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = eyePulse;
      eye.scale.setScalar(0.95 + Math.sin(t * 5 + (eye === eyeL.current ? 0 : 1)) * 0.08);
    }

    const thrust = hovering || moving ? 1.5 + Math.sin(t * 18) * 0.55 : 0.28;
    for (const thr of [thrusterL.current, thrusterR.current]) {
      if (!thr) continue;
      const mat = thr.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = thrust;
      thr.scale.y = hovering || moving ? 1.25 + Math.sin(t * 22) * 0.35 : 0.55;
    }

    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.55 + Math.sin(t * 2.8) * 0.25;
    }
    if (cranium.current) {
      cranium.current.rotation.y = Math.sin(t * 0.6) * 0.04;
    }
  });

  return (
    <group ref={group}>
      {/* Elongated alien cranium */}
      <mesh ref={cranium} position={[0, 1.28, -0.02]} castShadow>
        <sphereGeometry args={[0.32, 24, 20]} />
        <meshStandardMaterial
          color="#152e24"
          metalness={0.75}
          roughness={0.28}
          emissive="#0a1f18"
          emissiveIntensity={0.25}
        />
      </mesh>
      <mesh position={[0, 1.48, -0.08]} castShadow scale={[0.85, 1.15, 0.9]}>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial
          color="#13191c"
          metalness={0.88}
          roughness={0.2}
        />
      </mesh>
      {/* Large bioluminescent eyes */}
      <mesh ref={eyeL} position={[-0.12, 1.26, 0.22]}>
        <sphereGeometry args={[0.085, 16, 16]} />
        <meshStandardMaterial
          color={BIO_GLOW}
          emissive={BIO_GLOW}
          emissiveIntensity={1.2}
          metalness={0.15}
          roughness={0.12}
        />
      </mesh>
      <mesh ref={eyeR} position={[0.12, 1.26, 0.22]}>
        <sphereGeometry args={[0.085, 16, 16]} />
        <meshStandardMaterial
          color={BIO_GLOW}
          emissive={BIO_GLOW}
          emissiveIntensity={1.2}
          metalness={0.15}
          roughness={0.12}
        />
      </mesh>
      {/* Slim bio-metallic torso */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.42, 8, 16]} />
        <meshStandardMaterial
          color="#1a2428"
          metalness={0.94}
          roughness={0.16}
          envMapIntensity={1.3}
        />
      </mesh>
      <mesh ref={core} position={[0, 0.78, 0.18]} castShadow>
        <circleGeometry args={[0.12, 20]} />
        <meshStandardMaterial
          color="#080b0c"
          metalness={0.8}
          roughness={0.2}
          emissive={BIO_GLOW}
          emissiveIntensity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.38, 0.7, 0]} rotation={[0, 0, 0.25]} castShadow>
        <capsuleGeometry args={[0.055, 0.38, 6, 10]} />
        <meshStandardMaterial color="#13191c" metalness={0.9} roughness={0.22} />
      </mesh>
      <mesh position={[0.38, 0.7, 0]} rotation={[0, 0, -0.25]} castShadow>
        <capsuleGeometry args={[0.055, 0.38, 6, 10]} />
        <meshStandardMaterial color="#13191c" metalness={0.9} roughness={0.22} />
      </mesh>
      {/* Digit digits */}
      <mesh position={[-0.42, 0.42, 0.05]} castShadow>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial
          color={BIO_GLOW}
          emissive={EMERALD}
          emissiveIntensity={0.45}
        />
      </mesh>
      <mesh position={[0.42, 0.42, 0.05]} castShadow>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial
          color={BIO_GLOW}
          emissive={EMERALD}
          emissiveIntensity={0.45}
        />
      </mesh>
      {/* Legs / hover mounts */}
      <mesh position={[-0.14, 0.28, 0]} castShadow>
        <capsuleGeometry args={[0.07, 0.22, 6, 10]} />
        <meshStandardMaterial color="#0c1214" metalness={0.88} roughness={0.24} />
      </mesh>
      <mesh position={[0.14, 0.28, 0]} castShadow>
        <capsuleGeometry args={[0.07, 0.22, 6, 10]} />
        <meshStandardMaterial color="#0c1214" metalness={0.88} roughness={0.24} />
      </mesh>
      <mesh ref={thrusterL} position={[-0.14, 0.04, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.09, 0.28, 10]} />
        <meshStandardMaterial
          color={BIO_GLOW}
          emissive={BIO_GLOW}
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
          metalness={0.1}
          roughness={0.35}
        />
      </mesh>
      <mesh ref={thrusterR} position={[0.14, 0.04, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.09, 0.28, 10]} />
        <meshStandardMaterial
          color={BIO_GLOW}
          emissive={BIO_GLOW}
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
          metalness={0.1}
          roughness={0.35}
        />
      </mesh>
    </group>
  );
}

/**
 * GTA-style third-person alien avatar: WASD relative to camera yaw,
 * Shift sprint, Space jump/hover, 360° orbit mouse look with damping.
 */
export default function RobotAvatar({
  locked,
  targets = [],
  proximity = PROXIMITY_DEFAULT,
  morphProximity = MORPH_PROXIMITY_DEFAULT,
  onNearestChange,
  onNearbyChange,
  onPositionChange,
  onInteract,
  enabled = true,
  positionRef,
  mountedRef,
  speedMultRef,
  camBoostRef,
  mountSnapRef,
  pathQueueRef,
  onPathComplete,
}: RobotAvatarProps) {
  const { camera, gl } = useThree();
  const root = useRef<Group>(null);
  const meshVisible = useRef<Group>(null);
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
  const nearbyKey = useRef("");
  const facing = useRef(0);
  const anim = useRef({ moving: false, hovering: false });
  const posTick = useRef(0);
  const pathCompleteFired = useRef(false);
  const pathLenRef = useRef(0);
  const onPathCompleteRef = useRef(onPathComplete);
  onPathCompleteRef.current = onPathComplete;

  useEffect(() => {
    if (!enabled) return;
    camera.position.set(0, 3.2, CAM_DIST_DEFAULT + 2);
  }, [camera, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      keys.current[e.code] = true;
      if (e.code === "Space" && locked) e.preventDefault();
      if (e.code === "KeyE" && locked && nearestId.current && onInteract) {
        if (mountedRef?.current) return;
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
  }, [enabled, locked, onInteract, mountedRef]);

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

  // Sync vehicle spawn into avatar root when mount snaps position
  useFrame((_, delta) => {
    if (!enabled || !root.current) return;
    const dt = Math.min(delta, 0.033);
    const driving = !!mountedRef?.current;
    const speedMult = speedMultRef?.current ?? 1;
    const camBoost = camBoostRef?.current ?? 0;

    if (mountSnapRef?.current) {
      const snap = mountSnapRef.current;
      root.current.position.set(snap.x, GROUND_Y, snap.z);
      vel.current.set(0, 0, 0);
      vy.current = 0;
      mountSnapRef.current = null;
    }

    // Mobile swipe look + command-driven camera focus
    if (locked) {
      const touchLook = consumeTouchLook();
      look.current.yaw += touchLook.yaw;
      look.current.pitch += touchLook.pitch;
      const minPitch = MIN_POLAR - Math.PI / 2;
      const maxPitch = MAX_POLAR - Math.PI / 2;
      look.current.pitch = THREE.MathUtils.clamp(
        look.current.pitch,
        minPitch,
        maxPitch
      );

      const focus = consumeCameraFocus();
      if (focus) {
        const dx = focus.x - root.current.position.x;
        const dz = focus.z - root.current.position.z;
        if (dx * dx + dz * dz > 0.01) {
          // Match camera-forward convention: (-sin(yaw), -cos(yaw))
          look.current.yaw = Math.atan2(-dx, -dz);
        }
      }
    }

    if (meshVisible.current) {
      meshVisible.current.visible = !driving;
    }

    // Orbit damping (OrbitControls-equivalent)
    const damp = 1 - Math.exp(-10 * dt);
    lookSmooth.current.yaw += (look.current.yaw - lookSmooth.current.yaw) * damp;
    lookSmooth.current.pitch +=
      (look.current.pitch - lookSmooth.current.pitch) * damp;
    const targetDist = THREE.MathUtils.clamp(
      look.current.dist + camBoost,
      CAM_DIST_MIN,
      CAM_DIST_MAX + 6
    );
    lookSmooth.current.dist += (targetDist - lookSmooth.current.dist) * damp;

    const sprint = keys.current.ShiftLeft || keys.current.ShiftRight;
    const base = driving ? (sprint ? 11 : 5.5) * speedMult : sprint ? 11 : 5.5;
    const speed = base;

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

    // Virtual d-pad / touch axes (mobile HUD)
    if (locked) {
      const touch = getTouchAxes();
      if (Math.abs(touch.forward) > 0.02 || Math.abs(touch.strafe) > 0.02) {
        wish.current.addScaledVector(forward.current, touch.forward);
        wish.current.addScaledVector(right.current, touch.strafe);
      }
    }

    // Manual input cancels automated pathfinding
    const manualWish = wish.current.lengthSq() > 1e-6;
    if (manualWish && pathQueueRef?.current.length) {
      pathQueueRef.current.length = 0;
      pathCompleteFired.current = false;
    }

    let autoPathing = false;
    const queue = pathQueueRef?.current;
    const qLen = queue?.length ?? 0;
    if (qLen > pathLenRef.current) {
      pathCompleteFired.current = false;
    }
    pathLenRef.current = qLen;
    if (!manualWish && queue && queue.length > 0 && !driving) {
      autoPathing = true;
      const waypoint = queue[0]!;
      const dx = waypoint.x - root.current.position.x;
      const dz = waypoint.z - root.current.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35) {
        queue.shift();
        if (queue.length === 0 && !pathCompleteFired.current) {
          pathCompleteFired.current = true;
          onPathCompleteRef.current?.();
        }
      } else {
        wish.current.set(dx / dist, 0, dz / dist).multiplyScalar(7.2);
      }
    }

    const hasWish = wish.current.lengthSq() > 1e-6;
    if (hasWish && !autoPathing) {
      wish.current.normalize().multiplyScalar(speed);
    }

    const accel = driving ? 8 : 12;
    vel.current.x +=
      (wish.current.x - vel.current.x) * (1 - Math.exp(-accel * dt));
    vel.current.z +=
      (wish.current.z - vel.current.z) * (1 - Math.exp(-accel * dt));

    moving.current = vel.current.lengthSq() > 0.04;
    anim.current.moving = moving.current;

    // Jump / hover — disabled while driving
    const space = !!keys.current.Space && !driving;
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

    if (driving) {
      vy.current = 0;
    } else if (hovering.current) {
      vy.current += (1.6 - vy.current) * (1 - Math.exp(-6 * dt));
    } else {
      vy.current -= 22 * dt;
    }

    const pos = root.current.position;
    pos.x += vel.current.x * dt;
    pos.z += vel.current.z * dt;
    pos.y += vy.current * dt;

    // Ground collision
    if (pos.y <= GROUND_Y || driving) {
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

    // Sync shared position ref every frame (vehicle + hardware proximity)
    positionRef?.current.set(pos.x, pos.y, pos.z);

    // Third-person orbit camera (zooms out while driving via camBoost)
    const pitch = lookSmooth.current.pitch;
    const yaw = lookSmooth.current.yaw;
    const dist = lookSmooth.current.dist;
    const focusY = pos.y + (driving ? 1.35 : ROBOT_HEIGHT * 0.85);

    camOffset.current.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist + 0.35,
      Math.cos(yaw) * Math.cos(pitch) * dist
    );
    camDesired.current.set(pos.x, focusY, pos.z).add(camOffset.current);
    camera.position.lerp(camDesired.current, 1 - Math.exp(-14 * dt));
    camera.lookAt(pos.x, focusY, pos.z);

    // Proximity (nearest + multi-node for morph)
    let bestId: string | null = null;
    let best = proximity;
    const nearby: string[] = [];
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
      if (d < morphProximity) nearby.push(t.id);
    }
    if (nearestId.current !== bestId) {
      nearestId.current = bestId;
      onNearestChange?.(bestId);
    }
    const key = nearby.slice().sort().join(",");
    if (key !== nearbyKey.current) {
      nearbyKey.current = key;
      onNearbyChange?.(nearby);
    }
    posTick.current += dt;
    if (posTick.current > 0.12) {
      posTick.current = 0;
      onPositionChange?.([pos.x, pos.y, pos.z]);
    }
  });

  if (!enabled) return null;

  return (
    <group ref={root} position={[0, 0, 8]}>
      <group ref={meshVisible}>
        <AlienMesh state={anim} />
        <pointLight
          position={[0, 1.2, 0.4]}
          intensity={0.7}
          distance={4.5}
          color={BIO_GLOW}
        />
      </group>
    </group>
  );
}
