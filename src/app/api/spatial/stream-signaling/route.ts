/**
 * GET|POST /api/spatial/stream-signaling
 * WebRTC signaling config (STUN/TURN) + Arcware/RunPod fallbacks for UE5.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { createTraceId } from "@/lib/sentry/telemetry";
import {
  buildStreamSignalingConfig,
  drainSignalingMessages,
  enqueueSignalingMessage,
} from "@/lib/spatial/streamSignaling";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import { textureCacheHeaders } from "@/lib/theme/textureMatrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const GetQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(128).optional(),
  roomId: z.string().trim().min(1).max(64).optional(),
  provider: z.enum(["hybrid", "arcware", "runpod", "self_hosted"]).optional(),
  ttlSec: z.coerce.number().int().min(60).max(3600).optional(),
  drain: z.coerce.boolean().optional(),
  after: z.coerce.number().int().min(0).optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("config"),
      sessionId: z.string().trim().min(1).max(128).optional(),
      roomId: z.string().trim().min(1).max(64).optional(),
      provider: z
        .enum(["hybrid", "arcware", "runpod", "self_hosted"])
        .optional(),
      ttlSec: z.number().int().min(60).max(3600).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("signal"),
      type: z.enum(["offer", "answer", "ice-candidate", "hangup"]),
      sessionId: z.string().trim().min(1).max(128),
      sdp: z.string().max(256_000).optional(),
      candidate: z.record(z.string(), z.unknown()).optional(),
      from: z.string().trim().max(128).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("poll"),
      sessionId: z.string().trim().min(1).max(128),
      after: z.number().int().min(0).optional(),
    })
    .strict(),
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = GetQuerySchema.safeParse({
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    roomId: url.searchParams.get("roomId") ?? undefined,
    provider: url.searchParams.get("provider") ?? undefined,
    ttlSec: url.searchParams.get("ttlSec") ?? undefined,
    drain: url.searchParams.get("drain") ?? undefined,
    after: url.searchParams.get("after") ?? undefined,
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid signaling query.",
      "INVALID_QUERY",
      400,
      textureCacheHeaders()
    );
  }

  const sessionId =
    parsed.data.sessionId ?? `ue5_${createTraceId().slice(0, 12)}`;
  const config = buildStreamSignalingConfig({
    sessionId,
    roomId: parsed.data.roomId,
    provider: parsed.data.provider,
    ttlSec: parsed.data.ttlSec,
  });

  const messages = parsed.data.drain
    ? drainSignalingMessages(sessionId, parsed.data.after ?? 0)
    : undefined;

  return apiSuccess(
    {
      config,
      messages,
      // Back-compat aliases for earlier UE5 lumen client stubs
      signalingUrl: config.signaling.url,
      whipUrl: config.signaling.whipUrl,
      iceServers: config.iceServers,
      demoMode: config.demoMode,
      fallback: "webgl" as const,
    },
    200,
    textureCacheHeaders()
  );
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError(
      "Invalid JSON body.",
      "INVALID_JSON",
      400,
      textureCacheHeaders()
    );
  }

  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid signaling payload.",
      "INVALID_BODY",
      400,
      textureCacheHeaders()
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/spatial/stream-signaling",
    source: "api",
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const body = parsed.data;

      if (body.action === "config") {
        const sessionId =
          body.sessionId ?? `ue5_${createTraceId().slice(0, 12)}`;
        const config = buildStreamSignalingConfig({
          sessionId,
          roomId: body.roomId,
          provider: body.provider,
          ttlSec: body.ttlSec,
        });
        return apiSuccess(
          {
            action: "config",
            config,
            demoMode: config.demoMode,
            iceServers: config.iceServers,
            auth: { userId: profile.id },
          },
          200,
          textureCacheHeaders()
        );
      }

      if (body.action === "poll") {
        const messages = drainSignalingMessages(
          body.sessionId,
          body.after ?? 0
        );
        return apiSuccess(
          {
            action: "poll",
            sessionId: body.sessionId,
            messages,
            count: messages.length,
          },
          200,
          textureCacheHeaders()
        );
      }

      const queued = enqueueSignalingMessage({
        type: body.type,
        sessionId: body.sessionId,
        sdp: body.sdp,
        candidate: body.candidate,
        from: body.from ?? profile.id ?? "peer",
      });

      return apiSuccess(
        {
          action: "signal",
          queued: true,
          queueLength: queued,
          sessionId: body.sessionId,
          type: body.type,
        },
        200,
        textureCacheHeaders()
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Stream signaling failed.",
      "STREAM_SIGNALING_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}
