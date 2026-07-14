import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be at least 32 characters."
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export type EncryptedBlob = {
  cipher: string;
  iv: string;
  tag: string;
};

/** AES-256-GCM encrypt developer integration secrets before DB persistence. */
export function encryptCredential(plaintext: string): EncryptedBlob {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredential(blob: EncryptedBlob): string {
  const key = deriveKey();
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(blob.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(blob.cipher, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** SHA-256 fingerprint for deduplication without decrypting stored secrets. */
export function fingerprintCredential(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}
