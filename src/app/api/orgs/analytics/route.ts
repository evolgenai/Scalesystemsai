import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";
import { getWorkspaceTelemetry } from "@/lib/org/telemetryAggregator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/orgs/analytics
 * Header x-org-id → org workspace metrics (membership required).
 * No header → personal workspace metrics (orgId null).
 */
export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Sign in required.",
        metrics: {
          totalSwarms: 0,
          creditsSpent: 0,
          avgDurationSeconds: 0,
          hitlRatePercentage: 0,
        },
        executionLogs: [],
      },
      { status: 401 }
    );
  }

  const headerOrg = extractOrgIdFromRequest(request);
  let orgId: string | null = null;

  if (headerOrg) {
    const membership = await resolveOrgContext(profile.id, headerOrg);
    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          error: "You are not a member of this organization.",
          code: "ORG_ACCESS_DENIED",
          metrics: {
            totalSwarms: 0,
            creditsSpent: 0,
            avgDurationSeconds: 0,
            hitlRatePercentage: 0,
          },
          executionLogs: [],
        },
        { status: 403 }
      );
    }
    orgId = membership.orgId;
  }

  try {
    const telemetry = await getWorkspaceTelemetry(profile.id, orgId);
    return NextResponse.json({
      success: true,
      orgId,
      metrics: {
        totalSwarms: telemetry.metrics.totalSwarms,
        creditsSpent: telemetry.metrics.creditsSpent,
        avgDurationSeconds: telemetry.metrics.avgDurationSeconds,
        hitlRatePercentage: telemetry.metrics.hitlRatePercentage,
        tokensSpent: telemetry.metrics.tokensSpent,
      },
      executionLogs: telemetry.executionLogs,
    });
  } catch (error) {
    console.error("[analytics] telemetry failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unable to load workspace telemetry.",
        metrics: {
          totalSwarms: 0,
          creditsSpent: 0,
          avgDurationSeconds: 0,
          hitlRatePercentage: 0,
        },
        executionLogs: [],
      },
      { status: 500 }
    );
  }
}
