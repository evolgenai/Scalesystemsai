/**
 * Tenant credential vault — AES-256-GCM seal/unseal via Node crypto.
 * Envelope: `ssv1:iv:authTag:ciphertext` (hex parts). Never log plaintext.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const PREFIX = "ssv1";
const ALGORITHM = "aes-256-gcm" as const;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const HEX_KEY_LENGTH = KEY_BYTES * 2;

export type VaultSealResult = {
  cipher: string;
  keySource: "env" | "dev-fallback";
};

export type VaultJsonPayload = Record<string, unknown>;

let cachedKey: Buffer | null = null;
let usedDevFallback = false;

function isHexKey(value: string): boolean {
  return value.length === HEX_KEY_LENGTH && /^[0-9a-fA-F]+$/.test(value);
}

function resolveVaultKey(): { key: Buffer; source: "env" | "dev-fallback" } {
  if (cachedKey) {
    return {
      key: cachedKey,
      source: usedDevFallback ? "dev-fallback" : "env",
    };
  }

  const raw =
    process.env.VAULT_ENCRYPTION_KEY?.trim() ||
    process.env.PLUGINS_ENCRYPTION_KEY?.trim() ||
    "";

  if (raw && isHexKey(raw)) {
    cachedKey = Buffer.from(raw, "hex");
    usedDevFallback = false;
    return { key: cachedKey, source: "env" };
  }

  usedDevFallback = true;
  const seed =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "scalesystems-dev-vault-encryption-fallback";
  cachedKey = createHash("sha256").update(seed).digest();

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[crypto/vault] VAULT_ENCRYPTION_KEY missing/invalid (need 64 hex chars). Using development fallback key."
    );
  }

  return { key: cachedKey, source: "dev-fallback" };
}

export function isUsingVaultDevFallback(): boolean {
  resolveVaultKey();
  return usedDevFallback;
}

export function isVaultCipher(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return (
    parts.length === 4 &&
    parts[0] === PREFIX &&
    Boolean(parts[1]) &&
    Boolean(parts[2]) &&
    Boolean(parts[3])
  );
}

/** Seal plaintext into AES-256-GCM envelope. */
export function sealSecret(plaintext: string): VaultSealResult {
  if (!plaintext) {
    throw new Error("Cannot seal an empty secret.");
  }

  const { key, source } = resolveVaultKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    cipher: [
      PREFIX,
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted.toString("hex"),
    ].join(":"),
    keySource: source,
  };
}

/** Unseal vault envelope → plaintext. Caller must not leak result into API JSON. */
export function unsealSecret(envelope: string): string {
  const trimmed = envelope?.trim();
  if (!trimmed) {
    throw new Error("Cannot unseal an empty envelope.");
  }

  const parts = trimmed.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error(
      'Invalid vault envelope — expected "ssv1:iv:authTag:ciphertext".'
    );
  }

  const [, ivHex, tagHex, cipherHex] = parts;
  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error("Malformed vault envelope — missing parts.");
  }

  const { key } = resolveVaultKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");

  if (iv.length !== IV_BYTES) {
    throw new Error("Invalid vault IV length.");
  }
  if (authTag.length !== TAG_BYTES) {
    throw new Error("Invalid vault auth tag length.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function sealJson(payload: VaultJsonPayload): VaultSealResult {
  return sealSecret(JSON.stringify(payload));
}

export function unsealJson<T extends VaultJsonPayload = VaultJsonPayload>(
  envelope: string
): T {
  const raw = unsealSecret(envelope);
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Vault JSON payload must be a plain object.");
  }
  return parsed as T;
}

/** Mask for standard API responses — never emit raw keys or cipher blobs. */
export function maskSecret(
  value: string | null | undefined,
  visible = 4
): string {
  if (!value) return "";
  if (value.length <= visible) return "*".repeat(Math.max(value.length, 4));
  const head = value.slice(0, Math.min(visible, 6));
  return `${head}${"*".repeat(8)}…`;
}

export function maskApiKey(apiKey: string | null | undefined): string {
  if (!apiKey) return "";
  const prefix = apiKey.startsWith("ws_") ? "ws_" : apiKey.slice(0, 3);
  return `${prefix}${"*".repeat(12)}`;
}

/** Constant-time compare of two utf8 strings (after hash). */
export function safeEqualString(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Build a workspace credential blob (sealed) for injection.
 * Stores only ciphertext — plaintext apiKey stays in lookup column separately.
 */
export function sealWorkspaceCredentials(input: {
  apiKey: string;
  inject?: Record<string, string>;
}): VaultSealResult {
  return sealJson({
    kind: "workspace_credentials",
    apiKey: input.apiKey,
    inject: input.inject ?? {},
    sealedAt: new Date().toISOString(),
  });
}
