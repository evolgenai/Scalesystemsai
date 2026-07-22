/**
 * Sliding-window rate limit for failed Superadmin PIN attempts.
 * Limits both HTTP responses and Sentry security telemetry spam.
 */

export type PinRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  failureCount: number;
};

type Bucket = {
  failures: number[];
  sentryLogs: number[];
};

type RateGlobals = {
  __ssSpatialPinRateLimit?: Map<string, Bucket>;
};

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;
const MAX_SENTRY_LOGS_PER_WINDOW = 3;

function store(): Map<string, Bucket> {
  const g = globalThis as unknown as RateGlobals;
  if (!g.__ssSpatialPinRateLimit) {
    g.__ssSpatialPinRateLimit = new Map();
  }
  return g.__ssSpatialPinRateLimit;
}

function prune(times: number[], now: number): number[] {
  return times.filter((t) => now - t < WINDOW_MS);
}

function bucket(key: string): Bucket {
  const map = store();
  let b = map.get(key);
  if (!b) {
    b = { failures: [], sentryLogs: [] };
    map.set(key, b);
  }
  return b;
}

export function checkPinFailureRateLimit(key: string): PinRateLimitResult {
  const now = Date.now();
  const b = bucket(key);
  b.failures = prune(b.failures, now);
  const failureCount = b.failures.length;
  const allowed = failureCount < MAX_FAILURES;
  const oldest = b.failures[0];
  const retryAfterSec =
    allowed || oldest == null
      ? 0
      : Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));

  return {
    allowed,
    remaining: Math.max(0, MAX_FAILURES - failureCount),
    retryAfterSec,
    failureCount,
  };
}

export function recordPinFailure(key: string): PinRateLimitResult {
  const now = Date.now();
  const b = bucket(key);
  b.failures = prune(b.failures, now);
  b.failures.push(now);
  return checkPinFailureRateLimit(key);
}

/** Whether another security telemetry event may be sent to Sentry. */
export function allowSecuritySentryLog(key: string): boolean {
  const now = Date.now();
  const b = bucket(key);
  b.sentryLogs = prune(b.sentryLogs, now);
  if (b.sentryLogs.length >= MAX_SENTRY_LOGS_PER_WINDOW) return false;
  b.sentryLogs.push(now);
  return true;
}

export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const session =
    request.headers.get("x-spatial-session")?.trim() ||
    request.headers.get("x-request-id")?.trim();
  return `pin:${forwarded || realIp || session || "anon"}`;
}
