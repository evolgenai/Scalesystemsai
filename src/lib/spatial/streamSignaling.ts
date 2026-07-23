/**
 * UE5 cloud stream WebRTC signaling — STUN/TURN + Arcware / RunPod fallbacks.
 * Compatible with Pixel Streaming / WHIP-style hybrid paths.
 */

import { z } from "zod";

export const IceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServer = z.infer<typeof IceServerSchema>;

export const StreamSignalingConfigSchema = z.object({
  version: z.literal(50),
  protocol: z.literal("webrtc"),
  engine: z.literal("ue5-lumen"),
  provider: z.enum(["hybrid", "arcware", "runpod", "self_hosted"]),
  demoMode: z.boolean(),
  iceServers: z.array(IceServerSchema).min(1),
  signaling: z.object({
    path: z.string(),
    url: z.string().nullable(),
    whipUrl: z.string().nullable(),
    methods: z.array(z.enum(["offer", "answer", "ice-candidate", "hangup"])),
    ttlSec: z.number().int().positive(),
  }),
  fallbacks: z.object({
    webgl: z.literal(true),
    arcware: z.object({
      enabled: z.boolean(),
      shareUrl: z.string().nullable(),
      websocketUrl: z.string().nullable(),
      projectId: z.string().nullable(),
    }),
    runpod: z.object({
      enabled: z.boolean(),
      endpointId: z.string().nullable(),
      baseUrl: z.string().nullable(),
      webrtcPath: z.string(),
    }),
  }),
  ue5: z.object({
    pixelStreamingCompatible: z.boolean(),
    preferredCodec: z.enum(["H264", "VP8", "AV1"]),
    maxBitrateKbps: z.number().int().positive(),
    startBitrateKbps: z.number().int().positive(),
    latencyBudgetMs: z.number().int().positive(),
    roomId: z.string(),
  }),
  session: z.object({
    sessionId: z.string(),
    expiresAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
  }),
});
export type StreamSignalingConfig = z.infer<typeof StreamSignalingConfigSchema>;

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v || null;
}

function buildIceServers(): IceServer[] {
  const stun =
    env("SPATIAL_STUN_URL") ||
    env("WEBRTC_STUN_URL") ||
    "stun:stun.l.google.com:19302";

  const servers: IceServer[] = [
    { urls: stun },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];

  const turnUrl =
    env("SPATIAL_TURN_URL") ||
    env("WEBRTC_TURN_URL") ||
    env("TURN_SERVER_URL");
  const turnUser =
    env("SPATIAL_TURN_USERNAME") ||
    env("WEBRTC_TURN_USERNAME") ||
    env("TURN_USERNAME");
  const turnPass =
    env("SPATIAL_TURN_CREDENTIAL") ||
    env("WEBRTC_TURN_CREDENTIAL") ||
    env("TURN_CREDENTIAL");

  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      ...(turnUser ? { username: turnUser } : {}),
      ...(turnPass ? { credential: turnPass } : {}),
    });
  } else if (process.env.NODE_ENV !== "production") {
    servers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return servers;
}

export type BuildStreamSignalingOptions = {
  sessionId?: string;
  roomId?: string;
  provider?: "hybrid" | "arcware" | "runpod" | "self_hosted";
  ttlSec?: number;
};

export function buildStreamSignalingConfig(
  options: BuildStreamSignalingOptions = {}
): StreamSignalingConfig {
  const ttlSec = Math.min(3600, Math.max(60, options.ttlSec ?? 600));
  const signalingUrl =
    env("UE5_PIXEL_SIGNALING_URL") ||
    env("SPATIAL_UE5_SIGNALING_URL") ||
    null;
  const whipUrl =
    env("UE5_PIXEL_WHIP_URL") || env("SPATIAL_UE5_WHIP_URL") || null;

  const arcwareShare =
    env("ARCWARE_SHARE_URL") || env("ARCWARE_STREAM_URL");
  const arcwareWs =
    env("ARCWARE_WEBSOCKET_URL") || env("ARCWARE_SIGNALING_URL");
  const arcwareProject = env("ARCWARE_PROJECT_ID");
  const runpodEndpoint =
    env("RUNPOD_ENDPOINT_ID") || env("RUNPOD_WEBRTC_ENDPOINT");
  const runpodBase =
    env("RUNPOD_BASE_URL") ||
    (runpodEndpoint
      ? `https://api.runpod.ai/v2/${runpodEndpoint}`
      : null);

  const arcwareEnabled = Boolean(arcwareShare || arcwareWs);
  const runpodEnabled = Boolean(runpodEndpoint || runpodBase);

  let provider: StreamSignalingConfig["provider"] =
    options.provider ?? "hybrid";
  if (!options.provider) {
    if (arcwareEnabled && runpodEnabled) provider = "hybrid";
    else if (arcwareEnabled) provider = "arcware";
    else if (runpodEnabled) provider = "runpod";
    else provider = "self_hosted";
  }

  const now = Date.now();
  const sessionId =
    options.sessionId?.trim().slice(0, 128) ||
    `ue5-${now.toString(36)}`;
  const roomId =
    options.roomId?.trim().slice(0, 64) || "spatial-universe-lumen";

  return {
    version: 50,
    protocol: "webrtc",
    engine: "ue5-lumen",
    provider,
    demoMode: !signalingUrl && !whipUrl && !arcwareEnabled && !runpodEnabled,
    iceServers: buildIceServers(),
    signaling: {
      path: "/api/spatial/stream-signaling",
      url: signalingUrl,
      whipUrl,
      methods: ["offer", "answer", "ice-candidate", "hangup"],
      ttlSec,
    },
    fallbacks: {
      webgl: true,
      arcware: {
        enabled: arcwareEnabled,
        shareUrl: arcwareShare,
        websocketUrl: arcwareWs,
        projectId: arcwareProject,
      },
      runpod: {
        enabled: runpodEnabled,
        endpointId: runpodEndpoint,
        baseUrl: runpodBase,
        webrtcPath: "/webrtc/offer",
      },
    },
    ue5: {
      pixelStreamingCompatible: true,
      preferredCodec: "H264",
      maxBitrateKbps: 12_000,
      startBitrateKbps: 4_000,
      latencyBudgetMs: 250,
      roomId,
    },
    session: {
      sessionId,
      expiresAt: new Date(now + ttlSec * 1000).toISOString(),
      fetchedAt: new Date(now).toISOString(),
    },
  };
}

export type SignalingMessage = {
  type: "offer" | "answer" | "ice-candidate" | "hangup";
  sessionId: string;
  sdp?: string;
  candidate?: Record<string, unknown>;
  from?: string;
};

type SignalingGlobals = {
  __ssUe5SignalingInbox?: Map<string, SignalingMessage[]>;
};

function inbox(): Map<string, SignalingMessage[]> {
  const g = globalThis as unknown as SignalingGlobals;
  if (!g.__ssUe5SignalingInbox) g.__ssUe5SignalingInbox = new Map();
  return g.__ssUe5SignalingInbox;
}

export function enqueueSignalingMessage(msg: SignalingMessage): number {
  const map = inbox();
  const list = map.get(msg.sessionId) ?? [];
  list.push(msg);
  if (list.length > 64) list.splice(0, list.length - 64);
  map.set(msg.sessionId, list);
  return list.length;
}

export function drainSignalingMessages(
  sessionId: string,
  afterIndex = 0
): SignalingMessage[] {
  const list = inbox().get(sessionId) ?? [];
  return list.slice(Math.max(0, afterIndex));
}
