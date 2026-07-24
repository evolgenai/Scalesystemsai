/**
 * POST /api/spatial/command-parser
 * Natural language → grid coordinates + target node ID for pathfinding.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  CommandParserRequestSchema,
  parseSpatialCommand,
} from "@/lib/spatial/commandParser";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import { textureCacheHeaders } from "@/lib/theme/textureMatrix";
import {
  captureSpatialInteraction,
} from "@/lib/spatial/spatialTelemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    const url = new URL(request.url);
    const q =
      url.searchParams.get("command") ?? url.searchParams.get("query");
    if (!q) {
      return apiError(
        "Invalid JSON body.",
        "INVALID_JSON",
        400,
        textureCacheHeaders()
      );
    }
    raw = { command: q, query: q };
  }

  // Normalize command/query aliases before zod parse.
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (!obj.command && typeof obj.query === "string") obj.command = obj.query;
    if (!obj.query && typeof obj.command === "string") obj.query = obj.command;
  }

  const parsed = CommandParserRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid command payload.",
      "INVALID_BODY",
      400,
      textureCacheHeaders()
    );
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/command-parser",
    source: "api",
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = parseSpatialCommand(parsed.data);

      captureSpatialInteraction(
        "spatial.command_parser.resolve",
        {
          objectType: result.targetNodeType,
          nodeId: result.targetNodeId,
          authState: "anonymous",
          coordinates: {
            x: result.coordinates[0],
            y: result.coordinates[1],
            z: result.coordinates[2],
          },
          vehicleSpeedStatus: "walk_1x",
        },
        telemetry,
        "info"
      );

      return apiSuccess(
        {
          /** Canonical parsed command (HUD + pathfinder). */
          command: result,
          parsed: result,
          pathfinder: {
            destination: result.coordinates,
            targetNodeId: result.targetNodeId,
            intent: result.intent,
          },
        },
        200,
        textureCacheHeaders()
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Command parse failed.",
      "COMMAND_PARSER_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const command = url.searchParams.get("command")?.trim();
  if (!command) {
    return apiSuccess({
      endpoint: "/api/spatial/command-parser",
      examples: [
        "Take me to Tor Node",
        "Inspect Sentry errors",
        "Mount CyberRover",
      ],
      hint: "POST { command } or GET ?command=",
    });
  }

  const result = parseSpatialCommand({
    command,
    seed: url.searchParams.get("seed") ?? undefined,
  });
  return apiSuccess({
    command: result,
    parsed: result,
    pathfinder: {
      destination: result.coordinates,
      targetNodeId: result.targetNodeId,
      intent: result.intent,
    },
  });
}
