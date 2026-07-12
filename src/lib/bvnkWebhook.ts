import { createHmac, timingSafeEqual } from "crypto";

export function verifyBvnkWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  try {
    const received = Buffer.from(signatureHeader, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (received.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(received, expectedBuffer);
  } catch {
    return signatureHeader === expected;
  }
}
