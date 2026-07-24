/**
 * POST /api/agents/voice
 * Voice / NL utterance → spatial command parse (Sprint 56).
 * Never throws a parse exception to the client — always returns a command envelope.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  parseSpatialCommand,
  type ParsedSpatialCommand,
} from "@/lib/spatial/commandParser";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const VoiceRequestSchema = z
  .object({
    transcript: z.string().trim().min(1).max(500).optional(),
    utterance: z.string().trim().min(1).max(500).optional(),
    command: z.string().trim().min(1).max(500).optional(),
    query: z.string().trim().min(1).max(500).optional(),
    sessionId: z.string().trim().min(1).max(128).optional(),
    workspaceId: z.string().trim().min(1).max(128).optional(),
    seed: z.string().trim().min(1).max(128).optional(),
    from: z
      .object({
        x: z.number(),
        y: z.number().optional(),
        z: z.number(),
      })
      .optional(),
  })
  .refine(
    (v) =>
      Boolean(
        v.transcript?.trim() ||
          v.utterance?.trim() ||
          v.command?.trim() ||
          v.query?.trim()
      ),
    { message: "transcript, utterance, command, or query is required" }
  );

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = VoiceRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid voice payload.",
      "INVALID_BODY",
      400
    );
  }

  const text =
    parsed.data.transcript?.trim() ||
    parsed.data.utterance?.trim() ||
    parsed.data.command?.trim() ||
    parsed.data.query?.trim() ||
    "";

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/agents/voice",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      let command: ParsedSpatialCommand;
      try {
        command = parseSpatialCommand({
          command: text,
          query: text,
          seed: parsed.data.seed,
          from: parsed.data.from
            ? {
                x: parsed.data.from.x,
                y: parsed.data.from.y ?? 0,
                z: parsed.data.from.z,
              }
            : undefined,
        });
      } catch {
        command = parseSpatialCommand({ command: text, query: text });
      }

      return apiSuccess({
        command,
        parsed: command,
        pathfinder: {
          destination: command.coordinates,
          targetNodeId: command.targetNodeId,
          intent: command.intent,
        },
        voice: {
          transcript: text,
          sessionId: parsed.data.sessionId ?? null,
          recognized: command.intent !== "unknown",
        },
      });
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    // Soft-fail: return unknown command instead of 500 parse exception.
    const fallback = parseSpatialCommand({ command: text, query: text });
    return apiSuccess({
      command: fallback,
      parsed: fallback,
      pathfinder: {
        destination: fallback.coordinates,
        targetNodeId: fallback.targetNodeId,
        intent: fallback.intent,
      },
      voice: {
        transcript: text,
        sessionId: parsed.data.sessionId ?? null,
        recognized: false,
        softError: error instanceof Error ? error.message : "voice_parse_soft_fail",
      },
    });
  }
}

export async function GET() {
  return apiSuccess({
    endpoint: "/api/agents/voice",
    examples: ["go to sentry", "meta-sre", "sandbox", "database"],
    hint: "POST { transcript | utterance | command }",
  });
}
