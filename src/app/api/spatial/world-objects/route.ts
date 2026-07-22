/**
 * GET|POST /api/spatial/world-objects
 * Seeded procedural object matrix — 100+ IT hardware nodes on a 500×500 grid.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  DEFAULT_NODE_COUNT,
  MIN_NODE_COUNT,
  MAX_NODE_COUNT,
} from "@/lib/spatial/proceduralWorld";
import { generateWorldObjectsMatrix } from "@/lib/spatial/worldObjects";
import { BIO_METALLIC_TOKENS } from "@/lib/spatial/bioMetallicTokens";
import { authStateFromProfile } from "@/lib/spatial/workstationPin";
import {
  captureSpatialError,
  captureSpatialInteraction,
  withSpatialTelemetry,
} from "@/lib/spatial/spatialTelemetry";
import { telemetryContextFromRequest } from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  seed: z.string().trim().min(1).max(128).optional(),
  count: z.coerce
    .number()
    .int()
    .min(MIN_NODE_COUNT)
    .max(MAX_NODE_COUNT)
    .optional(),
});

const BodySchema = z
  .object({
    seed: z.string().trim().min(1).max(128).optional(),
    count: z.number().int().min(MIN_NODE_COUNT).max(MAX_NODE_COUNT).optional(),
  })
  .strict();

async function respond(
  request: Request,
  seed: string | undefined,
  count: number | undefined
) {
  const profile = await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);
  const telemetry = telemetryContextFromRequest(request, {
    source: "api",
    route: "/api/spatial/world-objects",
  });

  return withSpatialTelemetry(
    {
      ...telemetry,
      spatial: {
        objectType: "world_objects_matrix",
        authState,
        coordinates: { x: 0, z: 0 },
        vehicleSpeedStatus: "walk_1x",
      },
    },
    async () => {
      const matrix = generateWorldObjectsMatrix({
        seed,
        count: count ?? DEFAULT_NODE_COUNT,
      });

      captureSpatialInteraction(
        "spatial.world_objects.generated",
        {
          objectType: "world_objects_matrix",
          authState,
          accessLevel: "Public",
          coordinates: { x: 0, z: 0 },
          vehicleSpeedStatus: "walk_1x",
        },
        telemetry,
        "info"
      );

      return apiSuccess({
        matrix,
        designTokens: BIO_METALLIC_TOKENS,
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
      parsed.error.issues[0]?.message ?? "Invalid query.",
      "INVALID_QUERY",
      400
    );
  }

  try {
    return await respond(request, parsed.data.seed, parsed.data.count);
  } catch (error) {
    captureSpatialError(
      error,
      { objectType: "world_objects_matrix", authState: "unknown" },
      telemetryContextFromRequest(request, {
        route: "/api/spatial/world-objects",
      })
    );
    return apiError(
      error instanceof Error ? error.message : "World objects generation failed.",
      "WORLD_OBJECTS_FAILED",
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
    return await respond(request, parsed.data.seed, parsed.data.count);
  } catch (error) {
    captureSpatialError(
      error,
      { objectType: "world_objects_matrix", authState: "unknown" },
      telemetryContextFromRequest(request, {
        route: "/api/spatial/world-objects",
      })
    );
    return apiError(
      error instanceof Error ? error.message : "World objects generation failed.",
      "WORLD_OBJECTS_FAILED",
      500
    );
  }
}
