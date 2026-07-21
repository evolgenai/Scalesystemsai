/**
 * Affiliate / referral tracking API hub.
 *
 * Canonical paths (App Router folders):
 *   GET  /api/affiliate/stats
 *   POST /api/affiliate/claim
 *
 * This entry also accepts:
 *   GET  /api/affiliate?action=stats
 *   POST /api/affiliate { action: "claim" | "stats" }
 */

import { apiError } from "@/lib/http/apiResponse";
import { GET as statsGet } from "./stats/route";
import { POST as claimPost } from "./claim/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "stats").trim().toLowerCase();

  if (action === "stats") {
    return statsGet(request);
  }

  return apiError(
    'Use GET /api/affiliate/stats — or pass action=stats.',
    "AFFILIATE_ACTION_REQUIRED",
    400
  );
}

export async function POST(request: Request) {
  const raw = await request.text();
  let action = "";
  try {
    const parsed = JSON.parse(raw || "{}") as { action?: string };
    action = (parsed.action ?? "claim").trim().toLowerCase();
  } catch {
    action = "claim";
  }

  const replay = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: raw || "{}",
  });

  if (action === "claim") {
    return claimPost(replay);
  }

  if (action === "stats") {
    return statsGet(
      new Request(request.url, { method: "GET", headers: request.headers })
    );
  }

  return apiError(
    'Use /api/affiliate/stats, /api/affiliate/claim — or pass action "stats" | "claim".',
    "AFFILIATE_ACTION_REQUIRED",
    400
  );
}
