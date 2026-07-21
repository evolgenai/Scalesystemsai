/**
 * HMAC-signed session tokens for login responses.
 * Format: `ss_sess.<base64url(payload)>.<base64url(hmac)>`
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "ss_sess";
const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

export type SessionClaims = {
  sub: string;
  email: string;
  username: string | null;
  role: string;
  isSuperAdmin: boolean;
  iat: number;
  exp: number;
};

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function resolveSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.TOKEN_VAULT_KEY?.trim() ||
    "scalesystems-dev-auth-secret"
  );
}

export function issueSessionToken(
  claims: Omit<SessionClaims, "iat" | "exp">,
  ttlSec = DEFAULT_TTL_SEC
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionClaims = {
    ...claims,
    iat: now,
    exp: now + Math.max(60, ttlSec),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    createHmac("sha256", resolveSecret()).update(`${TOKEN_PREFIX}.${body}`).digest()
  );
  return `${TOKEN_PREFIX}.${body}.${sig}`;
}

export function verifySessionToken(
  token: string | null | undefined
): SessionClaims | null {
  const raw = token?.trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, body, sig] = parts;
  if (!body || !sig) return null;

  const expected = createHmac("sha256", resolveSecret())
    .update(`${TOKEN_PREFIX}.${body}`)
    .digest();
  let provided: Buffer;
  try {
    provided = fromB64url(sig);
  } catch {
    return null;
  }
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const claims = JSON.parse(fromB64url(body).toString("utf8")) as SessionClaims;
    if (
      typeof claims.sub !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
