import { createHash, randomBytes } from "crypto";

const API_KEY_PREFIX = "ss_live_";

export function generateAPIKey(): string {
  const secret = randomBytes(32).toString("hex");
  return `${API_KEY_PREFIX}${secret}`;
}

export function hashAPIKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}
