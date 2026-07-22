/**
 * POST /api/spatial/workstation-unlock
 * PIN authentication for locked Spatial Universe workstations
 * (Admin / Superadmin access levels).
 *
 * Body: { nodeId, pin?, sessionId, seed?, workspaceId? }
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { enforcePermission } from "@/lib/auth/rbacMiddleware";
import {
  DEFAULT_WORLD_SEED,
  findProceduralNode,
  generateProceduralWorld,
} from "@/lib/spatial/proceduralWorld";
import {
  authenticateWorkstationAccess,
  authStateFromProfile,
} from "@/lib/spatial/workstationPin";
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
    nodeId: z.string().trim().min(1).max(128),
    pin: z.string().trim().min(4).max(8).regex(/^\d{4,8}$/).optional(),
    sessionId: z.string().trim().min(1).max(128),
    seed: z.string().trim().min(1).max(128).optional(),
    count: z.number().int().min(100).max(512).optional(),
    workspaceId: z.string().trim().min(1).optional(),
  })
  .strict();

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
      parsed.error.issues[0]?.message ?? "Invalid unlock payload.",
      "INVALID_BODY",
      400
    );
  }

  const rbac = await enforcePermission(
    request,
    "spatial.interact",
    parsed.data.workspaceId ?? null
  );
  // Soft-gate: allow unlock attempts without workspace key for Public/demo,
  // but still resolve the signed-in profile for auth-state tags.
  const profile = rbac.ok
    ? rbac.ctx.profile
    : await resolveRequestUser(request);
  const membershipRole = rbac.ok ? rbac.ctx.membershipRole : null;
  const authState = authStateFromProfile(profile);

  const telemetry = telemetryContextFromRequest(request, {
    source: "api",
    route: "/api/spatial/workstation-unlock",
    tenantId: rbac.ok ? rbac.ctx.workspaceId : undefined,
  });

  try {
    return await withSpatialTelemetry(
      {
        ...telemetry,
        spatial: {
          nodeId: parsed.data.nodeId,
          authState,
        },
      },
      async () => {
        const world = generateProceduralWorld({
          seed: parsed.data.seed ?? DEFAULT_WORLD_SEED,
          count: parsed.data.count,
        });
        const node = findProceduralNode(world, parsed.data.nodeId);
        if (!node) {
          return apiError("Spatial node not found.", "NODE_NOT_FOUND", 404);
        }

        const result = authenticateWorkstationAccess({
          accessLevel: node.accessLevel,
          requiresPin: node.requiresPin,
          authState,
          pin: parsed.data.pin,
          sessionId: parsed.data.sessionId,
          nodeId: node.id,
          userId: profile.id,
          membershipRole,
        });

        captureSpatialInteraction(
          result.ok
            ? "spatial.workstation.unlock.ok"
            : "spatial.workstation.unlock.denied",
          {
            objectType: node.objectType,
            nodeId: node.id,
            accessLevel: node.accessLevel,
            authState,
            coordinates: {
              x: node.coordinates.x,
              z: node.coordinates.z,
              y: node.coordinates.y,
            },
            vehicleSpeedStatus: "walk_1x",
          },
          telemetry,
          result.ok ? "info" : "warning"
        );

        if (!result.ok) {
          const status =
            result.code === "PIN_REQUIRED"
              ? 401
              : result.code === "PIN_INVALID"
                ? 403
                : 403;
          return apiError(result.error, result.code, status);
        }

        return apiSuccess({
          unlocked: true,
          node: {
            id: node.id,
            objectType: node.objectType,
            accessLevel: node.accessLevel,
            label: node.label,
            coordinates: node.coordinates,
            ipHint: node.ipHint,
            telemetry: node.telemetry,
          },
          unlock: {
            lane: result.lane,
            accessGranted: result.accessGranted,
            unlockedUntil: result.unlockedUntil,
            sessionToken: result.sessionToken,
          },
          auth: { state: authState, userId: profile.id },
        });
      }
    );
  } catch (error) {
    captureSpatialError(
      error,
      {
        nodeId: parsed.data.nodeId,
        authState,
        objectType: "workstation",
      },
      telemetry
    );
    return apiError(
      error instanceof Error ? error.message : "Workstation unlock failed.",
      "UNLOCK_FAILED",
      500
    );
  }
}
