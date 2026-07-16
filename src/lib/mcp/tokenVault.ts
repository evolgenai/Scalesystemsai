import { createHash, randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { generateAPIKey } from "@/lib/generateAPIKey";

export type VaultTokenClaims = {
  sub: string;
  scopes: string[];
  orgId?: string;
  iat: number;
  exp?: number;
};

export type IssuedVaultToken = {
  /** One-time plaintext live key — store only prefix + hash. */
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
  /** Sealed claims envelope for Edge middleware (`ss:...`). */
  sealedClaims: string;
};

export function hashAgentKey(rawKey: string): string {
  return createHash("sha256").update(rawKey.trim()).digest("hex");
}

export function agentKeyPrefix(rawKey: string): string {
  return rawKey.trim().slice(0, 16);
}

/**
 * Issue a live agent key + sealed Edge claims envelope (Token Vault pattern).
 * Persist `keyPrefix` + `keyHash` + `sealedClaims` — never persist `rawKey`.
 */
export async function issueVaultToken(params: {
  subject: string;
  scopes?: string[];
  orgId?: string;
  ttlSeconds?: number;
}): Promise<IssuedVaultToken> {
  const rawKey = await generateAPIKey();
  const now = Math.floor(Date.now() / 1000);
  const claims: VaultTokenClaims = {
    sub: params.subject,
    scopes: params.scopes ?? ["agent:run", "mcp:list"],
    orgId: params.orgId,
    iat: now,
    exp: params.ttlSeconds ? now + params.ttlSeconds : undefined,
  };

  return {
    rawKey,
    keyPrefix: agentKeyPrefix(rawKey),
    keyHash: hashAgentKey(rawKey),
    sealedClaims: encryptSecret(JSON.stringify(claims)),
  };
}

export function parseSealedClaims(sealed: string): VaultTokenClaims {
  const plaintext = decryptSecret(sealed);
  const parsed = JSON.parse(plaintext) as VaultTokenClaims;
  if (!parsed?.sub || !Array.isArray(parsed.scopes)) {
    throw new Error("Invalid vault claims payload.");
  }
  return parsed;
}

/** Create a short opaque rotation nonce (not a full API key). */
export function rotationNonce(): string {
  return randomBytes(16).toString("hex");
}
