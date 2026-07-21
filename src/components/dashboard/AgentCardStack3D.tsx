"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { X } from "lucide-react";
import type { AgentCardState } from "@/lib/agents/streamProtocol";
import AgentVisualizerCard from "@/components/dashboard/AgentVisualizerCard";

const CARD_W = 2.65;
const CARD_H = 1.35;

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

function FlatAgentGrid({
  agents,
  onSelect,
}: {
  agents: AgentCardState[];
  onSelect?: (agent: AgentCardState) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={() => onSelect?.(agent)}
          className="min-w-[min(100%,16rem)] flex-1 text-left transition hover:opacity-95"
        >
          <AgentVisualizerCard agent={agent} />
        </button>
      ))}
    </div>
  );
}

function AgentDetailFlyout({
  agent,
  onClose,
}: {
  agent: AgentCardState;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close agent detail"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="agent-detail-title"
        className="relative z-10 m-3 w-full max-w-md overflow-hidden rounded-lg border border-white/5 bg-[#121212] p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">
              Agent detail
            </p>
            <h3
              id="agent-detail-title"
              className="mt-1 break-words font-display text-base font-semibold text-white"
            >
              {agent.name}
            </h3>
            <p className="mt-0.5 break-words text-xs text-slate-dim">{agent.role}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/5 p-1.5 text-slate-muted hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <AgentVisualizerCard agent={agent} />

        <dl className="mt-3 grid gap-2 rounded-lg border border-white/5 bg-black/30 p-3 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-dim">Status</dt>
            <dd className="font-mono text-blue-400">{agent.status}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-dim">Progress</dt>
            <dd className="font-mono text-cyan-accent">{Math.round(agent.progress)}%</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-dim">Stage</dt>
            <dd className="truncate text-right font-mono text-slate-muted">
              {agent.currentStage || "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-dim">ID</dt>
            <dd className="truncate font-mono text-slate-muted">{agent.id}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

type StackCardProps = {
  agent: AgentCardState;
  index: number;
  total: number;
  fanned: boolean;
  activeIndex: number | null;
  onHover: (index: number) => void;
  onActivate: (index: number) => void;
};

function StackCard({
  agent,
  index,
  total,
  fanned,
  activeIndex,
  onHover,
  onActivate,
  warn,
}: StackCardProps & { warn?: boolean }) {
  const group = useRef<Group>(null);
  const mid = (total - 1) / 2;
  const lifted = activeIndex === index;

  useFrame((_, delta) => {
    if (!group.current) return;
    const t = 1 - Math.exp(-10 * delta);
    const targetX = fanned ? (index - mid) * 1.55 : (index - mid) * 0.08;
    const targetY =
      (fanned ? Math.abs(index - mid) * -0.12 : index * 0.06) +
      (lifted ? 0.35 : 0);
    const targetZ =
      (fanned ? 0.2 - Math.abs(index - mid) * 0.05 : -index * 0.12) +
      (lifted ? 0.4 : 0);
    const targetRotZ = fanned ? (index - mid) * 0.1 : (index - mid) * 0.035;
    const targetRotY = fanned ? (index - mid) * -0.18 : 0;
    const targetRotX = lifted ? -0.12 : -0.08;

    group.current.position.x += (targetX - group.current.position.x) * t;
    group.current.position.y += (targetY - group.current.position.y) * t;
    group.current.position.z += (targetZ - group.current.position.z) * t;
    group.current.rotation.x += (targetRotX - group.current.rotation.x) * t;
    group.current.rotation.y += (targetRotY - group.current.rotation.y) * t;
    group.current.rotation.z += (targetRotZ - group.current.rotation.z) * t;
  });

  return (
    <group
      ref={group}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onActivate(index);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onHover(index);
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <mesh>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial
          color={warn ? "#3f1d1d" : "#121212"}
          emissive={warn ? "#b45309" : "#000000"}
          emissiveIntensity={warn ? 0.35 : 0}
          roughness={0.55}
          metalness={0.15}
          transparent
          opacity={0.96}
        />
      </mesh>
      <Html
        transform
        occlude={false}
        distanceFactor={3.2}
        position={[0, 0, 0.02]}
        style={{
          width: 300,
          pointerEvents: "none",
          userSelect: "none",
        }}
        className="pointer-events-none"
      >
        <div className="pointer-events-none rounded-lg shadow-lg shadow-black/50">
          <AgentVisualizerCard agent={agent} compact />
        </div>
      </Html>
    </group>
  );
}

function StackScene({
  agents,
  fanned,
  activeIndex,
  onHover,
  onActivate,
  onBackground,
  troubleshootActive = false,
}: {
  agents: AgentCardState[];
  fanned: boolean;
  activeIndex: number | null;
  onHover: (index: number) => void;
  onActivate: (index: number) => void;
  onBackground: () => void;
  troubleshootActive?: boolean;
}) {
  return (
    <group onClick={onBackground}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 8]} intensity={1.1} />
      <spotLight
        position={[-3, 4, 5]}
        intensity={0.6}
        angle={0.5}
        penumbra={0.8}
        color={troubleshootActive ? "#f59e0b" : "#3B82F6"}
      />
      {agents.map((agent, index) => (
        <StackCard
          key={agent.id}
          agent={agent}
          index={index}
          total={agents.length}
          fanned={fanned}
          activeIndex={activeIndex}
          onHover={onHover}
          onActivate={onActivate}
          warn={troubleshootActive && index === 0}
        />
      ))}
    </group>
  );
}

export default function AgentCardStack3D({
  agents,
  troubleshootActive = false,
}: {
  agents: AgentCardState[];
  /** When true, nearest deck card flashes warning (simulated heal loop). */
  troubleshootActive?: boolean;
}) {
  /** Live deck from dashboard stream state — top 4 active visualizer slots. */
  const deck = useMemo(() => agents.slice(0, 4), [agents]);
  const displayDeck = useMemo(() => {
    if (!troubleshootActive || deck.length === 0) return deck;
    const head = deck[0]!;
    return [
      {
        ...head,
        status: "ERROR" as const,
        currentStage: "Troubleshooting simulated crash…",
      },
      ...deck.slice(1),
    ];
  }, [deck, troubleshootActive]);
  const [fanned, setFanned] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [use3d, setUse3d] = useState(true);

  useEffect(() => {
    setMounted(true);
    setUse3d(supportsWebGL());
  }, []);

  useEffect(() => {
    if (troubleshootActive) {
      setFanned(true);
      setActiveIndex(0);
    }
  }, [troubleshootActive]);

  const detailAgent = useMemo(() => {
    if (!detailId) return null;
    return agents.find((a) => a.id === detailId) ?? null;
  }, [agents, detailId]);

  const openDetail = useCallback((agent: AgentCardState) => {
    setDetailId(agent.id);
  }, []);

  const onHover = useCallback((index: number) => {
    setFanned(true);
    setActiveIndex(index);
  }, []);

  const onActivate = useCallback(
    (index: number) => {
      setFanned(true);
      setActiveIndex(index);
      const agent = displayDeck[index];
      if (agent) openDetail(agent);
    },
    [displayDeck, openDetail]
  );

  const onBackground = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const showFlat = !mounted || !use3d || displayDeck.length === 0;

  return (
    <div className="space-y-3">
      {!showFlat ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-dim">
            {troubleshootActive
              ? "Agent card in troubleshooting mode"
              : "Hover or tap a card for live agent detail"}
          </p>
          <button
            type="button"
            onClick={() => {
              setFanned((v) => !v);
              if (fanned) setActiveIndex(null);
            }}
            className="rounded-lg border border-white/5 bg-[#121212] px-3 py-1.5 text-[11px] font-medium text-blue-400 transition hover:border-blue-500/30"
          >
            {fanned ? "Stack cards" : "Fan out"}
          </button>
        </div>
      ) : null}

      {showFlat ? (
        <FlatAgentGrid
          agents={displayDeck.length ? displayDeck : agents.slice(0, 4)}
          onSelect={openDetail}
        />
      ) : (
        <WebGLErrorBoundary onError={() => setUse3d(false)}>
          <div
            className={`relative h-[280px] w-full touch-none overflow-hidden rounded-lg border bg-[#0a0a0a] pointer-events-auto sm:h-[320px] md:h-[360px] ${
              troubleshootActive
                ? "border-amber-400/40 ring-1 ring-rose-400/30"
                : "border-white/5"
            }`}
            onPointerEnter={() => setFanned(true)}
            onPointerLeave={() => {
              if (!troubleshootActive) {
                setFanned(false);
                setActiveIndex(null);
              }
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,rgba(59, 130, 246,0.06),transparent_70%)]"
              aria-hidden
            />
            <Canvas
              camera={{ position: [0, 0.2, 6.2], fov: 38 }}
              dpr={[1, 1.75]}
              gl={{ antialias: true, alpha: true }}
              className="pointer-events-auto relative z-[1] h-full w-full touch-none"
              onCreated={({ gl }) => {
                gl.domElement.addEventListener("webglcontextlost", (e) => {
                  e.preventDefault();
                  setUse3d(false);
                });
              }}
            >
              <Suspense fallback={null}>
                <StackScene
                  agents={displayDeck}
                  fanned={fanned}
                  activeIndex={activeIndex}
                  onHover={onHover}
                  onActivate={onActivate}
                  onBackground={onBackground}
                  troubleshootActive={troubleshootActive}
                />
              </Suspense>
            </Canvas>
          </div>
        </WebGLErrorBoundary>
      )}

      {detailAgent ? (
        <AgentDetailFlyout
          agent={detailAgent}
          onClose={() => setDetailId(null)}
        />
      ) : null}

      <ul className="sr-only">
        {displayDeck.map((agent) => (
          <li key={agent.id}>
            {agent.name}: {agent.status} {agent.progress}%
          </li>
        ))}
      </ul>
    </div>
  );
}
