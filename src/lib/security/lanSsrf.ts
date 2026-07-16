/**
 * LAN-only URL / IP guard for estate IoT hardware bridges.
 * Allows RFC1918 + optional loopback; blocks public internet & cloud metadata (SSRF).
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  if (parts.some((n) => Number.isNaN(n) || n > 255)) return null;
  return parts;
}

/** True for 10/8, 172.16/12, 192.168/16 (not link-local 169.254). */
export function isLanIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export type AssertLanHttpUrlOptions = {
  /** Allow 127.0.0.1 / localhost (lab relays). Default false in production. */
  allowLoopback?: boolean;
};

function allowLoopbackDefault(options: AssertLanHttpUrlOptions): boolean {
  return (
    options.allowLoopback === true ||
    (options.allowLoopback !== false && process.env.NODE_ENV !== "production")
  );
}

/** Validate bare IPv4 is RFC1918 (or loopback when allowed). Returns cleaned IP. */
export function assertLanTargetIp(
  raw: string,
  options: AssertLanHttpUrlOptions = {}
): string {
  const host = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]!
    .split(":")[0]!
    .toLowerCase();

  if (
    host === "metadata.google.internal" ||
    host === "metadata.google" ||
    host.endsWith(".internal")
  ) {
    throw new Error("Blocked host — cloud metadata is not allowed.");
  }

  const v4 = parseIpv4(host);
  if (v4 && v4[0] === 169 && v4[1] === 254) {
    throw new Error("Blocked host — link-local addresses are not allowed.");
  }

  if (LOOPBACK.has(host) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    if (!allowLoopbackDefault(options)) {
      throw new Error("Loopback device IPs are disabled in this environment.");
    }
    return host === "localhost" ? "127.0.0.1" : host;
  }

  if (isLanIpv4(host)) return host;

  throw new Error(
    "targetIp must be RFC1918 private (10/8, 172.16/12, 192.168/16)."
  );
}

/**
 * Estate device endpoints must resolve to private LAN http(s) only.
 */
export function assertLanHttpUrl(
  raw: string,
  options: AssertLanHttpUrlOptions = {}
): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid device URL — expected absolute http(s).");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Device URL must be http or https.");
  }

  assertLanTargetIp(parsed.hostname, options);
  return parsed;
}

/** Build http://ip[:port]/path from ipAddress + optional path. */
export function buildDeviceEndpoint(
  ipAddress: string | null | undefined,
  endpointUrl: string | null | undefined,
  fallbackPath = "/"
): string | null {
  const url = endpointUrl?.trim();
  if (url) return url;

  const ip = ipAddress?.trim();
  if (!ip) return null;

  if (ip.startsWith("http://") || ip.startsWith("https://")) {
    return ip;
  }

  const path = fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`;
  return `http://${ip}${path}`;
}
