/**
 * Spatial NL command parser — natural language → coordinates + node ID.
 * Accepts `command` (Sprint 51) or `query` (HUD voice stubs).
 */

import { z } from "zod";
import {
  DEFAULT_WORLD_SEED as IMPORTED_WORLD_SEED,
  generateWorldObjectsMatrix,
  type SpatialRegistryNode,
} from "@/lib/spatial/worldObjects";

/** Compile-safe fallback if the worldObjects export is missing at bundling time. */
const DEFAULT_WORLD_SEED =
  IMPORTED_WORLD_SEED || "scale-systems-seed-v1";

export const SpatialWaypointSchema = z.object({
  x: z.number(),
  y: z.number().default(0),
  z: z.number(),
});
export type SpatialWaypoint = z.infer<typeof SpatialWaypointSchema>;

export const KnownSpatialNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  aliases: z.array(z.string()),
  position: z.tuple([z.number(), z.number(), z.number()]),
  dialogKind: z.string().optional(),
});
export type KnownSpatialNode = z.infer<typeof KnownSpatialNodeSchema>;

/** Anchor nodes matching InstancedHardwareGrid / Tor / CyberRover spawn. */
export const KNOWN_SPATIAL_NODES: KnownSpatialNode[] = [
  {
    id: "meta-sre-core",
    label: "Meta-SRE Memory Core",
    aliases: ["meta-sre", "metasre", "memory core", "memory hud", "sre core", "autofix"],
    position: [-10.2, 0, 9.8],
    dialogKind: "meta_sre_autofix",
  },
  {
    id: "sentry-log-ws",
    label: "Sentry Log Workstation",
    aliases: [
      "sentry",
      "sentry log",
      "sentry terminal",
      "sentry errors",
      "workstation",
      "error logs",
    ],
    position: [18.5, 0, -4.2],
    dialogKind: "sentry_terminal",
  },
  {
    id: "sandbox-executor-hub",
    label: "Sandbox Executor Hub",
    aliases: ["sandbox", "executor", "sandbox executor", "verify"],
    position: [8.5, 0, -8.2],
    dialogKind: "sandbox_executor_node",
  },
  {
    id: "db-shard-monitor",
    label: "Database Shard Monitor",
    aliases: [
      "database",
      "db",
      "db shard",
      "shard monitor",
      "database auditor",
      "pool",
      "postgres",
    ],
    position: [-8.5, 0, -12.4],
    dialogKind: "db_shard_monitor",
  },
  {
    id: "ip-network-diag",
    label: "IP Network Diagnostic Node",
    aliases: ["ip", "diagnostic", "network diag", "ip diagnostic", "network"],
    position: [-19.2, 0, 5.4],
    dialogKind: "network_diagnostic",
  },
  {
    id: "tor-onion",
    label: "Tor Onion Node",
    aliases: ["tor", "onion", "proxy", "tor node", "onion router"],
    position: [6.5, 0, 10.5],
    dialogKind: "tor_node",
  },
  {
    id: "cyber-rover",
    label: "CyberRover",
    aliases: ["rover", "cyberrover", "cyber rover", "vehicle", "car", "automobile"],
    position: [-13.5, 0, 11.5],
    dialogKind: "cyber_rover",
  },
  {
    id: "spawn",
    label: "Avatar Spawn",
    aliases: ["spawn", "home", "origin", "start"],
    position: [0, 0, 8],
  },
];

export const CommandParserRequestSchema = z
  .object({
    command: z.string().trim().min(1).max(500).optional(),
    query: z.string().trim().min(1).max(500).optional(),
    sessionId: z.string().trim().min(1).max(128).optional(),
    seed: z.string().trim().min(1).max(128).optional(),
    count: z.number().int().min(100).max(512).optional(),
    from: SpatialWaypointSchema.optional(),
  })
  .refine((v) => Boolean(v.command?.trim() || v.query?.trim()), {
    message: "command or query is required",
  });
export type CommandParserRequest = z.infer<typeof CommandParserRequestSchema>;

export type ParsedSpatialCommand = {
  intent:
    | "navigate"
    | "inspect"
    | "mount"
    | "unlock"
    | "interact"
    | "unknown";
  confidence: number;
  command: string;
  query: string;
  normalized: string;
  /** Pathfinder destination [X, Y, Z]. */
  coordinates: [number, number, number];
  targetNodeId: string | null;
  targetNodeType: string | null;
  targetTitle: string | null;
  requiresPin: boolean;
  actionHint: string | null;
  matchedKeywords: string[];
  /** HUD voice-compat fields */
  target: SpatialWaypoint | null;
  node: KnownSpatialNode | null;
  path: SpatialWaypoint[];
  utterance: string;
  alternatives: Array<{
    nodeId: string;
    type: string;
    title: string;
    coordinates: [number, number, number];
    score: number;
  }>;
};

const COORD_RE =
  /(?:goto|go\s*to|navigate(?:\s+to)?|move\s+to|fly\s+to)?\s*[\[(]?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]+(-?\d+(?:\.\d+)?)(?:\s*[,;\s]+(-?\d+(?:\.\d+)?))?\s*[\])]?/i;

function clampWorld(n: number) {
  return Math.max(-95, Math.min(95, n));
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildGridPath(
  from: SpatialWaypoint,
  to: SpatialWaypoint,
  cell = 4
): SpatialWaypoint[] {
  const chain: SpatialWaypoint[] = [];
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(dist / cell));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const zig = i > 0 && i < steps && i % 2 === 0 ? cell * 0.15 : 0;
    const nx = -(to.z - from.z) / (dist || 1);
    const nz = (to.x - from.x) / (dist || 1);
    chain.push({
      x: clampWorld(from.x + (to.x - from.x) * t + nx * zig),
      y: 0,
      z: clampWorld(from.z + (to.z - from.z) * t + nz * zig),
    });
  }
  if (chain.length) {
    chain[chain.length - 1] = {
      x: clampWorld(to.x),
      y: to.y ?? 0,
      z: clampWorld(to.z),
    };
  } else {
    chain.push({ x: clampWorld(to.x), y: to.y ?? 0, z: clampWorld(to.z) });
  }
  return chain;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Loose case-insensitive alias match (word-ish / hyphen-tolerant). */
function aliasMatches(haystack: string, alias: string): boolean {
  const a = alias.toLowerCase().trim();
  if (!a) return false;
  const h = haystack.toLowerCase();
  if (h.includes(a)) return true;
  // Treat hyphens/spaces interchangeably: "meta sre" ↔ "meta-sre"
  const flexible = escapeRegExp(a).replace(/[\s_-]+/g, "[\\s_-]*");
  try {
    return new RegExp(`(?:^|[^a-z0-9])${flexible}(?:[^a-z0-9]|$)`, "i").test(
      h
    );
  } catch {
    return false;
  }
}

function matchKnownNode(q: string): KnownSpatialNode | null {
  const lower = q.toLowerCase();
  let best: KnownSpatialNode | null = null;
  let bestScore = 0;
  for (const node of KNOWN_SPATIAL_NODES) {
    for (const alias of [node.label.toLowerCase(), ...node.aliases, node.id]) {
      if (aliasMatches(lower, alias)) {
        const score = alias.length;
        if (score > bestScore) {
          bestScore = score;
          best = node;
        }
      }
    }
  }
  return best;
}

function detectIntent(
  normalized: string
): ParsedSpatialCommand["intent"] {
  if (/\b(mount|drive|board|ride|rover|automobile|vehicle)\b/.test(normalized)) {
    return "mount";
  }
  if (/\b(unlock|pin|vault)\b/.test(normalized)) return "unlock";
  if (
    /\b(inspect|show|check|view|diagnose|sentry\s+errors?|error\s+logs?)\b/.test(
      normalized
    )
  ) {
    return "inspect";
  }
  if (
    /\b(take me|go to|navigate|move to|warp|path to|bring me|tor)\b/.test(
      normalized
    )
  ) {
    return "navigate";
  }
  if (/\b(use|interact|activate|trigger)\b/.test(normalized)) return "interact";
  return "unknown";
}

function enrichFromWorldMatrix(
  seed: string | undefined,
  known: KnownSpatialNode
): { nodeId: string; type: string; title: string; requiresPin: boolean } {
  try {
    const matrix = generateWorldObjectsMatrix({
      seed: seed ?? DEFAULT_WORLD_SEED,
    });
    const type = known.dialogKind;
    if (type && matrix.requiredNodeIds[type]) {
      const id = matrix.requiredNodeIds[type]!;
      const obj = matrix.objects.find((n: SpatialRegistryNode) => n.id === id);
      if (obj) {
        return {
          nodeId: obj.id,
          type: obj.type,
          title: obj.title,
          requiresPin: obj.requires_pin,
        };
      }
    }
  } catch {
    // Fall through to known anchors.
  }
  return {
    nodeId: known.id,
    type: known.dialogKind ?? known.id,
    title: known.label,
    requiresPin:
      known.dialogKind === "sentry_terminal" ||
      known.dialogKind === "meta_sre_autofix" ||
      known.dialogKind === "quantum_vault",
  };
}

export function parseSpatialCommand(
  input: CommandParserRequest | { command?: string; query?: string; seed?: string; from?: SpatialWaypoint }
): ParsedSpatialCommand {
  try {
    return parseSpatialCommandInner(input);
  } catch {
    const rawText = (input.command ?? input.query ?? "").trim();
    const normalized = normalize(rawText);
    // Graceful fallback: never throw — try loose node name match only.
    const known = matchKnownNode(rawText) ?? matchKnownNode(normalized);
    if (known) {
      const approach: SpatialWaypoint = {
        x: clampWorld(known.position[0]),
        y: 0,
        z: clampWorld(known.position[2]),
      };
      return {
        intent: "navigate",
        confidence: 0.55,
        command: rawText,
        query: rawText,
        normalized,
        coordinates: [approach.x, approach.y, approach.z],
        targetNodeId: known.id,
        targetNodeType: known.dialogKind ?? known.id,
        targetTitle: known.label,
        requiresPin: false,
        actionHint: "navigate",
        matchedKeywords: known.aliases.filter((a) =>
          aliasMatches(normalized, a)
        ),
        target: approach,
        node: known,
        path: buildGridPath(input.from ?? { x: 0, y: 0, z: 8 }, approach),
        utterance: `Pathfinding to ${known.label}`,
        alternatives: [],
      };
    }
    return {
      intent: "unknown",
      confidence: 0,
      command: rawText,
      query: rawText,
      normalized,
      coordinates: [0, 0, 0],
      targetNodeId: null,
      targetNodeType: null,
      targetTitle: null,
      requiresPin: false,
      actionHint: null,
      matchedKeywords: [],
      target: null,
      node: null,
      path: [],
      utterance:
        'Try “go to sentry”, “meta-sre”, “sandbox”, or “database”.',
      alternatives: [],
    };
  }
}

function parseSpatialCommandInner(
  input: CommandParserRequest | { command?: string; query?: string; seed?: string; from?: SpatialWaypoint }
): ParsedSpatialCommand {
  const rawText = (input.command ?? input.query ?? "").trim();
  const query = rawText;
  const normalized = normalize(query);
  const from = input.from ?? { x: 0, y: 0, z: 8 };
  let intent = detectIntent(normalized);

  const coord = query.match(COORD_RE);
  if (coord) {
    const a = Number(coord[1]);
    const b = Number(coord[2]);
    const c = coord[3] != null ? Number(coord[3]) : undefined;
    const target: SpatialWaypoint =
      c != null
        ? { x: clampWorld(a), y: b, z: clampWorld(c) }
        : { x: clampWorld(a), y: 0, z: clampWorld(b) };
    const path = buildGridPath(from, target);
    return {
      intent: "navigate",
      confidence: 0.92,
      command: query,
      query,
      normalized,
      coordinates: [target.x, target.y ?? 0, target.z],
      targetNodeId: null,
      targetNodeType: null,
      targetTitle: null,
      requiresPin: false,
      actionHint: null,
      matchedKeywords: ["coordinates"],
      target,
      node: null,
      path,
      utterance: `Navigating to [${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}]`,
      alternatives: [],
    };
  }

  const known = matchKnownNode(query) ?? matchKnownNode(normalized);
  if (known) {
    if (intent === "unknown") {
      intent =
        known.dialogKind === "cyber_rover"
          ? "mount"
          : known.dialogKind === "sentry_terminal" ||
              known.dialogKind === "meta_sre_autofix"
            ? "inspect"
            : "navigate";
    }
    // Explicit go-to / navigate phrasing always pathfinds.
    if (
      /\b(go\s*to|goto|take\s+me|navigate|move\s+to|warp|path\s+to|bring\s+me)\b/i.test(
        normalized
      )
    ) {
      intent = "navigate";
    }

    const enriched = enrichFromWorldMatrix(
      "seed" in input ? input.seed : undefined,
      known
    );
    const approach: SpatialWaypoint = {
      x: clampWorld(known.position[0] + (known.position[0] >= 0 ? -2.2 : 2.2)),
      y: 0,
      z: clampWorld(known.position[2] + (known.position[2] >= 0 ? -1.5 : 1.5)),
    };
    const path = buildGridPath(from, approach);

    return {
      intent,
      confidence: 0.9,
      command: query,
      query,
      normalized,
      coordinates: [approach.x, approach.y, approach.z],
      targetNodeId: enriched.nodeId,
      targetNodeType: enriched.type,
      targetTitle: enriched.title,
      requiresPin: enriched.requiresPin,
      actionHint: intent,
      matchedKeywords: known.aliases.filter((a) =>
        aliasMatches(normalized, a)
      ),
      target: approach,
      node: known,
      path,
      utterance: `Pathfinding to ${known.label}`,
      alternatives: [
        {
          nodeId: enriched.nodeId,
          type: enriched.type,
          title: enriched.title,
          coordinates: [
            known.position[0],
            known.position[1],
            known.position[2],
          ],
          score: 10,
        },
      ],
    };
  }

  return {
    intent: "unknown",
    confidence: 0.1,
    command: query,
    query,
    normalized,
    coordinates: [0, 0, 0],
    targetNodeId: null,
    targetNodeType: null,
    targetTitle: null,
    requiresPin: false,
    actionHint: null,
    matchedKeywords: [],
    target: null,
    node: null,
    path: [],
    utterance:
      'Try “go to sentry”, “meta-sre”, “sandbox”, or “database”.',
    alternatives: [],
  };
}
