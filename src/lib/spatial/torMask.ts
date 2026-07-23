/**
 * Tor Onion IP masking — randomized encrypted virtual IP + tunnel status
 * when an avatar interacts with `tor_node`.
 */

import {
  createCipheriv,
  createHash,
  randomBytes,
  randomInt,
} from "node:crypto";
import { z } from "zod";

export const TorMaskResultSchema = z.object({
  sessionId: z.string(),
  nodeId: z.string().nullable(),
  tunnel: z.object({
    status: z.enum(["established", "building", "degraded"]),
    circuitId: z.string(),
    hops: z.number().int().min(3).max(5),
    exitCountry: z.string(),
    establishedAt: z.string().datetime(),
  }),
  virtualIp: z.object({
    plaintextHint: z.string(),
    encrypted: z.string(),
    iv: z.string(),
    algorithm: z.literal("aes-256-gcm"),
    fingerprint: z.string(),
  }),
  sessionProxyRoute: z.object({
    entry: z.string(),
    middle: z.string(),
    exit: z.string(),
    socksPort: z.number().int(),
  }),
  matrixEffect: z.object({
    enabled: z.boolean(),
    durationMs: z.number().int(),
    glyphDensity: z.number(),
  }),
  expiresAt: z.string().datetime(),
});
export type TorMaskResult = z.infer<typeof TorMaskResultSchema>;

type TorGlobals = {
  __ssTorSessions?: Map<string, TorMaskResult>;
};

function torStore(): Map<string, TorMaskResult> {
  const g = globalThis as unknown as TorGlobals;
  if (!g.__ssTorSessions) g.__ssTorSessions = new Map();
  return g.__ssTorSessions;
}

function deriveKey(sessionId: string): Buffer {
  const salt =
    process.env.TOR_MASK_SECRET?.trim() ||
    process.env.SUPERADMIN_PIN?.trim() ||
    "scale-systems-tor-v48";
  return createHash("sha256")
    .update(`tor-mask:${salt}:${sessionId}`)
    .digest();
}

function randomVirtualIp(): string {
  // CGNAT-style presentation range for masked exits (not a real public IP).
  return `100.${randomInt(64, 127)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

const EXIT_COUNTRIES = ["se", "nl", "de", "ch", "is", "ro", "pl"] as const;

export type GenerateTorMaskOptions = {
  sessionId: string;
  nodeId?: string | null;
  hops?: number;
};

export function generateTorMask(
  options: GenerateTorMaskOptions
): TorMaskResult {
  const sessionId = options.sessionId.trim().slice(0, 128);
  const hops = Math.min(5, Math.max(3, options.hops ?? 3));
  const plaintextIp = randomVirtualIp();
  const iv = randomBytes(12);
  const key = deriveKey(sessionId);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintextIp, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const circuitId = createHash("sha256")
    .update(`${sessionId}:${plaintextIp}:${Date.now()}`)
    .digest("hex")
    .slice(0, 24);

  const exitCountry =
    EXIT_COUNTRIES[randomInt(0, EXIT_COUNTRIES.length)] ?? "nl";
  const now = Date.now();
  const establishedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();

  const result: TorMaskResult = {
    sessionId,
    nodeId: options.nodeId ?? null,
    tunnel: {
      status: "established",
      circuitId,
      hops,
      exitCountry,
      establishedAt,
    },
    virtualIp: {
      plaintextHint: plaintextIp.replace(/\.\d+$/, ".***"),
      encrypted: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      algorithm: "aes-256-gcm",
      fingerprint: createHash("sha256")
        .update(plaintextIp)
        .digest("hex")
        .slice(0, 16),
    },
    sessionProxyRoute: {
      entry: `tor-entry-${randomInt(1000, 9999)}.onion.local`,
      middle: `tor-mid-${randomInt(1000, 9999)}.onion.local`,
      exit: `tor-exit-${exitCountry}-${randomInt(100, 999)}.onion.local`,
      socksPort: 9050,
    },
    matrixEffect: {
      enabled: true,
      durationMs: 3200,
      glyphDensity: Number((0.35 + Math.random() * 0.45).toFixed(2)),
    },
    expiresAt,
  };

  torStore().set(sessionId, result);
  return result;
}

export function getTorMaskSession(sessionId: string): TorMaskResult | null {
  const entry = torStore().get(sessionId);
  if (!entry) return null;
  if (Date.now() > Date.parse(entry.expiresAt)) {
    torStore().delete(sessionId);
    return null;
  }
  return entry;
}
