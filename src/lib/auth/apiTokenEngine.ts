import { createHash, randomBytes } from "crypto";
import { getPrisma } from "@/lib/prisma";

const TOKEN_PREFIX = "sk_live_";

export type ApiKeyAuthContext = {
  apiKeyId: string;
  userId: string;
  orgId: string | null;
};

export type ApiKeyAuthResult =
  | { ok: true; context: ApiKeyAuthContext }
  | { ok: false; status: 401; message: string };

/** Secure random token: `sk_live_` + 32 hex chars (never stored raw). */
export function generateApiKey(): string {
  const secret = randomBytes(16).toString("hex");
  return `${TOKEN_PREFIX}${secret}`;
}

/** SHA-256 digest for at-rest storage and constant-time DB lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function extractBearerOrApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const headerKey = request.headers.get("x-api-key")?.trim();
  return headerKey || null;
}

/**
 * Validates API key from `Authorization: Bearer` or `x-api-key`,
 * updates `lastUsedAt`, and returns workspace scope.
 */
export async function authenticateApiKey(
  request: Request
): Promise<ApiKeyAuthResult> {
  const raw = extractBearerOrApiKey(request);
  if (!raw) {
    return { ok: false, status: 401, message: "Missing API key." };
  }

  const hashedKey = hashToken(raw);

  try {
    const row = await getPrisma().apiKey.findUnique({
      where: { hashedKey },
      select: { id: true, userId: true, orgId: true },
    });

    if (!row) {
      return { ok: false, status: 401, message: "Invalid API key." };
    }

    await getPrisma().apiKey.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      ok: true,
      context: {
        apiKeyId: row.id,
        userId: row.userId,
        orgId: row.orgId,
      },
    };
  } catch (error) {
    console.error("[api-token] authenticate failed", error);
    return { ok: false, status: 401, message: "API key validation failed." };
  }
}

export function visibleKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, Math.min(12, rawKey.length));
}
