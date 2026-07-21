/**
 * GET /api/affiliate/stats
 * Workspace referral count, Gas earned via referrals, conversion rates.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { getAffiliateStats } from "@/lib/affiliate/referralRewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireWorkspaceApiKeyGate(request);
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  try {
    const stats = await getAffiliateStats(gate.workspaceId);
    return apiSuccess(
      { stats },
      200,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Failed to load affiliate stats.",
      "AFFILIATE_STATS_FAILED",
      500
    );
  }
}
