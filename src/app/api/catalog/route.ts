/**
 * GET /api/catalog — official Scale Systems AI catalog
 * (agent templates, MCP plugins, sandbox blueprints).
 *
 * Strongly typed + in-memory TTL cache. No auth required for the public
 * official catalog surface (workspace items remain on /api/items).
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  CatalogKindSchema,
  CATALOG_CACHE_TTL_SEC,
  buildOfficialCatalogResponse,
  getOfficialCatalogItemBySlug,
  type OfficialCatalogResponse,
} from "@/lib/catalog/officialCatalog";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CacheEntry = {
  expiresAt: number;
  key: string;
  payload: OfficialCatalogResponse;
};

type CatalogGlobals = {
  __ssOfficialCatalogCache?: Map<string, CacheEntry>;
};

const g = globalThis as unknown as CatalogGlobals;

function cacheStore(): Map<string, CacheEntry> {
  if (!g.__ssOfficialCatalogCache) {
    g.__ssOfficialCatalogCache = new Map();
  }
  return g.__ssOfficialCatalogCache;
}

function cacheKey(kind: string | null, q: string | null, slug: string | null): string {
  return `${kind ?? "*"}::${q ?? ""}::${slug ?? "*"}`;
}

function getCached(key: string): OfficialCatalogResponse | null {
  const entry = cacheStore().get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore().delete(key);
    return null;
  }
  return entry.payload;
}

function setCached(key: string, payload: OfficialCatalogResponse): void {
  cacheStore().set(key, {
    key,
    payload,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_SEC * 1000,
  });
}

const QuerySchema = z.object({
  kind: CatalogKindSchema.optional(),
  q: z.string().trim().max(120).optional(),
  slug: z.string().trim().max(128).optional(),
});

export async function GET(request: Request) {
  const telemetry = telemetryContextFromRequest(request, {
    source: "catalog",
    route: "/api/catalog",
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const url = new URL(request.url);
      const parsed = QuerySchema.safeParse({
        kind: url.searchParams.get("kind") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
        slug: url.searchParams.get("slug") ?? undefined,
      });

      if (!parsed.success) {
        return apiError(
          parsed.error.issues[0]?.message ?? "Invalid catalog query.",
          "INVALID_QUERY",
          400
        );
      }

      const { kind = null, q = null, slug = null } = {
        kind: parsed.data.kind ?? null,
        q: parsed.data.q ?? null,
        slug: parsed.data.slug ?? null,
      };

      if (slug) {
        const key = cacheKey(null, null, slug);
        const cached = getCached(key);
        if (cached) {
          return apiSuccess(
            { ...cached, cache: "HIT" as const },
            200,
            {
              "cache-control": `public, max-age=${CATALOG_CACHE_TTL_SEC}, stale-while-revalidate=60`,
              "x-catalog-cache": "HIT",
            }
          );
        }

        const item = getOfficialCatalogItemBySlug(slug);
        if (!item) {
          return apiError(`Catalog item '${slug}' not found.`, "NOT_FOUND", 404);
        }

        const payload = buildOfficialCatalogResponse({
          kind: item.kind,
          q: item.slug,
        });
        // Narrow to the single slug match.
        payload.items = [item];
        payload.counts = {
          total: 1,
          agent_template: item.kind === "agent_template" ? 1 : 0,
          mcp_plugin: item.kind === "mcp_plugin" ? 1 : 0,
          sandbox_blueprint: item.kind === "sandbox_blueprint" ? 1 : 0,
        };
        setCached(key, payload);

        return apiSuccess(
          { ...payload, cache: "MISS" as const },
          200,
          {
            "cache-control": `public, max-age=${CATALOG_CACHE_TTL_SEC}, stale-while-revalidate=60`,
            "x-catalog-cache": "MISS",
          }
        );
      }

      const key = cacheKey(kind, q, null);
      const cached = getCached(key);
      if (cached) {
        return apiSuccess(
          { ...cached, cache: "HIT" as const },
          200,
          {
            "cache-control": `public, max-age=${CATALOG_CACHE_TTL_SEC}, stale-while-revalidate=60`,
            "x-catalog-cache": "HIT",
          }
        );
      }

      const payload = buildOfficialCatalogResponse({ kind, q });
      setCached(key, payload);

      return apiSuccess(
        { ...payload, cache: "MISS" as const },
        200,
        {
          "cache-control": `public, max-age=${CATALOG_CACHE_TTL_SEC}, stale-while-revalidate=60`,
          "x-catalog-cache": "MISS",
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, {
      ...telemetry,
      source: "catalog",
      level: "error",
    });
    return apiError(
      error instanceof Error ? error.message : "Catalog lookup failed.",
      "CATALOG_ERROR",
      500
    );
  }
}

export async function POST() {
  return apiError(
    "Catalog is read-only. Use GET /api/catalog.",
    "METHOD_NOT_ALLOWED",
    405
  );
}
