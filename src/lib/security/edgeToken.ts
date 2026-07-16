/**
 * Edge-compatible agent token helpers (Web Crypto only — no node:crypto).
 * Envelope format mirrors src/lib/security/crypto.ts: `ss:iv:authTag:ciphertext`.
 */

const SECURE_PREFIX = "ss";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const LIVE_KEY_RE =
  /^ss_(?:live|test)_[0-9a-f]{8}_[0-9a-f]{16}_[0-9a-f]{16,40}$/i;

export type EdgeTokenVerdict =
  | { ok: true; mode: "live_key" | "sealed" | "pass_through"; subject?: string }
  | { ok: false; reason: string };

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("Invalid hex encoding.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Copy into a fresh ArrayBuffer-backed view for Web Crypto BufferSource typing. */
function asBufferSource(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function resolveEdgeAesKey(): Promise<CryptoKey> {
  const raw =
    process.env.TOKEN_VAULT_KEY?.trim() ||
    process.env.PLUGINS_ENCRYPTION_KEY?.trim() ||
    "";

  let keyBytes: Uint8Array<ArrayBuffer>;
  if (raw.length === KEY_BYTES * 2 && /^[0-9a-fA-F]+$/.test(raw)) {
    keyBytes = hexToBytes(raw);
  } else {
    const seed =
      process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
      process.env.AUTH_SECRET?.trim() ||
      "scalesystems-dev-token-vault-fallback";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(seed)
    );
    keyBytes = asBufferSource(new Uint8Array(digest));
  }

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
}

/** Decrypt `ss:iv:tag:cipher` envelopes on the Edge runtime. */
export async function decryptSealedEdgeToken(
  payload: string
): Promise<string> {
  const parts = payload.trim().split(":");
  if (parts.length !== 4 || parts[0] !== SECURE_PREFIX) {
    throw new Error("Invalid sealed token envelope.");
  }

  const [, ivHex, tagHex, cipherHex] = parts;
  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error("Malformed sealed token envelope.");
  }

  const iv = hexToBytes(ivHex);
  const authTag = hexToBytes(tagHex);
  const ciphertext = hexToBytes(cipherHex);
  if (iv.length !== IV_BYTES || authTag.length !== 16) {
    throw new Error("Invalid IV or auth tag length.");
  }

  const key = await resolveEdgeAesKey();
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(iv), tagLength: 128 },
    key,
    asBufferSource(combined)
  );
  return new TextDecoder().decode(plainBuf);
}

export function isSealedTokenEnvelope(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === SECURE_PREFIX;
}

export function isLiveAgentKey(value: string): boolean {
  return LIVE_KEY_RE.test(value.trim());
}

/**
 * Ultra-fast Edge gate:
 * - `ss_live_*` / `ss_test_*` opaque keys → structural + optional HMAC allowlist check
 * - `ss:...` sealed envelopes → AES-GCM decrypt + JSON claims parse
 */
export async function verifyAgentEdgeToken(
  rawToken: string | null | undefined
): Promise<EdgeTokenVerdict> {
  const token = rawToken?.trim();
  if (!token) {
    return { ok: false, reason: "Missing agent token." };
  }

  if (isLiveAgentKey(token)) {
    const allowHash = process.env.AGENT_TOKEN_ALLOWLIST_HASH?.trim();
    if (allowHash) {
      const hash = await sha256Hex(token);
      if (hash !== allowHash.toLowerCase()) {
        return { ok: false, reason: "Agent key not in allowlist." };
      }
    }
    return { ok: true, mode: "live_key", subject: token.slice(0, 16) };
  }

  if (isSealedTokenEnvelope(token)) {
    try {
      const plaintext = await decryptSealedEdgeToken(token);
      let subject: string | undefined;
      try {
        const claims = JSON.parse(plaintext) as {
          sub?: string;
          exp?: number;
        };
        if (
          typeof claims.exp === "number" &&
          Number.isFinite(claims.exp) &&
          claims.exp * 1000 < Date.now()
        ) {
          return { ok: false, reason: "Sealed agent token expired." };
        }
        subject = typeof claims.sub === "string" ? claims.sub : undefined;
      } catch {
        subject = plaintext.slice(0, 64);
      }
      return { ok: true, mode: "sealed", subject };
    } catch {
      return { ok: false, reason: "Sealed agent token decryption failed." };
    }
  }

  return { ok: false, reason: "Unrecognized agent token format." };
}

export function extractAgentToken(request: Request): string | null {
  const headerToken = request.headers.get("x-agent-token")?.trim();
  if (headerToken) return headerToken;

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  return null;
}
