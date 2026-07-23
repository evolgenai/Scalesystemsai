/**
 * POST /api/spatial/tor-mask
 * Alien interacts with Tor Onion Router → encrypted virtual IP + tunnel status.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { authStateFromProfile } from "@/lib/spatial/workstationPin";
import {
  generateTorMask,
  getTorMaskSession,
} from "@/lib/spatial/torMask";
import {
  captureSpatialError,
  captureSpatialInteraction,
  withSpatialTelemetry,
} from "@/lib/spatial/spatialTelemetry";
import { telemetryContextFromRequest } from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z
  .object({
    sessionId: z.string().trim().min(1).max(128),
    nodeId: z.string().trim().min(1).max(128).optional(),
    hops: z.number().int().min(3).max(5).optional(),
    coordinates: z
      .object({
        x: z.number(),
        z: z.number(),
        y: z.number().optional(),
      })
      .optional(),
  })
  .strict();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return apiError("sessionId query param required.", "INVALID_QUERY", 400);
  }
  const existing = getTorMaskSession(sessionId);
  if (!existing) {
    return apiError("No active Tor mask session.", "TOR_SESSION_NOT_FOUND", 404);
  }
  return apiSuccess({ tor: existing });
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
      parsed.error.issues[0]?.message ?? "Invalid tor-mask payload.",
      "INVALID_BODY",
      400
    );
  }

  const profile = await resolveRequestUser(request);
  const authState = authStateFromProfile(profile);
  const telemetry = telemetryContextFromRequest(request, {
    source: "api",
    route: "/api/spatial/tor-mask",
  });

  try {
    return await withSpatialTelemetry(
      {
        ...telemetry,
        spatial: {
          objectType: "tor_node",
          nodeId: parsed.data.nodeId ?? null,
          authState,
          coordinates: parsed.data.coordinates
            ? {
                x: parsed.data.coordinates.x,
                z: parsed.data.coordinates.z,
                y: parsed.data.coordinates.y,
              }
            : null,
          vehicleSpeedStatus: "walk_1x",
        },
      },
      async () => {
        const tor = generateTorMask({
          sessionId: parsed.data.sessionId,
          nodeId: parsed.data.nodeId,
          hops: parsed.data.hops,
        });

        captureSpatialInteraction(
          "spatial.tor_mask.established",
          {
            objectType: "tor_node",
            nodeId: parsed.data.nodeId ?? null,
            authState,
            coordinates: parsed.data.coordinates
              ? {
                  x: parsed.data.coordinates.x,
                  z: parsed.data.coordinates.z,
                  y: parsed.data.coordinates.y,
                }
              : null,
            vehicleSpeedStatus: "walk_1x",
          },
          telemetry,
          "info"
        );

        return apiSuccess({
          tor,
          auth: { state: authState, userId: profile.id },
          effect: {
            type: "ip_masking_matrix",
            durationMs: tor.matrixEffect.durationMs,
          },
        });
      }
    );
  } catch (error) {
    captureSpatialError(
      error,
      {
        objectType: "tor_node",
        authState,
        nodeId: parsed.data.nodeId ?? null,
      },
      telemetry
    );
    return apiError(
      error instanceof Error ? error.message : "Tor mask failed.",
      "TOR_MASK_FAILED",
      500
    );
  }
}
