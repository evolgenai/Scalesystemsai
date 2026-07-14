import { randomInt } from "crypto";

export function generateVerificationCode(length = 6): string {
  const max = 10 ** length;
  const n = randomInt(0, max);
  return n.toString().padStart(length, "0");
}

export function verificationExpiry(minutes = 15): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function isCodeActive(
  stored: string | null | undefined,
  expiresAt: Date | null | undefined,
  provided: string | null | undefined
): boolean {
  if (!stored || !expiresAt || !provided) return false;
  if (expiresAt.getTime() < Date.now()) return false;
  return stored.trim() === provided.trim();
}
