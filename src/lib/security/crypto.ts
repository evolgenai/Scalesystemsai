import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/** Ciphertext envelope: ss:iv:authTag:ciphertext (all parts hex except prefix). */
const SECURE_PREFIX = "ss";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const HEX_KEY_LENGTH = KEY_BYTES * 2;

let cachedKey: Buffer | null = null;
let usedDevFallback = false;

function isHexKey(value: string): boolean {
  return value.length === HEX_KEY_LENGTH && /^[0-9a-fA-F]+$/.test(value);
}

/**
 * Resolve the 32-byte AES key from `PLUGINS_ENCRYPTION_KEY` (64-char hex).
 * Falls back to a process-lifetime derived development secret when unset/invalid.
 */
function resolvePluginsEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.PLUGINS_ENCRYPTION_KEY?.trim() ?? "";

  if (raw && isHexKey(raw)) {
    cachedKey = Buffer.from(raw, "hex");
    return cachedKey;
  }

  // Soft fallback — never crash local/dev when the env key is missing.
  usedDevFallback = true;
  const seed =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "scalesystems-dev-plugins-encryption-fallback";
  cachedKey = createHash("sha256").update(seed).digest();

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[security/crypto] PLUGINS_ENCRYPTION_KEY missing or invalid (need 64 hex chars). Using ephemeral development key."
    );
  }

  return cachedKey;
}

export function isUsingDevEncryptionFallback(): boolean {
  resolvePluginsEncryptionKey();
  return usedDevFallback;
}

/**
 * Encrypt a secret with AES-256-GCM.
 * @returns `ss:iv:authTag:ciphertext` (hex-encoded payload parts)
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt an empty secret.");
  }

  const key = resolvePluginsEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SECURE_PREFIX,
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypt a `ss:iv:authTag:ciphertext` envelope.
 * Never log or return the plaintext outside the caller’s controlled scope.
 */
export function decryptSecret(payload: string): string {
  const trimmed = payload?.trim();
  if (!trimmed) {
    throw new Error("Cannot decrypt an empty payload.");
  }

  const parts = trimmed.split(":");
  if (parts.length !== 4 || parts[0] !== SECURE_PREFIX) {
    throw new Error(
      'Invalid encrypted payload format — expected "ss:iv:authTag:ciphertext".'
    );
  }

  const [, ivHex, tagHex, cipherHex] = parts;
  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error("Malformed encrypted payload — missing envelope parts.");
  }

  const key = resolvePluginsEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");

  if (iv.length !== IV_BYTES) {
    throw new Error("Invalid IV length in encrypted payload.");
  }
  if (authTag.length !== 16) {
    throw new Error("Invalid auth tag length in encrypted payload.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === SECURE_PREFIX;
}
