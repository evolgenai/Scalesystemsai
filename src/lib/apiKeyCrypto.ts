import { createHash, randomBytes } from "crypto";

const API_KEY_PREFIX = "ss_live_";

/** Cryptographically random API token — raw value shown once to the operator. */
export function generateAPIKey(): string {
  const secret = randomBytes(32).toString("hex");
  return `${API_KEY_PREFIX}${secret}`;
}

/** SHA-256 digest for secure at-rest lookup without storing plaintext. */
export function hashAPIKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}
