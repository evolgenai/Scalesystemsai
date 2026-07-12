import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export const INTEGRATION_PROVIDERS = [
  "hubspot",
  "salesforce",
  "openai",
  "slack",
  "sendgrid",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

function deriveKey(): Buffer {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();

  if (!secret || secret.length < 32) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be set (min 32 chars) to store integration credentials."
    );
  }

  return scryptSync(secret, "scalesystems-integration-v1", 32);
}

export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptCredential(ciphertext: string): string {
  const payload = Buffer.from(ciphertext, "base64");
  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + 16);
  const encrypted = payload.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return INTEGRATION_PROVIDERS.includes(value as IntegrationProvider);
}
