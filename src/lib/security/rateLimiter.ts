/**
 * Sliding-window rate limiter for `/api/*`.
 * Tenant-aware: prefers `x-workspace-key`, else client IP.
 * Headers: X-RateLimit-Limit | X-RateLimit-Remaining | X-RateLimit-Reset
 */

export type RateLimitConfig = {
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Optional route/bucket suffix (e.g. "health", "billing"). */
  bucket?: string;
};

export type RateLimitVerdict = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix epoch seconds when the current window resets. */
  reset: number;
  /** Milliseconds until reset (for Retry-After). */
  retryAfterMs: number;
  key: string;
};

export type RateLimitHeaders = {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
  "Retry-After"?: string;
};

type WindowEntry = {
  /** Request timestamps (ms) inside the active window. */
  hits: number[];
};

const DEFAULT_CONFIG: RateLimitConfig = {
  limit: Number.parseInt(process.env.API_RATE_LIMIT ?? "120", 10) || 120,
  windowMs:
    Number.parseInt(process.env.API_RATE_WINDOW_MS ?? "60000", 10) || 60_000,
};

/** Stricter defaults for credit-burning / expensive surfaces. */
export const RATE_LIMIT_PRESETS = {
  default: DEFAULT_CONFIG,
  health: { limit: 60, windowMs: 60_000, bucket: "health" } satisfies RateLimitConfig,
  auth: { limit: 30, windowMs: 60_000, bucket: "auth" } satisfies RateLimitConfig,
  billing: { limit: 40, windowMs: 60_000, bucket: "billing" } satisfies RateLimitConfig,
  swarm: { limit: 20, windowMs: 60_000, bucket: "swarm" } satisfies RateLimitConfig,
  marketplace: {
    limit: 90,
    windowMs: 60_000,
    bucket: "marketplace",
  } satisfies RateLimitConfig,
} as const;

const globalStore = globalThis as unknown as {
  __ssRateLimitStore?: Map<string, WindowEntry>;
};

function getStore(): Map<string, WindowEntry> {
  if (!globalStore.__ssRateLimitStore) {
    globalStore.__ssRateLimitStore = new Map();
  }
  return globalStore.__ssRateLimitStore;
}

function prune(entry: WindowEntry, windowStart: number): void {
  while (entry.hits.length > 0 && entry.hits[0]! < windowStart) {
    entry.hits.shift();
  }
}

/** Periodically drop idle keys to bound memory in long-lived isolates. */
function maybeGc(store: Map<string, WindowEntry>, now: number, windowMs: number): void {
  if (store.size < 2_000) return;
  const cutoff = now - windowMs * 2;
  for (const [key, entry] of store) {
    prune(entry, cutoff);
    if (entry.hits.length === 0) store.delete(key);
  }
}

/**
 * Resolve a stable rate-limit identity.
 * Prefers workspace tenant key for multi-tenant isolation.
 */
export function resolveRateLimitIdentity(request: Request): string {
  const workspaceKey =
    request.headers.get("x-workspace-key")?.trim() ||
    request.headers.get("x-workspace-api-key")?.trim() ||
    "";
  if (workspaceKey) {
    return `ws:${workspaceKey.slice(0, 128)}`;
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  const ip = forwarded || realIp || cfIp || "anonymous";
  return `ip:${ip.slice(0, 64)}`;
}

export function buildRateLimitKey(
  identity: string,
  config: RateLimitConfig
): string {
  const bucket = config.bucket?.trim() || "api";
  return `${bucket}:${identity}`;
}

/**
 * Sliding-window check. Records the hit when allowed.
 */
export function checkRateLimit(
  identityOrRequest: string | Request,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitVerdict {
  const now = Date.now();
  const limit = Math.max(1, config.limit);
  const windowMs = Math.max(1_000, config.windowMs);
  const identity =
    typeof identityOrRequest === "string"
      ? identityOrRequest
      : resolveRateLimitIdentity(identityOrRequest);
  const key = buildRateLimitKey(identity, config);
  const store = getStore();
  maybeGc(store, now, windowMs);

  const windowStart = now - windowMs;
  let entry = store.get(key);
  if (!entry) {
    entry = { hits: [] };
    store.set(key, entry);
  }

  prune(entry, windowStart);

  const oldest = entry.hits[0];
  const resetMs = oldest != null ? oldest + windowMs : now + windowMs;
  const reset = Math.ceil(resetMs / 1000);

  if (entry.hits.length >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      reset,
      retryAfterMs: Math.max(0, resetMs - now),
      key,
    };
  }

  entry.hits.push(now);
  const remaining = Math.max(0, limit - entry.hits.length);
  const nextOldest = entry.hits[0]!;
  const nextResetMs = nextOldest + windowMs;

  return {
    allowed: true,
    limit,
    remaining,
    reset: Math.ceil(nextResetMs / 1000),
    retryAfterMs: Math.max(0, nextResetMs - now),
    key,
  };
}

export function rateLimitHeaders(verdict: RateLimitVerdict): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    "X-RateLimit-Limit": String(verdict.limit),
    "X-RateLimit-Remaining": String(verdict.remaining),
    "X-RateLimit-Reset": String(verdict.reset),
  };
  if (!verdict.allowed) {
    headers["Retry-After"] = String(
      Math.max(1, Math.ceil(verdict.retryAfterMs / 1000))
    );
  }
  return headers;
}

export function applyRateLimitHeaders(
  headers: Headers,
  verdict: RateLimitVerdict
): void {
  const rl = rateLimitHeaders(verdict);
  headers.set("X-RateLimit-Limit", rl["X-RateLimit-Limit"]);
  headers.set("X-RateLimit-Remaining", rl["X-RateLimit-Remaining"]);
  headers.set("X-RateLimit-Reset", rl["X-RateLimit-Reset"]);
  if (rl["Retry-After"]) {
    headers.set("Retry-After", rl["Retry-After"]);
  }
}

/**
 * Pick a preset from the request pathname.
 */
export function resolveRateLimitConfig(pathname: string): RateLimitConfig {
  if (pathname === "/api/health" || pathname.startsWith("/api/health/")) {
    return RATE_LIMIT_PRESETS.health;
  }
  if (pathname.startsWith("/api/auth/")) {
    return RATE_LIMIT_PRESETS.auth;
  }
  if (
    pathname.startsWith("/api/billing/") ||
    pathname.startsWith("/api/checkout/") ||
    pathname.startsWith("/api/webhooks/")
  ) {
    return RATE_LIMIT_PRESETS.billing;
  }
  if (
    pathname.startsWith("/api/agents/") ||
    pathname.startsWith("/api/v1/agents/") ||
    pathname === "/api/agent"
  ) {
    return RATE_LIMIT_PRESETS.swarm;
  }
  if (pathname.startsWith("/api/marketplace/")) {
    return RATE_LIMIT_PRESETS.marketplace;
  }
  return { ...RATE_LIMIT_PRESETS.default, bucket: "api" };
}

/**
 * Enforce limit for route handlers (Node runtime).
 * Returns a JSON 429 Response when blocked; otherwise null + headers to merge.
 */
export function enforceRateLimit(
  request: Request,
  config?: RateLimitConfig
): { blocked: Response; verdict: RateLimitVerdict } | {
  blocked: null;
  verdict: RateLimitVerdict;
  headers: RateLimitHeaders;
} {
  const pathname = (() => {
    try {
      return new URL(request.url).pathname;
    } catch {
      return "/api";
    }
  })();

  const resolved = config ?? resolveRateLimitConfig(pathname);
  const verdict = checkRateLimit(request, resolved);
  const headers = rateLimitHeaders(verdict);

  if (!verdict.allowed) {
    return {
      blocked: new Response(
        JSON.stringify({
          success: false,
          error: "Rate limit exceeded. Slow down and retry after the reset window.",
          code: "RATE_LIMIT_EXCEEDED",
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            ...headers,
          },
        }
      ),
      verdict,
    };
  }

  return { blocked: null, verdict, headers };
}

/** Test / ops helper — clear in-memory windows. */
export function resetRateLimitStore(): void {
  getStore().clear();
}
