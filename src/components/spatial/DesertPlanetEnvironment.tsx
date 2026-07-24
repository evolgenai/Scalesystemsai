"use client";

/**
 * Photoreal cracked-mud desert + giant emerald planet skybox for Spatial Universe.
 * Playable ground stays near Y=0 so avatars, hitboxes, and pathfinding remain valid.
 * Perf: one displaced terrain mesh, instanced rocks/stars, cheap planet shells.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import type { Group, InstancedMesh, Mesh } from "three";

const SAND = "#b8956a";
const CLAY = "#8a6b4a";
const CRACK = "#3d3228";
const BIO = "#00ffaa";
const SAGE = "#6b8f71";
const EMERALD_FOG = "#152e24";

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, z: number): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    v += a * noise2(x * f, z * f);
    a *= 0.5;
    f *= 2.05;
  }
  return v;
}

/** Height at world xz — near-zero in playable core so avatars stay grounded. */
export function desertHeightAt(x: number, z: number): number {
  const r = Math.sqrt(x * x + z * z);
  const playable = Math.max(0, 1 - Math.exp(-((r - 28) * (r - 28)) / 900));
  const dunes = (fbm(x * 0.035, z * 0.035) - 0.5) * 2.8;
  const cracks = (fbm(x * 0.18, z * 0.18) - 0.5) * 0.35;
  return (dunes + cracks) * playable;
}

function DesertTerrain() {
  const geo = useMemo(() => {
    const size = 220;
    const seg = 96;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(SAND);
    const clay = new THREE.Color(CLAY);
    const crackCol = new THREE.Color(CRACK);
    const sage = new THREE.Color(SAGE);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = desertHeightAt(x, z);
      pos.setY(i, y);

      const r = Math.sqrt(x * x + z * z);
      const crack = fbm(x * 0.22, z * 0.22);
      const c = sand.clone();
      c.lerp(clay, fbm(x * 0.04, z * 0.04));
      if (crack > 0.62 && crack < 0.68) c.lerp(crackCol, 0.85);
      c.lerp(sage, THREE.MathUtils.clamp((r - 70) / 60, 0, 0.55));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh
      geometry={geo}
      rotation={[0, 0, 0]}
      receiveShadow
      position={[0, -0.02, 0]}
    >
      <meshStandardMaterial
        vertexColors
        roughness={0.92}
        metalness={0.08}
        flatShading={false}
      />
    </mesh>
  );
}

/** Instanced cracked-plate tiles for near-field mud detail (perf-safe). */
function CrackedMudTiles() {
  const meshRef = useRef<InstancedMesh>(null);
  const count = 48;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || mesh.userData.laid) return;
    const dummy = new THREE.Object3D();
    let i = 0;
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2 + hash2(n, 3) * 0.4;
      const r = 8 + hash2(n, 7) * 55;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.sqrt(x * x + z * z) < 6) continue;
      dummy.position.set(x, desertHeightAt(x, z) + 0.01, z);
      dummy.rotation.set(0, hash2(n, 11) * Math.PI * 2, 0);
      const s = 1.2 + hash2(n, 13) * 2.4;
      dummy.scale.set(s, 0.04 + hash2(n, 17) * 0.06, s * (0.7 + hash2(n, 19) * 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.laid = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow={false} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={CLAY} roughness={0.95} metalness={0.05} />
    </instancedMesh>
  );
}

function RockPinnacles() {
  const meshRef = useRef<InstancedMesh>(null);
  const N = 28;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || mesh.userData.laid) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (42 + hash2(i, 2) * 38) + (hash2(i, 5) - 0.5) * 18;
      const z = -25 + hash2(i, 8) * 90 - 40;
      const h = 4 + hash2(i, 12) * 14;
      dummy.position.set(x, desertHeightAt(x, z) + h * 0.45, z);
      dummy.rotation.set(
        (hash2(i, 14) - 0.5) * 0.25,
        hash2(i, 16) * Math.PI,
        (hash2(i, 18) - 0.5) * 0.2
      );
      dummy.scale.set(1.2 + hash2(i, 20) * 2.5, h, 1.2 + hash2(i, 22) * 2.2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.laid = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, N]} castShadow receiveShadow>
      <coneGeometry args={[1, 1, 5]} />
      <meshStandardMaterial color="#5c4a3a" roughness={0.9} metalness={0.12} />
    </instancedMesh>
  );
}

function HorizonEmeraldFog() {
  const band = useRef<Mesh>(null);
  useFrame((s) => {
    if (!band.current) return;
    const m = band.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.22 + Math.sin(s.clock.elapsedTime * 0.35) * 0.04;
  });
  return (
    <group>
      <mesh ref={band} position={[0, 3.5, -95]} rotation={[-0.08, 0, 0]}>
        <planeGeometry args={[280, 28]} />
        <meshBasicMaterial
          color={BIO}
          transparent
          opacity={0.24}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.2, -110]} rotation={[-0.12, 0, 0]}>
        <planeGeometry args={[320, 40]} />
        <meshBasicMaterial
          color={EMERALD_FOG}
          transparent
          opacity={0.55}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Side horizon wash */}
      <mesh position={[-100, 4, -40]} rotation={[0, Math.PI / 2.4, 0]}>
        <planeGeometry args={[160, 22]} />
        <meshBasicMaterial
          color={SAGE}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[100, 4, -40]} rotation={[0, -Math.PI / 2.4, 0]}>
        <planeGeometry args={[160, 22]} />
        <meshBasicMaterial
          color={SAGE}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function GiantEmeraldPlanet() {
  const planet = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const clouds = useRef<Mesh>(null);

  const continentGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(38, 48, 48);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const deep = new THREE.Color("#063d2e");
    const land = new THREE.Color("#1a8f5c");
    const bright = new THREE.Color("#00ffaa");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n = fbm(x * 0.08 + 2, z * 0.08);
      const c = deep.clone();
      if (n > 0.45) c.lerp(land, 0.85);
      if (n > 0.72) c.lerp(bright, 0.45);
      // polar haze
      c.lerp(new THREE.Color("#8fd9b8"), Math.abs(y) / 45 * 0.35);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    if (planet.current) planet.current.rotation.y += dt * 0.018;
    if (clouds.current) clouds.current.rotation.y += dt * 0.028;
    if (halo.current) {
      const s = 1 + Math.sin(performance.now() * 0.0006) * 0.015;
      halo.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[8, 72, -145]}>
      <mesh ref={planet} geometry={continentGeo}>
        <meshStandardMaterial
          vertexColors
          roughness={0.55}
          metalness={0.25}
          emissive={BIO}
          emissiveIntensity={0.18}
        />
      </mesh>
      <mesh ref={clouds} scale={1.035}>
        <sphereGeometry args={[38, 32, 32]} />
        <meshStandardMaterial
          color="#a8e6c8"
          transparent
          opacity={0.22}
          roughness={1}
          depthWrite={false}
          emissive={BIO}
          emissiveIntensity={0.12}
        />
      </mesh>
      <mesh ref={halo} scale={1.18}>
        <sphereGeometry args={[38, 24, 24]} />
        <meshBasicMaterial
          color={BIO}
          transparent
          opacity={0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>
      <pointLight color={BIO} intensity={8} distance={220} decay={2} />
    </group>
  );
}

function NebulaBackdrop() {
  const group = useRef<Group>(null);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.004;
  });
  return (
    <group ref={group}>
      {[
        { p: [-60, 40, -90] as const, s: 55, c: "#0a2a1c", o: 0.35 },
        { p: [50, 55, -100] as const, s: 48, c: "#123828", o: 0.28 },
        { p: [0, 90, -80] as const, s: 70, c: "#061810", o: 0.4 },
        { p: [-30, 30, -70] as const, s: 35, c: BIO, o: 0.06 },
      ].map((n, i) => (
        <mesh key={i} position={n.p}>
          <sphereGeometry args={[n.s, 16, 16]} />
          <meshBasicMaterial
            color={n.c}
            transparent
            opacity={n.o}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Sparse distant star field via instancing (complements drei Stars). */
function InstancedStarField() {
  const meshRef = useRef<InstancedMesh>(null);
  const N = 180;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || mesh.userData.laid) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const th = hash2(i, 1) * Math.PI * 2;
      const ph = hash2(i, 2) * Math.PI * 0.55;
      const r = 90 + hash2(i, 3) * 80;
      dummy.position.set(
        r * Math.sin(ph) * Math.cos(th),
        25 + r * Math.cos(ph) * 0.65,
        -40 + r * Math.sin(ph) * Math.sin(th) * 0.5
      );
      const s = 0.08 + hash2(i, 4) * 0.22;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.laid = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, N]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#c8ffe8" transparent opacity={0.85} />
    </instancedMesh>
  );
}

export default function DesertPlanetEnvironment() {
  return (
    <group>
      <color attach="background" args={["#030806"]} />
      <fog attach="fog" args={[EMERALD_FOG, 55, 175]} />
      <DesertTerrain />
      <CrackedMudTiles />
      <RockPinnacles />
      <HorizonEmeraldFog />
      <GiantEmeraldPlanet />
      <NebulaBackdrop />
      <InstancedStarField />
      <Stars
        radius={160}
        depth={60}
        count={1800}
        factor={3.2}
        saturation={0.4}
        fade
        speed={0.15}
      />
      {/* Soft ground contact wash — replaces harsh cyber grid contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <circleGeometry args={[18, 48]} />
        <meshBasicMaterial color="#1a1510" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}
