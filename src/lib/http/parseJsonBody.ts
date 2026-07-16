/**
 * Robust JSON body parse for telemetry (handles double-encoded strings).
 */
export async function parseJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) {
    throw new SyntaxError("Empty request body.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Common client mistake: sending a quoted JSON blob or PowerShell-escaped string
    const unwrapped = text.trim().replace(/^'+|'+$/g, "").replace(/^"+|"+$/g, "");
    parsed = JSON.parse(unwrapped);
  }

  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }

  return parsed;
}
