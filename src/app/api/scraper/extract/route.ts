/**
 * POST /api/scraper/extract
 * Playwright/Chromium deep scrape → structured JSON (+ optional Vercel Blob images).
 * Super-Admin session required (abuse / egress control).
 */

import { z } from "zod";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { apiFail, apiOk } from "@/lib/http/apiEnvelope";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { extractWithPlaywright } from "@/lib/scraper/playwrightExtract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ExtractBodySchema = z.object({
  url: z.string().trim().url().max(2_048),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle", "commit"])
    .default("networkidle"),
  timeoutMs: z.number().int().min(3_000).max(55_000).default(25_000),
  maxTextChars: z.number().int().min(500).max(100_000).default(24_000),
  extractImages: z.boolean().default(true),
  maxImages: z.number().int().min(0).max(20).default(8),
  viewport: z
    .object({
      width: z.number().int().min(320).max(2560),
      height: z.number().int().min(240).max(1440),
    })
    .optional(),
  blobNamespace: z.string().trim().max(64).optional(),
});

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.isSuperAdmin) {
    return apiFail(
      "Forbidden. SUPER_ADMIN session required.",
      "SUPER_ADMIN_REQUIRED",
      403,
      { "x-scraper-gate": "denied" }
    );
  }

  return apiOk(
    {
      protocol: "scalesystems.scraper.extract/v1",
      engine: "playwright-core + @sparticuz/chromium",
      capabilities: [
        "deep_js_render",
        "networkidle_wait",
        "image_extract_blob",
        "ssrf_guard",
      ],
      limits: {
        maxDurationSec: 60,
        maxImages: 20,
        maxTextChars: 100_000,
      },
    },
    { headers: { "x-scraper-gate": "super-admin" } }
  );
}

export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.isSuperAdmin) {
    return apiFail(
      "Forbidden. SUPER_ADMIN session required.",
      "SUPER_ADMIN_REQUIRED",
      403,
      { "x-scraper-gate": "denied" }
    );
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiFail("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = ExtractBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;

  try {
    const result = await extractWithPlaywright({
      url: body.url,
      waitUntil: body.waitUntil,
      timeoutMs: body.timeoutMs,
      maxTextChars: body.maxTextChars,
      extractImages: body.extractImages,
      maxImages: body.maxImages,
      viewport: body.viewport,
      blobNamespace:
        body.blobNamespace ??
        `scraper/${profile.id ?? "super-admin"}`,
      signal: request.signal,
    });

    if (!result.success) {
      return apiFail(
        result.error ?? "Playwright extract failed.",
        "SCRAPER_EXTRACT_FAILED",
        422,
        { "x-scraper-gate": "super-admin", "x-scraper-browser": result.browser }
      );
    }

    return apiOk(
      {
        extract: result,
        operator: {
          id: profile.id,
          email: profile.email,
          role: profile.role,
        },
      },
      {
        headers: {
          "x-scraper-gate": "super-admin",
          "x-scraper-browser": result.browser,
        },
      }
    );
  } catch (err) {
    console.error("[scraper/extract] failed:", err);
    return apiFail(
      err instanceof Error ? err.message : "Scraper pipeline failed.",
      "SCRAPER_PIPELINE_FAILED",
      503,
      { "x-scraper-gate": "super-admin" }
    );
  }
}
