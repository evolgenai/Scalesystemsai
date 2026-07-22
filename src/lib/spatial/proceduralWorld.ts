/**
 * Deterministic Spatial Universe procedural scatter — 100+ IT hardware nodes
 * across a 500×500 grid with access levels and live telemetry metrics.
 */

import { z } from "zod";

export const GRID_SIZE = 500 as const;
export const DEFAULT_NODE_COUNT = 128 as const;
export const MIN_NODE_COUNT = 100 as const;
export const MAX_NODE_COUNT = 512 as const;
export const DEFAULT_WORLD_SEED = "scale-systems-spatial-v48" as const;

export const SpatialAccessLevelSchema = z.enum([
  "Public",
  "Admin",
  "Superadmin",
]);
export type SpatialAccessLevel = z.infer<typeof SpatialAccessLevelSchema>;

export const SpatialObjectTypeSchema = z.enum([
  "server_rack",
  "cyber_console",
  "diagnostic_router",
  "terminal",
  "sentry_error_workstation",
  "network_diagnostic_ip",
  "database_shard_monitor",
  "vehicle_spawn_anchor",
]);
export type SpatialObjectType = z.infer<typeof SpatialObjectTypeSchema>;

/** Special classifications that Agent B / interact flows treat specially. */
export const SPECIAL_NODE_TYPES = [
  "sentry_error_workstation",
  "network_diagnostic_ip",
  "database_shard_monitor",
  "vehicle_spawn_anchor",
] as const satisfies readonly SpatialObjectType[];

export type SpecialNodeType = (typeof SPECIAL_NODE_TYPES)[number];

export const NodeTelemetrySchema = z.object({
  cpuLoad: z.number().min(0).max(1),
  memoryLoad: z.number().min(0).max(1),
  latencyMs: z.number().min(0),
  errorRate: z.number().min(0).max(1),
  packetLoss: z.number().min(0).max(1),
  throughputMbps: z.number().min(0),
  uptimeSec: z.number().int().min(0),
  lastHeartbeatAt: z.string().datetime(),
});
export type NodeTelemetry = z.infer<typeof NodeTelemetrySchema>;

export const ProceduralNodeSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0),
  objectType: SpatialObjectTypeSchema,
  classification: z.enum(["standard", "special"]),
  accessLevel: SpatialAccessLevelSchema,
  requiresPin: z.boolean(),
  coordinates: z.object({
    x: z.number(),
    z: z.number(),
    y: z.number(),
  }),
  rotationY: z.number(),
  scale: z.number().positive(),
  label: z.string().min(1),
  ipHint: z.string().nullable(),
  telemetry: NodeTelemetrySchema,
});
export type ProceduralNode = z.infer<typeof ProceduralNodeSchema>;

export const ProceduralWorldMetaSchema = z.object({
  seed: z.string(),
  gridSize: z.literal(GRID_SIZE),
  nodeCount: z.number().int(),
  generatedAt: z.string().datetime(),
  specialCounts: z.record(z.string(), z.number().int()),
  accessCounts: z.record(SpatialAccessLevelSchema, z.number().int()),
});
export type ProceduralWorldMeta = z.infer<typeof ProceduralWorldMetaSchema>;

export const ProceduralWorldSchema = z.object({
  meta: ProceduralWorldMetaSchema,
  nodes: z.array(ProceduralNodeSchema).min(MIN_NODE_COUNT),
  vehicleSpawnAnchors: z.array(z.string()),
});
export type ProceduralWorld = z.infer<typeof ProceduralWorldSchema>;

const HARDWARE_TYPES: readonly SpatialObjectType[] = [
  "server_rack",
  "cyber_console",
  "diagnostic_router",
  "terminal",
];

const ACCESS_WEIGHTS: readonly {
  level: SpatialAccessLevel;
  weight: number;
}[] = [
  { level: "Public", weight: 62 },
  { level: "Admin", weight: 28 },
  { level: "Superadmin", weight: 10 },
];

const LABEL_PREFIX: Record<SpatialObjectType, string> = {
  server_rack: "Rack",
  cyber_console: "Console",
  diagnostic_router: "Router",
  terminal: "Term",
  sentry_error_workstation: "Sentry WS",
  network_diagnostic_ip: "NetDiag",
  database_shard_monitor: "ShardMon",
  vehicle_spawn_anchor: "Vehicle Pad",
};

/** Mulberry32 — fast deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of an arbitrary seed string. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickWeightedAccess(rand: () => number): SpatialAccessLevel {
  const total = ACCESS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = rand() * total;
  for (const entry of ACCESS_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.level;
  }
  return "Public";
}

function accessForSpecial(
  type: SpecialNodeType,
  rand: () => number
): SpatialAccessLevel {
  switch (type) {
    case "sentry_error_workstation":
      return rand() < 0.55 ? "Admin" : "Superadmin";
    case "network_diagnostic_ip":
      return rand() < 0.7 ? "Admin" : "Public";
    case "database_shard_monitor":
      return rand() < 0.45 ? "Superadmin" : "Admin";
    case "vehicle_spawn_anchor":
      return "Public";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function formatIp(rand: () => number): string {
  const a = 10;
  const b = Math.floor(rand() * 256);
  const c = Math.floor(rand() * 256);
  const d = 2 + Math.floor(rand() * 252);
  return `${a}.${b}.${c}.${d}`;
}

function buildTelemetry(rand: () => number, nowIso: string): NodeTelemetry {
  const cpuLoad = Number((0.08 + rand() * 0.86).toFixed(3));
  const memoryLoad = Number((0.12 + rand() * 0.78).toFixed(3));
  const latencyMs = Number((2 + rand() * 120).toFixed(2));
  const errorRate = Number((rand() * 0.08).toFixed(4));
  const packetLoss = Number((rand() * 0.03).toFixed(4));
  const throughputMbps = Number((8 + rand() * 920).toFixed(1));
  const uptimeSec = Math.floor(3_600 + rand() * 2_592_000);
  return {
    cpuLoad,
    memoryLoad,
    latencyMs,
    errorRate,
    packetLoss,
    throughputMbps,
    uptimeSec,
    lastHeartbeatAt: nowIso,
  };
}

/**
 * Reserve deterministic slots for special classifications so every world
 * always includes Sentry / NetDiag / Shard / Vehicle anchors.
 */
function specialSlotPlan(
  count: number
): Array<SpatialObjectType | null> {
  const slots: Array<SpatialObjectType | null> = Array.from(
    { length: count },
    () => null
  );

  const plan: Array<{ type: SpecialNodeType; min: number; ratio: number }> = [
    { type: "sentry_error_workstation", min: 4, ratio: 0.05 },
    { type: "network_diagnostic_ip", min: 6, ratio: 0.06 },
    { type: "database_shard_monitor", min: 4, ratio: 0.04 },
    { type: "vehicle_spawn_anchor", min: 3, ratio: 0.03 },
  ];

  let strideOffset = 0;
  for (const entry of plan) {
    const n = Math.max(entry.min, Math.floor(count * entry.ratio));
    const stride = Math.max(1, Math.floor(count / n));
    for (let i = 0; i < n; i++) {
      let target = (strideOffset + i * stride) % count;
      let guard = 0;
      while (slots[target] !== null && guard < count) {
        target = (target + 1) % count;
        guard++;
      }
      if (slots[target] === null) {
        slots[target] = entry.type;
      }
    }
    strideOffset += 3;
  }

  return slots;
}

function jitterCoord(rand: () => number, cell: number, cells: number): number {
  const cellSize = GRID_SIZE / cells;
  const origin = -GRID_SIZE / 2;
  const base = origin + (cell + 0.5) * cellSize;
  const jitter = (rand() - 0.5) * cellSize * 0.72;
  return Number((base + jitter).toFixed(3));
}

export type GenerateProceduralWorldOptions = {
  seed?: string;
  count?: number;
  /** Override generation clock (tests). */
  now?: Date;
};

/**
 * Generate a deterministic procedural world. Same seed + count ⇒ identical
 * coordinates, types, access levels, and telemetry snapshot shape.
 */
export function generateProceduralWorld(
  options: GenerateProceduralWorldOptions = {}
): ProceduralWorld {
  const seed = (options.seed?.trim() || DEFAULT_WORLD_SEED).slice(0, 128);
  const count = Math.min(
    MAX_NODE_COUNT,
    Math.max(MIN_NODE_COUNT, options.count ?? DEFAULT_NODE_COUNT)
  );
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const rand = mulberry32(hashSeed(`${seed}::${count}`));
  const specialSlots = specialSlotPlan(count);

  // Rough square lattice so nodes stay spread across the 500×500 plane.
  const cells = Math.ceil(Math.sqrt(count));
  const occupied = new Set<string>();

  const nodes: ProceduralNode[] = [];
  const specialCounts: Record<string, number> = {};
  const accessCounts: Record<SpatialAccessLevel, number> = {
    Public: 0,
    Admin: 0,
    Superadmin: 0,
  };
  const vehicleSpawnAnchors: string[] = [];

  for (let i = 0; i < count; i++) {
    const cellX = i % cells;
    const cellZ = Math.floor(i / cells) % cells;

    let x = jitterCoord(rand, cellX, cells);
    let z = jitterCoord(rand, cellZ, cells);
    let key = `${x.toFixed(1)},${z.toFixed(1)}`;
    let attempts = 0;
    while (occupied.has(key) && attempts < 8) {
      x = jitterCoord(rand, cellX, cells);
      z = jitterCoord(rand, cellZ, cells);
      key = `${x.toFixed(1)},${z.toFixed(1)}`;
      attempts++;
    }
    occupied.add(key);

    const special = specialSlots[i];
    const objectType: SpatialObjectType =
      special ??
      HARDWARE_TYPES[Math.floor(rand() * HARDWARE_TYPES.length)]!;

    const isSpecial = (SPECIAL_NODE_TYPES as readonly string[]).includes(
      objectType
    );
    const accessLevel = isSpecial
      ? accessForSpecial(objectType as SpecialNodeType, rand)
      : pickWeightedAccess(rand);

    const requiresPin =
      accessLevel === "Superadmin" ||
      (accessLevel === "Admin" &&
        (objectType === "sentry_error_workstation" ||
          objectType === "database_shard_monitor"));

    const id = `node-${seed.slice(0, 8)}-${String(i).padStart(4, "0")}`;
    const label = `${LABEL_PREFIX[objectType]}-${String(i + 1).padStart(3, "0")}`;
    const ipHint =
      objectType === "network_diagnostic_ip" ||
      objectType === "diagnostic_router"
        ? formatIp(rand)
        : null;

    const node: ProceduralNode = {
      id,
      index: i,
      objectType,
      classification: isSpecial ? "special" : "standard",
      accessLevel,
      requiresPin,
      coordinates: {
        x,
        y: 0,
        z,
      },
      rotationY: Number((rand() * Math.PI * 2).toFixed(4)),
      scale: Number((0.85 + rand() * 0.45).toFixed(3)),
      label,
      ipHint,
      telemetry: buildTelemetry(rand, nowIso),
    };

    nodes.push(node);
    specialCounts[objectType] = (specialCounts[objectType] ?? 0) + 1;
    accessCounts[accessLevel] += 1;
    if (objectType === "vehicle_spawn_anchor") {
      vehicleSpawnAnchors.push(id);
    }
  }

  return {
    meta: {
      seed,
      gridSize: GRID_SIZE,
      nodeCount: nodes.length,
      generatedAt: nowIso,
      specialCounts,
      accessCounts,
    },
    nodes,
    vehicleSpawnAnchors,
  };
}

export function findProceduralNode(
  world: ProceduralWorld,
  nodeId: string
): ProceduralNode | null {
  return world.nodes.find((n) => n.id === nodeId) ?? null;
}
