/**
 * Edge / CDN cache-control helpers for non-mutating public surfaces.
 * Applies `s-maxage=60, stale-while-revalidate=300` on safe GET/HEAD responses.
 * Mutating methods always receive `no-store`.
 */

export const EDGE_CACHE_S_MAXAGE = 60 as const;
export const EDGE_CACHE_SWR = 300 as const;

/** Shared CDN directive for marketplace, health, and template GETs. */
export const EDGE_CACHE_DIRECTIVE =
  `public, s-maxage=${EDGE_CACHE_S_MAXAGE}, stale-while-revalidate=${EDGE_CACHE_SWR}` as const;

export const EDGE_NO_STORE = "no-store" as const;

export type EdgeCachePreset = "marketplace" | "health" | "templates";

export type EdgeCacheHeaderBag = {
  "cache-control": string;
  vary?: string;
  "cdn-cache-control"?: string;
  "x-scale-cache-preset": EdgeCachePreset | "no-store";
};

const PRESET_VARY: Record<EdgeCachePreset, string | undefined> = {
  // Tenant key / auth can alter marketplace listings — vary for isolation.
  marketplace: "Accept, Authorization, x-workspace-key, x-workspace-api-key",
  health: "Accept",
  templates: "Accept",
};

/**
 * True for HTTP methods that must never be CDN-cached.
 */
export function isMutatingMethod(method: string): boolean {
  const m = method.trim().toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}

/**
 * Build Cache-Control (+ Vary) headers for a named public/edge preset.
 * Mutating methods always return no-store regardless of preset.
 */
export function edgeCacheHeaders(
  preset: EdgeCachePreset,
  method = "GET"
): EdgeCacheHeaderBag {
  if (isMutatingMethod(method)) {
    return {
      "cache-control": EDGE_NO_STORE,
      "x-scale-cache-preset": "no-store",
    };
  }

  const vary = PRESET_VARY[preset];
  return {
    "cache-control": EDGE_CACHE_DIRECTIVE,
    "cdn-cache-control": EDGE_CACHE_DIRECTIVE,
    ...(vary ? { vary } : {}),
    "x-scale-cache-preset": preset,
  };
}

/**
 * Merge edge cache headers into an existing HeadersInit without clobbering
 * unrelated keys. Explicit caller headers win on collision.
 */
export function withEdgeCache(
  preset: EdgeCachePreset,
  method = "GET",
  extra?: HeadersInit
): HeadersInit {
  const base = edgeCacheHeaders(preset, method);
  if (!extra) return base;

  const merged = new Headers();
  for (const [k, v] of Object.entries(base)) {
    if (v != null) merged.set(k, String(v));
  }
  const overlay = new Headers(extra);
  overlay.forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}
