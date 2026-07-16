/**
 * SSRF guardrails for outbound plugin / scraper / MCP HTTP calls.
 * Blocks loopback, link-local, and RFC1918 private ranges.
 * Loopback is allowed only when `allowLoopback` is true (development MCP).
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => Number.isNaN(n) || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "::1") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("fe80")) return true;
  return false;
}

function isLoopbackHost(host: string): boolean {
  return (
    LOOPBACK_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

export type AssertHttpUrlOptions = {
  /** Permit localhost / 127.0.0.1 (never metadata or RFC1918). */
  allowLoopback?: boolean;
};

/**
 * Validate that a destination is a public http(s) URL (no private/loopback SSRF targets).
 */
export function assertPublicHttpUrl(
  raw: string,
  options: AssertHttpUrlOptions = {}
): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL — expected an absolute http(s) address.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }

  const host = parsed.hostname.toLowerCase();
  const allowLoopback = options.allowLoopback === true;

  if (host === "metadata.google.internal" || host === "metadata.google") {
    throw new Error(
      "Blocked host — local and metadata endpoints are not allowed."
    );
  }

  if (isLoopbackHost(host)) {
    if (!allowLoopback) {
      throw new Error(
        "Blocked host — local and metadata endpoints are not allowed."
      );
    }
    return parsed;
  }

  if (
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error(
      "Blocked host — local and metadata endpoints are not allowed."
    );
  }

  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error(
      "Blocked host — private network addresses are not allowed."
    );
  }

  return parsed;
}

/** MCP outbound target — loopback only in non-production. */
export function assertMcpTargetUrl(raw: string): URL {
  const allowLoopback = process.env.NODE_ENV !== "production";
  return assertPublicHttpUrl(raw, { allowLoopback });
}
