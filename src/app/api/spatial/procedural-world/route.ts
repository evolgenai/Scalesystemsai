/**
 * GET /api/spatial/procedural-world
 * Deterministic 100+ node scatter across a 500×500 grid with access levels
 * and telemetry metrics. Optional query: seed, count.
 *
 * POST — same generator with JSON body { seed?, count? } (Agent B scatter feed).
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  DEFAULT_NODE_COUNT,
  DEFAULT_WORLD_SEED,
  MAX_NODE_COUNT,
  MIN_NODE_COUNT,
  generateProceduralWorld,
} from "@/lib/spatial/proceduralWorld";
import { authStateFromProfile } from "@/lib/spatial/workstationPin";
import {
  captureSpatialError,
  captureSpatialInteraction,
  withSpatialTelemetry,
} from "@/lib/spatial/spatialTelemetry";
import {
  telemetryContextFromRequest,
} from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  seed: z.string().trim().min(1).max(128).optional(),
  count: z.coerce.number().int().min(MIN_NODE_COUNT).max(MAX_NODE_COUNT).optional(),
});

const BodySchema = z
  .object({
    seed: z.string().trim().min(1).max(128).optional(),
    count: z.number().int().min(MIN_NODE_COUNT).max(MAX_NODE_COUNT).optional(),
  })
  .strict();

async function buildWorldResponse(
  request: Request,
  seed: string | undefined,
  count: number | undefined
) {
  const profile = await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);
  const telemetry = telemetryContextFromRequest(request, {
    source: "api",
    route: "/api/spatial/procedural-world",
    tenantId: request.headers.get("x-workspace-id"),
  });

  return withSpatialTelemetry(
    {
      ...telemetry,
      spatial: {
        objectType: "procedural_world",
        authState,
        coordinates: { x: 0, z: 0 },
        vehicleSpeedStatus: "walk_1x",
      },
    },
    async () => {
      const world = generateProceduralWorld({
        seed: seed ?? DEFAULT_WORLD_SEED,
        count: count ?? DEFAULT_NODE_COUNT,
      });

      captureSpatialInteraction(
        "spatial.procedural_world.generated",
        {
          objectType: "procedural_world",
          authState,
          coordinates: { x: 0, z: 0 },
          accessLevel: "Public",
          vehicleSpeedStatus: "walk_1x",
        },
        telemetry,
        "info"
      );

      return apiSuccess({
        world,
        auth: {
          state: authState,
          userId: profile.id,
          isSuperAdmin: profile.isSuperAdmin,
        },
      });
    }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    seed: url.searchParams.get("seed") ?? undefined,
    count: url.searchParams.get("count") ?? undefined,
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid query parameters.",
      "INVALID_QUERY",
      400
    );
  }

  try {
    return await buildWorldResponse(
      request,
      parsed.data.seed,
      parsed.data.count
    );
  } catch (error) {
    captureSpatialError(
      error,
      { objectType: "procedural_world", authState: "unknown" },
      telemetryContextFromRequest(request, {
        route: "/api/spatial/procedural-world",
      })
    );
    return apiError(
      error instanceof Error ? error.message : "Procedural world generation failed.",
      "PROCEDURAL_WORLD_FAILED",
      500
    );
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid body.",
      "INVALID_BODY",
      400
    );
  }

  try {
    return await buildWorldResponse(
      request,
      parsed.data.seed,
      parsed.data.count
    );
  } catch (error) {
    captureSpatialError(
      error,
      { objectType: "procedural_world", authState: "unknown" },
      telemetryContextFromRequest(request, {
        route: "/api/spatial/procedural-world",
      })
    );
    return apiError(
      error instanceof Error ? error.message : "Procedural world generation failed.",
      "PROCEDURAL_WORLD_FAILED",
      500
    );
  }
}
