"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import CanvasRunner from "@/components/builder/CanvasRunner";
import GlowingEdge from "@/components/builder/edges/GlowingEdge";
import ActionNode from "@/components/builder/nodes/ActionNode";
import AgentNode from "@/components/builder/nodes/AgentNode";
import TriggerNode from "@/components/builder/nodes/TriggerNode";
import NodePalette from "@/components/builder/NodePalette";
import {
  PALETTE_ITEMS,
  WORKFLOW_TEMPLATES,
  createNodeFromPalette,
} from "@/components/builder/templates";
import type {
  BlueprintEdge,
  BlueprintNode,
  BlueprintNodeData,
  NodeExecStatus,
  RunnerState,
  WorkflowTemplate,
} from "@/components/builder/types";
import { emitCanvasRunBusy } from "@/components/billing/GasMeterPill";

const STORAGE_KEY = "scalesystems.blueprint.v1";
const MARKETPLACE_INSTALL_KEY = "scalesystems.marketplace.install";

const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  action: ActionNode,
};

const edgeTypes = {
  glowing: GlowingEdge,
};

const INITIAL_RUNNER: RunnerState = {
  status: "idle",
  activeNodeId: null,
  completedNodeIds: [],
  logs: [],
};

function cloneGraph(template: WorkflowTemplate): {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
} {
  return {
    nodes: template.nodes.map((n) => ({
      ...n,
      data: { ...n.data, params: { ...n.data.params }, status: "idle" },
      position: { ...n.position },
    })),
    edges: template.edges.map((e) => ({ ...e, data: { active: false } })),
  };
}

function topologicalOrder(
  nodes: BlueprintNode[],
  edges: BlueprintEdge[]
): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const q = [...ids].filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) q.push(next);
    }
  }
  return order.length === nodes.length ? order : nodes.map((n) => n.id);
}

function stripRuntime(data: BlueprintNodeData): BlueprintNodeData {
  const { onApprove: _a, onRetry: _r, ...rest } = data;
  return { ...rest, status: "idle", params: { ...rest.params } };
}

function BlueprintCanvasInner() {
  const seed = useMemo(() => cloneGraph(WORKFLOW_TEMPLATES[0]!), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seed.edges);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [debuggerOpen, setDebuggerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runner, setRunner] = useState<RunnerState>(INITIAL_RUNNER);
  const simRef = useRef<number[]>([]);
  const resumeRef = useRef<(() => void) | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const busy =
    runner.status === "simulating" || runner.status === "deploying";

  useEffect(() => {
    emitCanvasRunBusy(busy);
    return () => emitCanvasRunBusy(false);
  }, [busy]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  const clearTimers = useCallback(() => {
    for (const t of simRef.current) window.clearTimeout(t);
    simRef.current = [];
    resumeRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "glowing",
            data: { active: false },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const applyTemplate = useCallback(
    (template: WorkflowTemplate) => {
      clearTimers();
      const graph = cloneGraph(template);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setRunner(INITIAL_RUNNER);
      setSelectedId(null);
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
    },
    [clearTimers, fitView, setEdges, setNodes]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/blueprint-node");
      if (!raw) return;
      let paletteId = raw;
      try {
        paletteId = JSON.parse(raw) as string;
      } catch {
        /* plain id */
      }
      const item = PALETTE_ITEMS.find((p) => p.id === paletteId);
      if (!item) return;
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      const id = `${item.kind}-${Date.now().toString(36)}`;
      setNodes((nds) => [...nds, createNodeFromPalette(item, position, id)]);
    },
    [screenToFlowPosition, setNodes]
  );

  const patchNode = useCallback(
    (
      nodeId: string,
      patch: Partial<BlueprintNodeData> & { status?: NodeExecStatus }
    ) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, ...patch } }
            : n
        )
      );
    },
    [setNodes]
  );

  const resetNodeStatuses = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: "idle" as const,
          onApprove: undefined,
          onRetry: undefined,
        },
      }))
    );
  }, [setNodes]);

  const setEdgeActive = useCallback(
    (sourceId: string | null, targetId: string | null, active: boolean) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (!sourceId) {
            return { ...e, data: { ...e.data, active: false } };
          }
          const match =
            e.source === sourceId && (!targetId || e.target === targetId);
          return match ? { ...e, data: { ...e.data, active } } : e;
        })
      );
    },
    [setEdges]
  );

  const completeNode = useCallback(
    (nodeId: string, label: string, isLast: boolean) => {
      patchNode(nodeId, {
        status: "done",
        onApprove: undefined,
        onRetry: undefined,
      });
      setRunner((r) => ({
        ...r,
        completedNodeIds: r.completedNodeIds.includes(nodeId)
          ? r.completedNodeIds
          : [...r.completedNodeIds, nodeId],
        logs: r.logs.map((l) =>
          l.nodeId === nodeId &&
          (l.status === "running" || l.status === "paused" || l.status === "error")
            ? { ...l, status: "done", message: `${label} completed` }
            : l
        ),
        ...(isLast
          ? { status: "idle" as const, activeNodeId: null }
          : { status: "simulating" as const }),
      }));
      if (isLast) {
        setEdges((eds) =>
          eds.map((e) => ({ ...e, data: { ...e.data, active: true } }))
        );
      }
    },
    [patchNode, setEdges]
  );

  const runFromIndex = useCallback(
    (order: string[], startIndex: number, snapshot: BlueprintNode[]) => {
      const stepMs = 900;

      for (let index = startIndex; index < order.length; index++) {
        const nodeId = order[index]!;
        const delay = (index - startIndex) * stepMs;

        const startT = window.setTimeout(() => {
          const node = snapshot.find((n) => n.id === nodeId);
          const data = node?.data as BlueprintNodeData | undefined;
          const label = data?.label ?? nodeId;
          const prev = index > 0 ? order[index - 1]! : null;
          if (prev) setEdgeActive(prev, nodeId, true);

          const needsHitl = data?.kind === "action";
          const shouldFail =
            data?.kind === "agent" && data.variant === "sre" && index > 0;

          if (needsHitl) {
            patchNode(nodeId, {
              status: "paused",
              onApprove: () => {
                resumeRef.current?.();
              },
              onRetry: undefined,
            });
            setRunner((r) => ({
              ...r,
              status: "paused",
              activeNodeId: nodeId,
              logs: [
                ...r.logs,
                {
                  id: `${nodeId}-${index}-pause`,
                  nodeId,
                  label,
                  message: `HITL gate on ${label} — approve to continue`,
                  at: Date.now(),
                  status: "paused",
                },
              ],
            }));

            // Pause schedule: clear remaining timers and resume on approve
            for (const t of simRef.current) window.clearTimeout(t);
            simRef.current = [];

            resumeRef.current = () => {
              resumeRef.current = null;
              completeNode(nodeId, label, index === order.length - 1);
              if (index < order.length - 1) {
                setRunner((r) => ({
                  ...r,
                  status: "simulating",
                  activeNodeId: order[index + 1] ?? null,
                }));
                runFromIndex(order, index + 1, snapshot);
              }
            };
            return;
          }

          if (shouldFail) {
            patchNode(nodeId, {
              status: "error",
              onApprove: undefined,
              onRetry: () => {
                resumeRef.current?.();
              },
            });
            setRunner((r) => ({
              ...r,
              status: "paused",
              activeNodeId: nodeId,
              logs: [
                ...r.logs,
                {
                  id: `${nodeId}-${index}-err`,
                  nodeId,
                  label,
                  message: `${label} failed — Retry / Meta-SRE Heal`,
                  at: Date.now(),
                  status: "error",
                },
              ],
            }));

            for (const t of simRef.current) window.clearTimeout(t);
            simRef.current = [];

            resumeRef.current = () => {
              resumeRef.current = null;
              patchNode(nodeId, { status: "running", onRetry: undefined });
              setRunner((r) => ({
                ...r,
                status: "simulating",
                logs: [
                  ...r.logs,
                  {
                    id: `${nodeId}-${index}-heal`,
                    nodeId,
                    label,
                    message: `Meta-SRE heal applied to ${label}`,
                    at: Date.now(),
                    status: "running",
                  },
                ],
              }));
              const healT = window.setTimeout(() => {
                completeNode(nodeId, label, index === order.length - 1);
                if (index < order.length - 1) {
                  runFromIndex(order, index + 1, snapshot);
                }
              }, 700);
              simRef.current.push(healT);
            };
            return;
          }

          patchNode(nodeId, {
            status: "running",
            onApprove: undefined,
            onRetry: undefined,
          });
          setRunner((r) => ({
            ...r,
            status: "simulating",
            activeNodeId: nodeId,
            logs: [
              ...r.logs,
              {
                id: `${nodeId}-${index}-run`,
                nodeId,
                label,
                message: `Executing ${label}…`,
                at: Date.now(),
                status: "running",
              },
            ],
          }));
        }, delay);
        simRef.current.push(startT);

        // Only schedule auto-complete for non-HITL / non-fail steps
        const node = snapshot.find((n) => n.id === nodeId);
        const data = node?.data as BlueprintNodeData | undefined;
        const needsHitl = data?.kind === "action";
        const shouldFail =
          data?.kind === "agent" && data.variant === "sre" && index > 0;

        if (!needsHitl && !shouldFail) {
          const doneT = window.setTimeout(() => {
            const label = data?.label ?? nodeId;
            completeNode(nodeId, label, index === order.length - 1);
          }, delay + stepMs - 120);
          simRef.current.push(doneT);
        } else {
          // Stop scheduling further steps until HITL / heal resumes
          break;
        }
      }
    },
    [completeNode, patchNode, setEdgeActive]
  );

  const runSimulation = useCallback(() => {
    if (busy || nodes.length === 0) return;
    clearTimers();
    resumeRef.current = null;
    setDebuggerOpen(true);

    const order = topologicalOrder(nodes as BlueprintNode[], edges);
    const snapshot = nodes as BlueprintNode[];
    resetNodeStatuses();
    setEdges((eds) =>
      eds.map((e) => ({ ...e, data: { ...e.data, active: false } }))
    );

    setRunner({
      status: "simulating",
      activeNodeId: null,
      completedNodeIds: [],
      logs: [],
    });

    runFromIndex(order, 0, snapshot);
  }, [
    busy,
    clearTimers,
    edges,
    nodes,
    resetNodeStatuses,
    runFromIndex,
    setEdges,
  ]);

  const deployWorkflow = useCallback(() => {
    if (busy) return;
    clearTimers();
    setRunner((r) => ({ ...r, status: "deploying" }));
    const t = window.setTimeout(() => {
      setRunner((r) => ({
        ...r,
        status: "idle",
        logs: [
          ...r.logs,
          {
            id: `deploy-${Date.now()}`,
            nodeId: "deploy",
            label: "Deploy",
            message: `Deployed ${nodes.length} nodes / ${edges.length} edges`,
            at: Date.now(),
            status: "done",
          },
        ],
      }));
      setDebuggerOpen(true);
    }, 1100);
    simRef.current.push(t);
  }, [busy, clearTimers, edges.length, nodes.length]);

  const saveBlueprint = useCallback(() => {
    if (busy) return;
    try {
      const persistNodes = nodes.map((n) => ({
        ...n,
        data: stripRuntime(n.data as BlueprintNodeData),
      }));
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ nodes: persistNodes, edges, savedAt: Date.now() })
      );
      setRunner((r) => ({ ...r, status: "saved" }));
      const t = window.setTimeout(() => {
        setRunner((r) =>
          r.status === "saved" ? { ...r, status: "idle" } : r
        );
      }, 1600);
      simRef.current.push(t);
    } catch {
      /* ignore quota */
    }
  }, [busy, edges, nodes]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        nodes?: BlueprintNode[];
        edges?: BlueprintEdge[];
      };
      if (parsed.nodes?.length) {
        setNodes(
          parsed.nodes.map((n) => ({
            ...n,
            data: { ...stripRuntime(n.data), status: "idle" },
          }))
        );
      }
      if (parsed.edges?.length) {
        setEdges(
          parsed.edges.map((e) => ({
            ...e,
            type: "glowing",
            data: { ...e.data, active: false },
          }))
        );
      }
    } catch {
      /* ignore */
    }
    // hydrate once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marketplace → canvas install handoff
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MARKETPLACE_INSTALL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        paletteId?: string;
        title?: string;
      };
      window.localStorage.removeItem(MARKETPLACE_INSTALL_KEY);
      const item = PALETTE_ITEMS.find((p) => p.id === parsed.paletteId);
      if (!item) return;
      const id = `${item.kind}-${Date.now().toString(36)}`;
      const node = createNodeFromPalette(item, { x: 280, y: 180 }, id);
      if (parsed.title) {
        node.data = { ...node.data, label: parsed.title };
      }
      setNodes((nds) => [...nds, node]);
      setPaletteOpen(true);
      requestAnimationFrame(() => fitView({ padding: 0.25, duration: 400 }));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onParamChange = useCallback(
    (key: string, value: string) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedId
            ? {
                ...n,
                data: {
                  ...n.data,
                  params: { ...n.data.params, [key]: value },
                },
              }
            : n
        )
      );
    },
    [selectedId, setNodes]
  );

  return (
    <div
      className="relative flex h-[min(78vh,820px)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#09090B]"
      style={{ backgroundColor: "#09090B" }}
    >
      <CanvasRunner
        runner={runner}
        debuggerOpen={debuggerOpen}
        onToggleDebugger={() => setDebuggerOpen((v) => !v)}
        onRunSimulation={runSimulation}
        onDeploy={deployWorkflow}
        onSave={saveBlueprint}
        busy={busy}
        paletteOpen={paletteOpen}
        onTogglePalette={() => setPaletteOpen((v) => !v)}
      />

      <div className="relative z-0 min-h-0 flex-1">
        <NodePalette
          open={paletteOpen}
          onApplyTemplate={applyTemplate}
          selectedParams={selectedNode?.data.params ?? null}
          onParamChange={onParamChange}
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onSelectionChange={({ nodes: selected }) => {
            setSelectedId(selected[0]?.id ?? null);
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          className="blueprint-flow"
          defaultEdgeOptions={{ type: "glowing" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.2}
            color="rgba(0, 102, 255,0.14)"
            bgColor="#09090B"
          />
          <Controls
            className="!overflow-hidden !rounded-lg !border !border-white/10 !bg-[#0c0c0f]/90 !shadow-none [&>button]:!border-white/10 [&>button]:!bg-transparent [&>button]:!fill-blue-400"
            showInteractive={false}
          />
          <MiniMap
            className="!overflow-hidden !rounded-lg !border !border-white/10 !bg-[#0c0c0f]/90"
            nodeColor={(n: Node) => {
              const kind = (n.data as BlueprintNodeData | undefined)?.kind;
              if (kind === "trigger") return "#22d3ee";
              if (kind === "action") return "#fbbf24";
              return "#3B82F6";
            }}
            maskColor="rgba(9,9,11,0.75)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function BlueprintCanvas() {
  return (
    <div className="space-y-4" style={{ backgroundColor: "#09090B" }}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400/80">
          Visual blueprint
        </p>
        <h2 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">
          Workflow Builder
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-muted">
          Drag trigger, agent, and action blocks onto an infinite canvas. Wire
          glowing SAPPHIRE cables, load presets, then simulate sequential
          execution.
        </p>
      </div>
      <ReactFlowProvider>
        <BlueprintCanvasInner />
      </ReactFlowProvider>
    </div>
  );
}
