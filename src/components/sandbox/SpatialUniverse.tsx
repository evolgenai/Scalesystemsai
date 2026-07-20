"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh } from "three";
import { Activity, Radio, Terminal, X, Zap } from "lucide-react";

const EMERALD = "#34d399";
const CYAN = "#22d3ee";
const AMBER = "#f59e0b";

type TowerScript = {
  id: string;
  label: string;
  runtime: string;
  status: "idle" | "running" | "queued";
  lines: string[];
};

type TowerDef = {
  id: string;
  name: string;
  position: [number, number, number];
  height: number;
  accent: string;
  script: TowerScript;
};

const TOWERS: TowerDef[] = [
  {
    id: "tower-alpha",
    name: "NetDiag Tower",
    position: [-6.5, 0, -4],
    height: 4.2,
    accent: EMERALD,
    script: {
      id: "wifite-sim",
      label: "wifite · network diagnostic",
      runtime: "sandbox-microvm-07",
      status: "running",
      lines: [
        "[sandbox] mounting /opt/scripts/wifite_probe.sh",
        "[+] iface wlan0 → monitor mode (simulated)",
        "[+] scanning channels 1–11 · 2.4 GHz",
        "[*] AP map: 14 targets · RSSI -48..-91 dBm",
        "[*] handshake capture: queued (dry-run)",
        "[ok] diagnostic sequence paused · awaiting operator",
      ],
    },
  },
  {
    id: "tower-beta",
    name: "Shell Relay",
    position: [5.5, 0, -2.5],
    height: 3.4,
    accent: CYAN,
    script: {
      id: "health-ping",
      label: "edge-health · latency probe",
      runtime: "sandbox-microvm-12",
      status: "running",
      lines: [
        "[sandbox] exec /opt/scripts/edge_ping.sh",
        "→ cpt-1a  18ms  ok",
        "→ ams-3c  42ms  ok",
        "→ iad-4d  91ms  warn",
        "[*] jitter window 12s · sample n=48",
        "[ok] relay healthy · emerald path clear",
      ],
    },
  },
  {
    id: "tower-gamma",
    name: "Script Vault",
    position: [1.2, 0, 6],
    height: 5.1,
    accent: AMBER,
    script: {
      id: "upload-prep",
      label: "container-prep · script stage",
      runtime: "sandbox-microvm-03",
      status: "queued",
      lines: [
        "[sandbox] awaiting drop-zone upload",
        "[*] validate shebang · chmod +x",
        "[*] inject env: SANDBOX_TOKEN=••••",
        "[*] namespace: /tmp/virt-run/",
        "[idle] tower ready for shell payload",
      ],
    },
  },
];

const PROXIMITY = 3.2;

function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function CyberGrid() {
  const gridRef = useRef<THREE.GridHelper>(null);
  useFrame(({ clock }) => {
    if (!gridRef.current) return;
    const mat = gridRef.current.material;
    if (Array.isArray(mat)) return;
    mat.opacity = 0.28 + Math.sin(clock.elapsedTime * 0.6) * 0.04;
  });

  return (
    <>
      <gridHelper
        ref={gridRef}
        args={[48, 48, "#0f766e", "#1e293b"]}
        position={[0, 0.01, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial
          color="#050507"
          metalness={0.7}
          roughness={0.85}
          transparent
          opacity={0.92}
        />
      </mesh>
    </>
  );
}

function FloatingCamera({
  locked,
  onNearestTower,
}: {
  locked: boolean;
  onNearestTower: (tower: TowerDef | null) => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const velocity = useRef(new THREE.Vector3());
  const look = useRef({ x: 0, y: 0 });

  useEffect(() => {
    camera.position.set(0, 1.65, 8);
    camera.rotation.set(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
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
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: MouseEvent) => {
      if (!locked) return;
      const sens = 0.0022;
      look.current.y -= e.movementX * sens;
      look.current.x -= e.movementY * sens;
      look.current.x = Math.max(
        -Math.PI / 2.2,
        Math.min(Math.PI / 2.2, look.current.x)
      );
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [gl, locked]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    euler.current.set(look.current.x, look.current.y, 0);
    camera.quaternion.setFromEuler(euler.current);

    const speed = keys.current.ShiftLeft || keys.current.ShiftRight ? 7.5 : 4.2;
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const wish = new THREE.Vector3();
    if (keys.current.KeyW || keys.current.ArrowUp) wish.add(forward);
    if (keys.current.KeyS || keys.current.ArrowDown) wish.sub(forward);
    if (keys.current.KeyD || keys.current.ArrowRight) wish.add(right);
    if (keys.current.KeyA || keys.current.ArrowLeft) wish.sub(right);
    if (keys.current.Space || keys.current.KeyE) wish.y += 1;
    if (keys.current.ControlLeft || keys.current.KeyQ) wish.y -= 1;

    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    velocity.current.lerp(wish, 1 - Math.exp(-6 * dt));
    camera.position.addScaledVector(velocity.current, dt);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.8, 9);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -20, 20);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -20, 20);

    let nearest: TowerDef | null = null;
    let best = PROXIMITY;
    for (const t of TOWERS) {
      const d = camera.position.distanceTo(
        new THREE.Vector3(t.position[0], 1.2, t.position[2])
      );
      if (d < best) {
        best = d;
        nearest = t;
      }
    }
    onNearestTower(nearest);
  });

  return null;
}

function TerminalTower({
  tower,
  active,
}: {
  tower: TowerDef;
  active: boolean;
}) {
  const group = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * (active ? 1.4 : 0.5);
      const s = 1 + Math.sin(t * 2.2) * (active ? 0.08 : 0.03);
      core.current.scale.setScalar(s);
    }
    if (ring.current) {
      ring.current.rotation.z = t * 0.8;
      ring.current.position.y = tower.height * 0.55 + Math.sin(t * 1.6) * 0.15;
    }
  });

  return (
    <group ref={group} position={tower.position}>
      <mesh position={[0, tower.height / 2, 0]} castShadow>
        <boxGeometry args={[1.1, tower.height, 1.1]} />
        <meshStandardMaterial
          color="#0b1220"
          metalness={0.85}
          roughness={0.25}
          emissive={tower.accent}
          emissiveIntensity={active ? 0.35 : 0.12}
        />
      </mesh>
      <mesh position={[0, tower.height + 0.15, 0]}>
        <boxGeometry args={[1.35, 0.28, 1.35]} />
        <meshStandardMaterial
          color={tower.accent}
          emissive={tower.accent}
          emissiveIntensity={active ? 0.9 : 0.35}
          metalness={0.4}
          roughness={0.4}
        />
      </mesh>
      <mesh ref={core} position={[0, tower.height * 0.45, 0]}>
        <octahedronGeometry args={[0.35, 0]} />
        <meshStandardMaterial
          color={tower.accent}
          emissive={tower.accent}
          emissiveIntensity={active ? 1.2 : 0.5}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.035, 8, 48]} />
        <meshStandardMaterial
          color={tower.accent}
          emissive={tower.accent}
          emissiveIntensity={0.7}
          transparent
          opacity={0.7}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[0, 0.55 + i * (tower.height / 3.2), 0.56]}
        >
          <planeGeometry args={[0.55, 0.28]} />
          <meshBasicMaterial
            color={tower.accent}
            transparent
            opacity={active ? 0.55 : 0.22}
          />
        </mesh>
      ))}
      <Html
        position={[0, tower.height + 0.85, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: "none" }}
      >
        <div className="whitespace-nowrap rounded border border-white/10 bg-obsidian/80 px-2 py-1 font-mono text-[10px] text-emerald-300/90 backdrop-blur-md">
          {tower.name}
        </div>
      </Html>
    </group>
  );
}

function AmbientDrift() {
  const points = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 8 + 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: EMERALD,
        size: 0.05,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    []
  );
  const ref = useRef<THREE.Points>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.02;
  });
  return <points ref={ref} geometry={points} material={mat} />;
}

function Scene({
  locked,
  activeId,
  onNearestTower,
}: {
  locked: boolean;
  activeId: string | null;
  onNearestTower: (tower: TowerDef | null) => void;
}) {
  return (
    <>
      <color attach="background" args={["#050507"]} />
      <fog attach="fog" args={["#050507", 18, 42]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={0.85}
        color="#e2e8f0"
        castShadow
      />
      <pointLight position={[-8, 6, -4]} intensity={1.2} color={EMERALD} />
      <pointLight position={[6, 5, 4]} intensity={0.9} color={CYAN} />
      <CyberGrid />
      <AmbientDrift />
      {TOWERS.map((t) => (
        <TerminalTower key={t.id} tower={t} active={activeId === t.id} />
      ))}
      <FloatingCamera locked={locked} onNearestTower={onNearestTower} />
    </>
  );
}

function ScriptOverlay({
  tower,
  onClose,
}: {
  tower: TowerDef;
  onClose: () => void;
}) {
  const { script } = tower;
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 sm:left-auto sm:right-4 sm:w-[min(22rem,calc(100%-2rem))]">
      <div className="glass-panel overflow-hidden border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.12)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
              proximity · interaction zone
            </p>
            <h3 className="truncate text-sm font-semibold text-white">
              {tower.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-muted">
              {script.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Dismiss overlay"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3.5 py-2 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-cyan-accent">
            <Radio className="h-3 w-3" aria-hidden />
            {script.runtime}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono ${
              script.status === "running"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : script.status === "queued"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-white/10 text-slate-muted"
            }`}
          >
            <Activity className="h-3 w-3" aria-hidden />
            {script.status}
          </span>
        </div>
        <pre className="max-h-40 overflow-y-auto px-3.5 py-2.5 font-mono text-[10px] leading-relaxed text-emerald-200/90">
          {script.lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export default function SpatialUniverse() {
  const [webgl, setWebgl] = useState(true);
  const [locked, setLocked] = useState(false);
  const [nearest, setNearest] = useState<TowerDef | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const nearestRef = useRef<string | null>(null);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") setLocked(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleNearest = (tower: TowerDef | null) => {
    const id = tower?.id ?? null;
    if (nearestRef.current === id) return;
    nearestRef.current = id;
    setNearest(tower);
    if (tower && dismissed === tower.id) setDismissed(null);
  };

  const showOverlay =
    nearest && dismissed !== nearest.id ? nearest : null;

  return (
    <section
      className="glass-panel relative flex min-h-[420px] flex-col overflow-hidden"
      aria-label="Spatial sandbox universe"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3.5 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
            <Zap className="h-4 w-4 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Spatial Universe
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              first-person · cyber grid · terminal towers
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-muted">
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            WASD move
          </span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            Q/E · Space/Ctrl altitude
          </span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1">
            click · look
          </span>
        </div>
      </header>

      <div className="relative min-h-[360px] flex-1 bg-[#050507] sm:min-h-[480px] lg:min-h-[560px]">
        {!webgl ? (
          <div className="flex h-full min-h-[360px] items-center justify-center p-6 text-center">
            <p className="text-sm text-slate-muted">
              WebGL unavailable — spatial viewport disabled on this device.
            </p>
          </div>
        ) : (
          <SceneErrorBoundary onError={() => setWebgl(false)}>
            <Suspense fallback={null}>
              <Canvas
                shadows
                dpr={[1, 1.75]}
                camera={{ fov: 70, near: 0.1, far: 80, position: [0, 1.65, 8] }}
                gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
                onPointerDown={() => setLocked(true)}
                className="h-full w-full touch-none"
              >
                <Scene
                  locked={locked}
                  activeId={showOverlay?.id ?? null}
                  onNearestTower={handleNearest}
                />
              </Canvas>
            </Suspense>
          </SceneErrorBoundary>
        )}

        {!locked && webgl ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="glass rounded-lg px-4 py-3 text-center">
              <Terminal className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
              <p className="text-sm font-medium text-white">
                Click to enter viewport
              </p>
              <p className="mt-1 text-[11px] text-slate-muted">
                Approach a tower mesh to inspect live script actions
              </p>
            </div>
          </div>
        ) : null}

        {showOverlay ? (
          <ScriptOverlay
            tower={showOverlay}
            onClose={() => setDismissed(showOverlay.id)}
          />
        ) : null}
      </div>
    </section>
  );
}
