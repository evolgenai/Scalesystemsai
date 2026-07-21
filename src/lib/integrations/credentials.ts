/**
 * OAuth / API credential sealing for WorkspaceIntegration.credentialsEncrypted.
 * Persists AES-256-GCM envelopes only — never plaintext at rest.
 */

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/security/crypto";
import type { Prisma } from "@prisma/client";

export const IntegrationProviders = [
  "SHOPIFY",
  "SLACK",
  "DISCORD",
  "GOOGLE_SHEETS",
  "GITHUB",
] as const;

export type IntegrationProviderName = (typeof IntegrationProviders)[number];

export const ConnectIntegrationSchema = z.object({
  provider: z.enum(IntegrationProviders),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  /** Plaintext OAuth tokens / API keys — sealed before persist. */
  credentials: z.record(z.string(), z.unknown()).optional().default({}),
  /** Upsert when a row already exists for this workspace + provider. */
  upsert: z.boolean().default(true),
});

export const UpdateIntegrationSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  markSynced: z.boolean().optional(),
});

export type ConnectIntegrationInput = z.infer<typeof ConnectIntegrationSchema>;
export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationSchema>;

type SealedEnvelope = {
  sealed: string;
  version: 1;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Seal arbitrary credential JSON into credentialsEncrypted shape.
 */
export function sealCredentials(
  credentials: Record<string, unknown>
): Prisma.InputJsonValue {
  const sealed = encryptSecret(JSON.stringify(credentials));
  const envelope: SealedEnvelope = { sealed, version: 1 };
  return envelope as unknown as Prisma.InputJsonValue;
}

/**
 * Unseal credentialsEncrypted. Returns {} when empty / malformed.
 * Never log the returned plaintext.
 */
export function unsealCredentials(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};

  const sealed = typeof raw.sealed === "string" ? raw.sealed : null;
  if (!sealed || !isEncryptedSecret(sealed)) return {};

  try {
    const parsed: unknown = JSON.parse(decryptSecret(sealed));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Public projection — never leaks sealed ciphertext or plaintext secrets.
 */
export function toPublicIntegration<
  T extends {
    id: string;
    workspaceId: string;
    provider: string;
    status: string;
    credentialsEncrypted: unknown;
    lastSyncedAt: Date | null;
    createdAt: Date;
  },
>(row: T) {
  const sealed =
    isPlainObject(row.credentialsEncrypted) &&
    typeof row.credentialsEncrypted.sealed === "string" &&
    isEncryptedSecret(row.credentialsEncrypted.sealed);

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    status: row.status,
    hasCredentials: Boolean(sealed),
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  };
}

/** Constant-time compare for webhook secrets (length mismatch → false). */
export function safeEqualSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still run a compare to reduce trivial timing leaks on length.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function extractWebhookSecret(request: Request): string | null {
  const header =
    request.headers.get("x-webhook-secret")?.trim() ||
    request.headers.get("x-signature-secret")?.trim() ||
    "";
  if (header) return header;

  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token || null;
  }

  return null;
}
