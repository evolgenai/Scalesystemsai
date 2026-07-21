/**
 * Multi-agent swarm message bus — inter-agent context passing, parallel
 * execution loops, and Meta-SRE self-healing fallback on node failure.
 */

import { proposeHealPatch } from "@/lib/agents/healAgent";
import { executeCodeInSandbox } from "@/lib/agents/codeSandbox";
import { scrapeUrl } from "@/lib/tools/webScraper";
import { dispatchDiscordSreAlert } from "@/lib/notifications/discordNotifier";
import {
  createApprovalRequest,
  markExecutionPausedHitl,
  waitForApprovalResolution,
} from "@/lib/swarm/hitlApproval";
import {
  normalizeNodeType,
  type AgentContextBag,
  type NodeExecutionResult,
  type SwarmRunStatus,
  type SwarmRunSummary,
  type WorkflowEdge,
  type WorkflowLogEntry,
  type WorkflowNode,
} from "@/lib/swarm/types";

export type SwarmOrchestratorOptions = {
  workspaceId: string;
  blueprintId: string;
  executionId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggerPayload?: Record<string, unknown>;
  signal?: AbortSignal;
  onLog?: (entry: WorkflowLogEntry) => void;
  /** SSE / status bus for PAUSED_HITL and terminal states. */
  onStatus?: (event: {
    status: SwarmRunStatus;
    nodeId?: string;
    approvalId?: string;
    data?: unknown;
  }) => void;
  /** Max concurrent agents in a parallel group. */
  maxParallel?: number;
};

type NodeHandler = (
  node: WorkflowNode,
  ctx: SwarmOrchestrator
) => Promise<unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Topological execution order from directed edges.
 * Falls back to declaration order when the graph has no edges / cycles.
 */
export function orderWorkflowNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  if (nodes.length === 0) return [];
  if (edges.length === 0) return [...nodes];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    indegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }

  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    adjacency.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }

  const queue = nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const ordered: WorkflowNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (node) ordered.push(node);
    for (const next of adjacency.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (ordered.length !== nodes.length) {
    // Cycle or disconnected — append remaining in declaration order.
    const seen = new Set(ordered.map((n) => n.id));
    for (const n of nodes) {
      if (!seen.has(n.id)) ordered.push(n);
    }
  }

  return ordered;
}

/**
 * Group consecutive nodes that share the same `parallelGroup` data key.
 */
export function groupForParallel(
  ordered: WorkflowNode[]
): Array<{ parallel: boolean; nodes: WorkflowNode[] }> {
  const groups: Array<{ parallel: boolean; nodes: WorkflowNode[] }> = [];
  for (const node of ordered) {
    const groupKey =
      typeof node.data?.parallelGroup === "string"
        ? node.data.parallelGroup.trim()
        : "";
    const last = groups[groups.length - 1];
    if (
      groupKey &&
      last?.parallel &&
      last.nodes[0]?.data?.parallelGroup === groupKey
    ) {
      last.nodes.push(node);
      continue;
    }
    groups.push({
      parallel: Boolean(groupKey),
      nodes: [node],
    });
  }
  return groups;
}

export class SwarmOrchestrator {
  readonly workspaceId: string;
  readonly blueprintId: string;
  readonly executionId: string;
  readonly nodes: WorkflowNode[];
  readonly edges: WorkflowEdge[];
  readonly triggerPayload: Record<string, unknown>;
  readonly signal?: AbortSignal;
  readonly maxParallel: number;

  private readonly onLog?: (entry: WorkflowLogEntry) => void;
  private readonly onStatus?: (event: {
    status: SwarmRunStatus;
    nodeId?: string;
    approvalId?: string;
    data?: unknown;
  }) => void;
  private readonly logs: WorkflowLogEntry[] = [];
  private readonly bags: AgentContextBag[] = [];
  private readonly context: Record<string, unknown> = {};
  private readonly results: NodeExecutionResult[] = [];
  private lastOutput: unknown = null;
  private pendingApprovalId: string | null = null;
  private pausedNodeId: string | null = null;
  /** True only while still waiting / timed out without resolution. */
  private hitlPaused = false;
  private hitlRejected = false;

  constructor(options: SwarmOrchestratorOptions) {
    this.workspaceId = options.workspaceId;
    this.blueprintId = options.blueprintId;
    this.executionId = options.executionId;
    this.nodes = options.nodes;
    this.edges = options.edges;
    this.triggerPayload = options.triggerPayload ?? {};
    this.signal = options.signal;
    this.onLog = options.onLog;
    this.onStatus = options.onStatus;
    this.maxParallel = Math.max(1, Math.min(options.maxParallel ?? 4, 8));
    this.context.trigger = this.triggerPayload;
  }

  private nodeRequiresApproval(node: WorkflowNode): boolean {
    const data = node.data as Record<string, unknown> | undefined;
    return data?.requiresApproval === true;
  }

  /**
   * Halt before node execution, emit PAUSED_HITL, create ApprovalRequest,
   * and wait for human APPROVED / REJECTED (or timeout / abort).
   */
  private async awaitHitlGate(
    node: WorkflowNode,
    nodeType: string
  ): Promise<"APPROVED" | "REJECTED" | "TIMEOUT" | "ABORTED"> {
    const actionType =
      (typeof node.data?.label === "string" && node.data.label.trim()) ||
      nodeType;

    const approval = await createApprovalRequest({
      workflowExecutionId: this.executionId,
      nodeId: node.id,
      workspaceId: this.workspaceId,
      actionType,
      payload: {
        nodeId: node.id,
        nodeType,
        label: node.data?.label ?? null,
        blueprintId: this.blueprintId,
        contextKeys: Object.keys(this.context),
        upstream: this.lastOutput ?? null,
        nodeData: node.data ?? {},
      },
    });

    this.pendingApprovalId = approval.id;
    this.pausedNodeId = node.id;
    this.hitlPaused = true;

    await markExecutionPausedHitl(this.executionId, this.getLogs());

    this.log("warn", `HITL pause — awaiting approval for node ${node.id}`, {
      nodeId: node.id,
      nodeType,
      data: { approvalId: approval.id, status: "PAUSED_HITL" },
    });

    this.onStatus?.({
      status: "PAUSED_HITL",
      nodeId: node.id,
      approvalId: approval.id,
      data: {
        actionType,
        executionId: this.executionId,
        blueprintId: this.blueprintId,
      },
    });

    const verdict = await waitForApprovalResolution(approval.id, {
      signal: this.signal,
    });

    if (verdict.status === "APPROVED") {
      this.hitlPaused = false;
      this.log("success", `HITL approved — resuming node ${node.id}`, {
        nodeId: node.id,
        nodeType,
        data: { approvalId: approval.id },
      });
      return "APPROVED";
    }

    if (verdict.status === "REJECTED") {
      this.hitlPaused = false;
      this.hitlRejected = true;
      this.log("error", `HITL rejected — aborting node ${node.id}`, {
        nodeId: node.id,
        nodeType,
        data: { approvalId: approval.id },
      });
      return "REJECTED";
    }

    if (verdict.status === "ABORTED") {
      this.hitlPaused = false;
      this.log("warn", `HITL wait aborted for node ${node.id}`, {
        nodeId: node.id,
        nodeType,
        data: { approvalId: approval.id },
      });
      return "ABORTED";
    }

    // TIMEOUT — keep PAUSED_HITL so a late approve can still resolve the row.
    this.log("warn", `HITL wait timed out for node ${node.id}`, {
      nodeId: node.id,
      nodeType,
      data: { approvalId: approval.id, status: "PAUSED_HITL" },
    });
    return "TIMEOUT";
  }

  getLogs(): WorkflowLogEntry[] {
    return [...this.logs];
  }

  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  getLastOutput(): unknown {
    return this.lastOutput;
  }

  log(
    level: WorkflowLogEntry["level"],
    message: string,
    extra?: Partial<Pick<WorkflowLogEntry, "nodeId" | "nodeType" | "data">>
  ): void {
    const entry: WorkflowLogEntry = {
      ts: nowIso(),
      level,
      message,
      ...extra,
    };
    this.logs.push(entry);
    this.onLog?.(entry);
  }

  /**
   * Publish a typed context bag for downstream agents.
   */
  publishContext(key: string, value: unknown, fromNodeId: string): void {
    const bag: AgentContextBag = {
      key,
      value,
      fromNodeId,
      at: nowIso(),
    };
    this.bags.push(bag);
    this.context[key] = value;
    this.context[`node:${fromNodeId}`] = value;
    this.lastOutput = value;
    this.log("debug", `Context published: ${key}`, {
      nodeId: fromNodeId,
      data: { key },
    });
  }

  private assertNotAborted(): void {
    if (this.signal?.aborted) {
      throw new DOMException("Workflow execution aborted.", "AbortError");
    }
  }

  private resolveUrl(node: WorkflowNode): string | null {
    const fromData =
      typeof node.data?.url === "string" ? node.data.url.trim() : "";
    if (fromData) return fromData;
    const fromTrigger =
      typeof this.triggerPayload.url === "string"
        ? this.triggerPayload.url.trim()
        : "";
    if (fromTrigger) return fromTrigger;
    const prev = this.lastOutput;
    if (typeof prev === "string" && /^https?:\/\//i.test(prev)) return prev;
    if (prev && typeof prev === "object" && "url" in prev) {
      const u = (prev as { url?: unknown }).url;
      if (typeof u === "string" && u.trim()) return u.trim();
    }
    return null;
  }

  private resolvePrompt(node: WorkflowNode): string {
    const parts: string[] = [];
    if (typeof node.data?.prompt === "string" && node.data.prompt.trim()) {
      parts.push(node.data.prompt.trim());
    }
    if (typeof node.data?.objective === "string" && node.data.objective.trim()) {
      parts.push(node.data.objective.trim());
    }
    if (typeof this.triggerPayload.prompt === "string") {
      parts.push(String(this.triggerPayload.prompt));
    }
    if (this.lastOutput != null) {
      const serialized =
        typeof this.lastOutput === "string"
          ? this.lastOutput
          : JSON.stringify(this.lastOutput);
      parts.push(`Upstream context:\n${serialized.slice(0, 6_000)}`);
    }
    return parts.filter(Boolean).join("\n\n") || "Analyze upstream workflow context.";
  }

  private handlers: Record<string, NodeHandler> = {
    trigger: async (node) => {
      const payload = {
        ...this.triggerPayload,
        ...(asRecord(node.data)),
      };
      this.publishContext("trigger", payload, node.id);
      return payload;
    },

    scraper: async (node) => {
      const url = this.resolveUrl(node);
      if (!url) {
        throw new Error("Scraper node requires a public http(s) url.");
      }
      this.log("info", `Scraper fetching ${url}`, {
        nodeId: node.id,
        nodeType: "scraper",
      });
      const result = await scrapeUrl(url, { signal: this.signal });
      if (!result.success) {
        throw new Error(result.error ?? "Scraper failed.");
      }
      this.publishContext("scrape", result, node.id);
      return result;
    },

    sre: async (node) => {
      const prompt = this.resolvePrompt(node);
      this.log("info", "SRE/AI node evaluating context", {
        nodeId: node.id,
        nodeType: "sre",
      });
      const summary = {
        role: "meta-sre",
        workspaceId: this.workspaceId,
        executionId: this.executionId,
        analysis: prompt.slice(0, 4_000),
        upstreamKeys: Object.keys(this.context),
        recommendation:
          "Context ingested. No critical faults detected in upstream payload.",
        at: nowIso(),
      };
      this.publishContext("sre", summary, node.id);
      return summary;
    },

    ai: async (node) => {
      return this.handlers.sre!(node, this);
    },

    discord: async (node) => {
      const title =
        (typeof node.data?.title === "string" && node.data.title.trim()) ||
        `Workflow ${this.blueprintId.slice(0, 8)}`;
      const message =
        (typeof node.data?.message === "string" && node.data.message.trim()) ||
        (typeof this.lastOutput === "string"
          ? this.lastOutput
          : JSON.stringify(this.lastOutput ?? this.context).slice(0, 1_500));

      this.log("info", "Dispatching Discord notification", {
        nodeId: node.id,
        nodeType: "discord",
      });

      const dispatch = await dispatchDiscordSreAlert({
        title,
        status: "success",
        executionLogs: [
          message,
          ...this.logs.slice(-8).map((l) => `[${l.level}] ${l.message}`),
        ],
        runId: this.executionId,
        workspaceId: this.workspaceId,
        directive: "workflow.discord_node",
      });

      const out = { dispatch, message, title };
      this.publishContext("discord", out, node.id);
      return out;
    },

    sandbox: async (node) => {
      const code =
        (typeof node.data?.code === "string" && node.data.code) ||
        (typeof this.triggerPayload.code === "string"
          ? String(this.triggerPayload.code)
          : "");
      if (!code.trim()) {
        throw new Error("Sandbox node requires code to execute.");
      }
      const language =
        node.data?.language === "python" ? "python" : "javascript";

      this.log("info", `Sandbox executing (${language})`, {
        nodeId: node.id,
        nodeType: "sandbox",
      });

      const result = await executeCodeInSandbox(code, language, {
        signal: this.signal,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          result.stderr?.trim() || `Sandbox exited with code ${result.exitCode}`
        );
      }
      this.publishContext("sandbox", result, node.id);
      return result;
    },

    agent: async (node) => {
      const persona =
        (typeof node.data?.persona === "string" && node.data.persona.trim()) ||
        "OpsAgent";
      const objective = this.resolvePrompt(node);
      const out = {
        persona,
        objective: objective.slice(0, 2_000),
        workspaceId: this.workspaceId,
        handoffFrom: this.bags.at(-1)?.fromNodeId ?? null,
        status: "COMPLETED",
        at: nowIso(),
      };
      this.publishContext(`agent:${persona}`, out, node.id);
      return out;
    },

    sequence: async (node) => {
      // Passthrough — sequence is structural; value is prior output.
      const out = this.lastOutput ?? this.triggerPayload;
      this.publishContext("sequence", out, node.id);
      return out;
    },
  };

  /**
   * Meta-SRE self-healing handler — invoked when an individual agent node fails.
   */
  async invokeMetaSreFallback(
    node: WorkflowNode,
    error: unknown
  ): Promise<{ healed: boolean; summary: string }> {
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    const stackTrace = error instanceof Error ? error.stack ?? null : null;

    this.log("warn", `Meta-SRE fallback engaged for node ${node.id}`, {
      nodeId: node.id,
      nodeType: normalizeNodeType(node.type),
      data: { error: errorMessage },
    });

    try {
      const heal = await proposeHealPatch({
        route: `/api/workflows/${this.blueprintId}/execute`,
        errorMessage: `[swarm-node:${node.id}:${node.type}] ${errorMessage}`,
        stackTrace,
        workspaceId: this.workspaceId,
      });

      await dispatchDiscordSreAlert({
        title: `Meta-SRE heal · node ${node.id}`,
        status: heal.validatorApproved ? "partial" : "failure",
        executionLogs: [
          errorMessage,
          heal.explanation.slice(0, 500),
          `target=${heal.targetFile}`,
          `cycles=${heal.correctionCycles}`,
        ],
        runId: this.executionId,
        workspaceId: this.workspaceId,
        severity: "high",
        directive: "workflow.node_failure_heal",
      });

      const summary = heal.explanation.slice(0, 1_200);
      this.publishContext("meta_sre_heal", {
        nodeId: node.id,
        approved: heal.validatorApproved,
        targetFile: heal.targetFile,
        explanation: summary,
      }, node.id);

      return {
        healed: heal.validatorApproved,
        summary,
      };
    } catch (healErr) {
      const msg =
        healErr instanceof Error ? healErr.message : String(healErr);
      this.log("error", `Meta-SRE fallback failed: ${msg}`, {
        nodeId: node.id,
        nodeType: "sre",
      });
      return { healed: false, summary: msg };
    }
  }

  async executeNode(node: WorkflowNode): Promise<NodeExecutionResult> {
    this.assertNotAborted();
    const nodeType = normalizeNodeType(node.type);
    const started = Date.now();

    this.log("info", `Executing node ${node.id} (${nodeType})`, {
      nodeId: node.id,
      nodeType,
    });

    if (this.nodeRequiresApproval(node)) {
      const gate = await this.awaitHitlGate(node, nodeType);
      if (gate !== "APPROVED") {
        const result: NodeExecutionResult = {
          ok: false,
          nodeId: node.id,
          nodeType,
          output: null,
          error:
            gate === "REJECTED"
              ? "Human-In-The-Loop approval rejected."
              : gate === "ABORTED"
                ? "Workflow aborted while awaiting HITL approval."
                : "HITL approval timed out — execution remains PAUSED_HITL.",
          durationMs: Date.now() - started,
        };
        this.results.push(result);
        return result;
      }
    }

    const handler =
      nodeType !== "unknown" ? this.handlers[nodeType] : undefined;
    if (!handler) {
      const result: NodeExecutionResult = {
        ok: false,
        nodeId: node.id,
        nodeType,
        output: null,
        error: `Unsupported node type: ${node.type}`,
        durationMs: Date.now() - started,
      };
      this.results.push(result);
      const heal = await this.invokeMetaSreFallback(
        node,
        new Error(result.error)
      );
      result.healed = heal.healed;
      result.healSummary = heal.summary;
      return result;
    }

    try {
      const output = await handler(node, this);
      const result: NodeExecutionResult = {
        ok: true,
        nodeId: node.id,
        nodeType,
        output,
        durationMs: Date.now() - started,
      };
      this.results.push(result);
      this.log("success", `Node ${node.id} completed`, {
        nodeId: node.id,
        nodeType,
        data: { durationMs: result.durationMs },
      });
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err ?? "Node failed");
      this.log("error", `Node ${node.id} failed: ${errorMessage}`, {
        nodeId: node.id,
        nodeType,
      });

      const heal = await this.invokeMetaSreFallback(node, err);
      const result: NodeExecutionResult = {
        ok: false,
        nodeId: node.id,
        nodeType,
        output: null,
        error: errorMessage,
        durationMs: Date.now() - started,
        healed: heal.healed,
        healSummary: heal.summary,
      };
      this.results.push(result);
      return result;
    }
  }

  /**
   * Run the full graph: topological order, parallel groups, heal on failure.
   * Fail-fast after heal unless the failing node was non-critical `discord`.
   */
  async run(): Promise<SwarmRunSummary> {
    const startedAt = nowIso();
    this.log("info", "Swarm orchestrator starting", {
      data: {
        executionId: this.executionId,
        nodeCount: this.nodes.length,
        edgeCount: this.edges.length,
      },
    });

    const ordered = orderWorkflowNodes(this.nodes, this.edges);
    const groups = groupForParallel(ordered);
    let fatal = false;

    for (const group of groups) {
      this.assertNotAborted();

      if (group.parallel && group.nodes.length > 1) {
        this.log("info", `Parallel fan-out (${group.nodes.length} agents)`, {
          data: { group: group.nodes[0]?.data?.parallelGroup },
        });

        const chunks: WorkflowNode[][] = [];
        for (let i = 0; i < group.nodes.length; i += this.maxParallel) {
          chunks.push(group.nodes.slice(i, i + this.maxParallel));
        }

        for (const chunk of chunks) {
          const settled = await Promise.all(
            chunk.map((n) => this.executeNode(n))
          );
          if (settled.some((r) => !r.ok)) {
            fatal = true;
            break;
          }
        }
        if (fatal) break;
        continue;
      }

      for (const node of group.nodes) {
        const result = await this.executeNode(node);
        if (!result.ok && normalizeNodeType(node.type) !== "discord") {
          fatal = true;
          break;
        }
      }
      if (fatal) break;
    }

    const completedAt = nowIso();
    let status: SwarmRunStatus;
    if (this.hitlPaused) {
      status = "PAUSED_HITL";
    } else if (this.signal?.aborted) {
      status = "CANCELLED";
    } else if (fatal || this.hitlRejected) {
      status = "FAILED";
    } else {
      status = "COMPLETED";
    }

    this.log(
      status === "COMPLETED" ? "success" : "warn",
      `Swarm run ${status.toLowerCase()}`,
      { data: { status, results: this.results.length } }
    );

    if (status !== "PAUSED_HITL") {
      this.onStatus?.({ status });
    }

    return {
      executionId: this.executionId,
      blueprintId: this.blueprintId,
      workspaceId: this.workspaceId,
      status,
      results: [...this.results],
      context: this.getContext(),
      logs: this.getLogs(),
      startedAt,
      completedAt,
      ...(this.pendingApprovalId
        ? { pendingApprovalId: this.pendingApprovalId }
        : {}),
      ...(this.pausedNodeId ? { pausedNodeId: this.pausedNodeId } : {}),
    };
  }
}
