/**
 * Spatial HUD memory feed — top recent execution steps, auto-patches,
 * and Sentry resolutions, with node_type filters for terminal overlays.
 */

import { z } from "zod";
import {
  recallAgentMemory,
  storeAgentMemory,
  type AgentMemoryEntry,
  type MemoryKind,
} from "@/lib/agents/agentMemoryStore";

export const SpatialNodeTypeSchema = z.enum([
  "meta_sre_autofix",
  "sentry_terminal",
  "quantum_vault",
  "tor_node",
  "network_diagnostic",
  "cyber_rover",
  "db_shard_monitor",
  "sse_stream_analyzer",
  "mcp_registry_hub",
  "sandbox_executor_node",
  "generic",
]);
export type SpatialNodeType = z.infer<typeof SpatialNodeTypeSchema>;

export const FEED_KINDS: readonly MemoryKind[] = [
  "execution_step",
  "auto_patch",
  "sentry_resolution",
] as const;

export const DEFAULT_FEED_LIMIT = 10 as const;

const DEMO_SESSION = "spatial-demo-meta-sre";

type NodeFilter = {
  kinds: MemoryKind[];
  tags: string[];
  q?: string;
};

const NODE_FILTERS: Record<SpatialNodeType, NodeFilter> = {
  meta_sre_autofix: {
    kinds: ["auto_patch", "execution_step"],
    tags: ["meta-sre", "autofix", "meta_sre_autofix", "patch", "sre", "heal"],
    q: "patch",
  },
  sentry_terminal: {
    kinds: ["sentry_resolution", "execution_step"],
    tags: ["sentry", "sentry_terminal", "resolved", "pin"],
    q: "sentry",
  },
  quantum_vault: {
    kinds: ["auto_patch", "execution_step", "general"],
    tags: ["vault", "quantum_vault", "secrets"],
  },
  tor_node: {
    kinds: ["execution_step", "general"],
    tags: ["tor", "tor_node", "proxy"],
  },
  network_diagnostic: {
    kinds: ["execution_step", "general"],
    tags: ["network", "network_diagnostic", "latency"],
  },
  cyber_rover: {
    kinds: ["execution_step", "general"],
    tags: ["vehicle", "cyber_rover", "rover"],
  },
  db_shard_monitor: {
    kinds: ["execution_step", "auto_patch", "sentry_resolution"],
    tags: ["db", "pool", "db_shard_monitor", "prisma"],
  },
  sse_stream_analyzer: {
    kinds: ["execution_step", "auto_patch", "sentry_resolution"],
    tags: ["sse", "stream", "sse_stream_analyzer"],
  },
  mcp_registry_hub: {
    kinds: ["execution_step", "general"],
    tags: ["mcp", "mcp_registry_hub"],
  },
  sandbox_executor_node: {
    kinds: ["execution_step", "auto_patch"],
    tags: ["sandbox", "sandbox_executor_node"],
  },
  generic: {
    kinds: [...FEED_KINDS],
    tags: [],
  },
};

async function ensureDemoMemories(): Promise<void> {
  const existing = await recallAgentMemory({
    sessionId: DEMO_SESSION,
    agentId: "meta-sre",
    limit: 3,
  });
  if (existing.entries.length > 0) return;

  const seeds: Array<{
    kind: MemoryKind;
    title: string;
    summary: string;
    tags: string[];
    payload: Record<string, unknown>;
    sentryIssueId?: string;
  }> = [
    {
      kind: "auto_patch",
      title: "Auto-patch · WebGLErrorBoundary wrap",
      summary:
        "Meta-SRE applied safe wrap around SpatialUniverse Canvas after context-loss fingerprint SS-4790.",
      tags: ["patch", "webgl", "spatial", "meta-sre", "autofix"],
      payload: {
        targetFile: "src/components/spatial/SpatialUniverse.tsx",
        files: ["src/components/spatial/SpatialUniverse.tsx"],
        diffLines: 24,
        status: "merged_sandbox",
        patch: "// WebGLErrorBoundary wrap applied",
      },
    },
    {
      kind: "sentry_resolution",
      title: "Resolved · agent.stream.timeout",
      summary:
        "SSE stall on /api/agents/stream — reconnect resiliency + Last-Event-Id resume closed SS-4821.",
      tags: ["sentry", "sse", "resolved", "sentry_terminal"],
      sentryIssueId: "SS-4821",
      payload: {
        level: "error",
        resolution: "resiliency.ts enqueue + client resume",
      },
    },
    {
      kind: "execution_step",
      title: "Heal loop · step 3/5",
      summary:
        "Diagnose → AST target → sandbox verify → PR draft. Heal budget 4/5 remaining.",
      tags: ["sre", "heal", "step", "meta-sre", "meta_sre_autofix"],
      payload: { phase: "sandbox_verify", p95Ms: 38, errRate: 0.02 },
    },
    {
      kind: "execution_step",
      title: "PIN unlock · sentry-log-ws",
      summary:
        "Superadmin PIN verified · live Sentry telemetry window opened for spatial HUD.",
      tags: ["pin", "spatial", "unlock", "sentry_terminal"],
      payload: { nodeId: "sentry-log-ws", lane: "superadmin" },
    },
    {
      kind: "auto_patch",
      title: "Auto-patch · pool monitor soft-fail",
      summary:
        "Prisma pool failures report to Sentry without killing the process — circuit stays open.",
      tags: ["patch", "db", "pool", "meta-sre", "autofix"],
      payload: {
        targetFile: "src/lib/db/poolMonitor.ts",
        module: "poolMonitor.ts",
        status: "deployed",
        patch: "circuit soft-fail + Sentry capture",
      },
      sentryIssueId: "ISSUE-50",
    },
    {
      kind: "sentry_resolution",
      title: "Resolved · webgl.context.lost",
      summary:
        "ContactShadows + dpr clamp + WebGLErrorBoundary retry path closed SS-4790.",
      tags: ["sentry", "webgl", "resolved", "sentry_terminal"],
      sentryIssueId: "SS-4790",
      payload: { level: "warning", resolution: "boundary + dpr[1,1.5]" },
    },
  ];

  for (const seed of seeds) {
    await storeAgentMemory({
      kind: seed.kind,
      sessionId: DEMO_SESSION,
      agentId: "meta-sre",
      title: seed.title,
      summary: seed.summary,
      tags: seed.tags,
      payload: seed.payload,
      sentryIssueId: seed.sentryIssueId ?? null,
      source: "system",
    });
  }
}

export type SpatialMemoryFeed = {
  nodeType: SpatialNodeType | null;
  limit: number;
  fetchedAt: string;
  counts: Record<MemoryKind, number>;
  items: AgentMemoryEntry[];
  /** @deprecated Prefer `items` — kept for Agent B HUD stubs. */
  traces: AgentMemoryEntry[];
  byKind: {
    execution_step: AgentMemoryEntry[];
    auto_patch: AgentMemoryEntry[];
    sentry_resolution: AgentMemoryEntry[];
  };
  source: "ring" | "mixed" | "db" | "demo";
  hud: {
    headline: string;
    subtitle: string;
    pinRequiredHint: boolean;
  };
};

function partitionByKind(entries: AgentMemoryEntry[]) {
  const byKind = {
    execution_step: [] as AgentMemoryEntry[],
    auto_patch: [] as AgentMemoryEntry[],
    sentry_resolution: [] as AgentMemoryEntry[],
  };
  for (const e of entries) {
    if (e.kind === "execution_step") byKind.execution_step.push(e);
    else if (e.kind === "auto_patch") byKind.auto_patch.push(e);
    else if (e.kind === "sentry_resolution") byKind.sentry_resolution.push(e);
  }
  return byKind;
}

export type BuildSpatialMemoryFeedOptions = {
  nodeType?: string | null;
  /** Alias used by some HUD clients. */
  nodeId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  limit?: number;
};

/**
 * Top-N spatial HUD memory feed. Supports `node_type` filters such as
 * `meta_sre_autofix` and `sentry_terminal`.
 */
export async function buildSpatialMemoryFeed(
  options: BuildSpatialMemoryFeedOptions = {}
): Promise<SpatialMemoryFeed> {
  await ensureDemoMemories();

  const limit = Math.min(
    30,
    Math.max(1, options.limit ?? DEFAULT_FEED_LIMIT)
  );
  const rawNode =
    options.nodeType?.trim().toLowerCase() ||
    options.nodeId?.trim().toLowerCase() ||
    null;
  const parsedNode = rawNode
    ? SpatialNodeTypeSchema.safeParse(rawNode)
    : null;
  const nodeType: SpatialNodeType | null = parsedNode?.success
    ? parsedNode.data
    : rawNode
      ? "generic"
      : null;

  const filter = nodeType ? NODE_FILTERS[nodeType] : NODE_FILTERS.generic;

  const primary = await recallAgentMemory({
    userId: options.userId,
    workspaceId: options.workspaceId,
    sessionId: options.sessionId ?? undefined,
    kinds: filter.kinds,
    limit: limit * 2,
  });

  let entries = primary.entries;
  let source: SpatialMemoryFeed["source"] = primary.source;

  if (nodeType && nodeType !== "generic") {
    const tagged = await recallAgentMemory({
      userId: options.userId,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId ?? undefined,
      kinds: filter.kinds,
      tags: filter.tags.length ? filter.tags : undefined,
      q: filter.q,
      limit,
    });
    if (tagged.entries.length > 0) {
      entries = tagged.entries;
      source = tagged.source;
    }
  }

  if (entries.length === 0) {
    const demo = await recallAgentMemory({
      sessionId: DEMO_SESSION,
      agentId: "meta-sre",
      kinds: filter.kinds,
      tags: filter.tags.length ? filter.tags : undefined,
      limit,
    });
    entries = demo.entries.length
      ? demo.entries
      : (
          await recallAgentMemory({
            sessionId: DEMO_SESSION,
            agentId: "meta-sre",
            limit,
          })
        ).entries;
    source = "demo";
  }

  entries = entries.slice(0, limit);
  const byKind = partitionByKind(entries);
  const counts = {
    execution_step: byKind.execution_step.length,
    auto_patch: byKind.auto_patch.length,
    sentry_resolution: byKind.sentry_resolution.length,
    general: entries.filter((e) => e.kind === "general").length,
  } satisfies Record<MemoryKind, number>;

  const pinRequiredHint =
    nodeType === "meta_sre_autofix" ||
    nodeType === "sentry_terminal" ||
    nodeType === "quantum_vault";

  return {
    nodeType,
    limit,
    fetchedAt: new Date().toISOString(),
    counts,
    items: entries,
    traces: entries,
    byKind: {
      execution_step: byKind.execution_step,
      auto_patch: byKind.auto_patch,
      sentry_resolution: byKind.sentry_resolution,
    },
    source,
    hud: {
      headline: nodeType
        ? `Memory · ${nodeType}`
        : "Swarm Memory Diagnostics",
      subtitle: `${entries.length} recent diagnostic memories`,
      pinRequiredHint,
    },
  };
}

/** Back-compat alias for earlier HUD stubs. */
export async function getSpatialMemoryFeed(options?: {
  sessionId?: string;
  nodeId?: string;
  limit?: number;
}): Promise<SpatialMemoryFeed> {
  return buildSpatialMemoryFeed({
    sessionId: options?.sessionId,
    nodeId: options?.nodeId,
    nodeType: options?.nodeId,
    limit: options?.limit ?? DEFAULT_FEED_LIMIT,
  });
}
