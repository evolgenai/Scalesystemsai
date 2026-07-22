/**
 * Procedural Object Matrix — seeded 100+ IT hardware nodes on a 500×500 grid.
 * Classifications align with Spatial Universe Agent B interactables.
 */

import { z } from "zod";
import {
  GRID_SIZE,
  DEFAULT_NODE_COUNT,
  MIN_NODE_COUNT,
  MAX_NODE_COUNT,
  DEFAULT_WORLD_SEED,
  hashSeed,
  mulberry32,
} from "@/lib/spatial/proceduralWorld";

export const WorldObjectClassSchema = z.enum([
  "sentry_terminal",
  "ip_node",
  "quantum_router",
  "cyber_rack",
  "encryption_vault",
  "vehicle_spawn",
]);
export type WorldObjectClass = z.infer<typeof WorldObjectClassSchema>;

export const WorldObjectAccessSchema = z.enum([
  "Public",
  "Admin",
  "Superadmin",
]);
export type WorldObjectAccess = z.infer<typeof WorldObjectAccessSchema>;

export const WorldObjectSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0),
  classification: WorldObjectClassSchema,
  interactive: z.boolean(),
  pinLocked: z.boolean(),
  accessLevel: WorldObjectAccessSchema,
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  rotationY: z.number(),
  scale: z.number().positive(),
  label: z.string().min(1),
  virtualIp: z.string().nullable(),
  telemetry: z.object({
    cpuLoad: z.number().min(0).max(1),
    latencyMs: z.number().min(0),
    errorRate: z.number().min(0).max(1),
    status: z.enum(["online", "degraded", "locked", "idle"]),
  }),
});
export type WorldObject = z.infer<typeof WorldObjectSchema>;

export const WorldObjectsMatrixSchema = z.object({
  seed: z.string(),
  gridSize: z.literal(GRID_SIZE),
  count: z.number().int().min(MIN_NODE_COUNT),
  generatedAt: z.string().datetime(),
  classificationCounts: z.record(z.string(), z.number().int()),
  objects: z.array(WorldObjectSchema).min(MIN_NODE_COUNT),
  vehicleSpawns: z.array(z.string()),
  sentryTerminals: z.array(z.string()),
});
export type WorldObjectsMatrix = z.infer<typeof WorldObjectsMatrixSchema>;

const DECORATIVE: readonly WorldObjectClass[] = [
  "quantum_router",
  "cyber_rack",
  "encryption_vault",
];

const LABEL: Record<WorldObjectClass, string> = {
  sentry_terminal: "Sentry Terminal",
  ip_node: "IP Diagnostic Node",
  quantum_router: "Quantum Router",
  cyber_rack: "Cyber Rack",
  encryption_vault: "Encryption Vault",
  vehicle_spawn: "Vehicle Spawn",
};

function formatIp(rand: () => number): string {
  return `10.${Math.floor(rand() * 256)}.${Math.floor(rand() * 256)}.${
    2 + Math.floor(rand() * 252)
  }`;
}

function jitter(rand: () => number, cell: number, cells: number): number {
  const cellSize = GRID_SIZE / cells;
  const origin = -GRID_SIZE / 2;
  const base = origin + (cell + 0.5) * cellSize;
  return Number((base + (rand() - 0.5) * cellSize * 0.7).toFixed(3));
}

function reserveSpecials(count: number): Array<WorldObjectClass | null> {
  const slots: Array<WorldObjectClass | null> = Array.from(
    { length: count },
    () => null
  );
  const plan: Array<{ type: WorldObjectClass; min: number; ratio: number }> = [
    { type: "sentry_terminal", min: 4, ratio: 0.04 },
    { type: "ip_node", min: 6, ratio: 0.05 },
    { type: "vehicle_spawn", min: 3, ratio: 0.03 },
  ];

  let offset = 0;
  for (const entry of plan) {
    const n = Math.max(entry.min, Math.floor(count * entry.ratio));
    const stride = Math.max(1, Math.floor(count / n));
    for (let i = 0; i < n; i++) {
      let target = (offset + i * stride) % count;
      let guard = 0;
      while (slots[target] !== null && guard < count) {
        target = (target + 1) % count;
        guard++;
      }
      if (slots[target] === null) slots[target] = entry.type;
    }
    offset += 5;
  }
  return slots;
}

export type GenerateWorldObjectsOptions = {
  seed?: string;
  count?: number;
  now?: Date;
};

/**
 * Deterministic object matrix. Same seed + count ⇒ identical coordinates
 * and classifications.
 */
export function generateWorldObjectsMatrix(
  options: GenerateWorldObjectsOptions = {}
): WorldObjectsMatrix {
  const seed = (options.seed?.trim() || DEFAULT_WORLD_SEED).slice(0, 128);
  const count = Math.min(
    MAX_NODE_COUNT,
    Math.max(MIN_NODE_COUNT, options.count ?? DEFAULT_NODE_COUNT)
  );
  const nowIso = (options.now ?? new Date()).toISOString();
  const rand = mulberry32(hashSeed(`world-objects::${seed}::${count}`));
  const specials = reserveSpecials(count);
  const cells = Math.ceil(Math.sqrt(count));

  const objects: WorldObject[] = [];
  const classificationCounts: Record<string, number> = {};
  const vehicleSpawns: string[] = [];
  const sentryTerminals: string[] = [];

  for (let i = 0; i < count; i++) {
    const classification: WorldObjectClass =
      specials[i] ??
      DECORATIVE[Math.floor(rand() * DECORATIVE.length)]!;

    const pinLocked = classification === "sentry_terminal";
    const accessLevel: WorldObjectAccess =
      classification === "sentry_terminal"
        ? "Superadmin"
        : classification === "encryption_vault"
          ? rand() < 0.5
            ? "Admin"
            : "Public"
          : classification === "ip_node"
            ? "Admin"
            : "Public";

    const interactive =
      classification === "sentry_terminal" ||
      classification === "ip_node" ||
      classification === "vehicle_spawn" ||
      classification === "encryption_vault";

    const id = `wo-${seed.slice(0, 8)}-${String(i).padStart(4, "0")}`;
    const cellX = i % cells;
    const cellZ = Math.floor(i / cells) % cells;

    const obj: WorldObject = {
      id,
      index: i,
      classification,
      interactive,
      pinLocked,
      accessLevel,
      coordinates: {
        x: jitter(rand, cellX, cells),
        y: 0,
        z: jitter(rand, cellZ, cells),
      },
      rotationY: Number((rand() * Math.PI * 2).toFixed(4)),
      scale: Number((0.85 + rand() * 0.4).toFixed(3)),
      label: `${LABEL[classification]}-${String(i + 1).padStart(3, "0")}`,
      virtualIp:
        classification === "ip_node" || classification === "quantum_router"
          ? formatIp(rand)
          : null,
      telemetry: {
        cpuLoad: Number((0.05 + rand() * 0.9).toFixed(3)),
        latencyMs: Number((1 + rand() * 140).toFixed(2)),
        errorRate: Number((rand() * (pinLocked ? 0.12 : 0.05)).toFixed(4)),
        status: pinLocked
          ? "locked"
          : rand() < 0.08
            ? "degraded"
            : classification === "vehicle_spawn"
              ? "idle"
              : "online",
      },
    };

    objects.push(obj);
    classificationCounts[classification] =
      (classificationCounts[classification] ?? 0) + 1;
    if (classification === "vehicle_spawn") vehicleSpawns.push(id);
    if (classification === "sentry_terminal") sentryTerminals.push(id);
  }

  return {
    seed,
    gridSize: GRID_SIZE,
    count: objects.length,
    generatedAt: nowIso,
    classificationCounts,
    objects,
    vehicleSpawns,
    sentryTerminals,
  };
}

export function findWorldObject(
  matrix: WorldObjectsMatrix,
  objectId: string
): WorldObject | null {
  return matrix.objects.find((o) => o.id === objectId) ?? null;
}
