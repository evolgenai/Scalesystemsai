/**
 * Generates a cryptographically random production API token.
 * Raw keys are returned once to the caller — never persisted here.
 */
export async function generateAPIKey(): Promise<string> {
  const entropy = new Uint8Array(32);
  crypto.getRandomValues(entropy);

  const segment = Array.from(entropy, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `ss_live_${segment.slice(0, 8)}_${segment.slice(8, 24)}_${segment.slice(24)}`;
}
