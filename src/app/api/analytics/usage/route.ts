/**
 * GET /api/analytics/usage
 * Historical Gas consumption (day/hour), 7-day burn velocity, depletion ETA.
 *
 * Auth:
 *  - Tenant: x-workspace-key (strict isolation)
 *  - Super-Admin: session + ?workspaceId= (explicit tenant only; no global dump)
 */

import { z } from "zod";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateDenied,
} from "@/lib/auth/workspaceGate";
import {
  DEFAULT_HISTORY_DAYS,
  getWorkspaceUsageAnalytics,
  type UsageGroupBy,
} from "@/lib/billing/usageAnalytics";
import { apiFail, apiOk } from "@/lib/http/apiEnvelope";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
  groupBy: z.enum(["day", "hour"]).optional(),
  workspaceId: z.string().uuid().optional(),
  /** Skip ledger→daily sync (default false = sync on read). */
  nosync: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

function gateFail(denied: WorkspaceGateDenied) {
  return apiFail(denied.message, denied.code, denied.status, {
    "x-workspace-bound": "denied",
  });
}

type ResolvedTenant = {
  workspaceId: string;
  authMode: "api_key" | "super_admin";
};

/**
 * Resolve tenant workspace: API key wins; Super-Admin may target an explicit id.
 * Super-Admin cannot omit workspaceId (no cross-tenant aggregate dump).
 */
async function resolveUsageTenant(
  request: Request,
  claimedWorkspaceId: string | undefined
): Promise<ResolvedTenant | Response> {
  const gate = await requireWorkspaceApiKeyGate(request, claimedWorkspaceId);
  if (gate.ok) {
    if (
      claimedWorkspaceId &&
      claimedWorkspaceId !== gate.workspaceId
    ) {
      return apiFail(
        "Claimed workspaceId does not match the authenticated workspace key.",
        "WORKSPACE_CROSS_TENANT",
        403,
        { "x-workspace-bound": "denied" }
      );
    }
    return { workspaceId: gate.workspaceId, authMode: "api_key" };
  }

  const profile = await resolveRequestUser(request);
  const isSuperAdmin =
    profile.isSuperAdmin && profile.role === "SUPER_ADMIN";

  if (!isSuperAdmin) {
    return gateFail(gate);
  }

  if (!claimedWorkspaceId) {
    return apiFail(
      "Super-Admin must pass workspaceId to scope usage analytics.",
      "SUPER_ADMIN_WORKSPACE_REQUIRED",
      400,
      { "x-workspace-bound": "denied" }
    );
  }

  const exists = await getPrisma().workspace.findUnique({
    where: { id: claimedWorkspaceId },
    select: { id: true },
  });
  if (!exists) {
    return apiFail("Workspace not found.", "WORKSPACE_NOT_FOUND", 404, {
      "x-workspace-bound": "denied",
    });
  }

  return { workspaceId: claimedWorkspaceId, authMode: "super_admin" };
}

/**
 * GET /api/analytics/usage?days=30&groupBy=day
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    days: url.searchParams.get("days") ?? undefined,
    groupBy: url.searchParams.get("groupBy") ?? undefined,
    workspaceId: url.searchParams.get("workspaceId") ?? undefined,
    nosync: url.searchParams.get("nosync") ?? undefined,
  });

  if (!parsed.success) {
    return apiFail("Invalid query parameters.", "INVALID_QUERY", 400, {
      "x-workspace-bound": "denied",
    });
  }

  const tenant = await resolveUsageTenant(request, parsed.data.workspaceId);
  if (tenant instanceof Response) return tenant;

  const days = parsed.data.days ?? DEFAULT_HISTORY_DAYS;
  const groupBy: UsageGroupBy = parsed.data.groupBy ?? "day";
  const sync = !parsed.data.nosync;

  try {
    const analytics = await getWorkspaceUsageAnalytics(tenant.workspaceId, {
      days,
      groupBy,
      sync,
    });

    return apiOk(
      {
        ...analytics,
        authMode: tenant.authMode,
      },
      {
        headers: {
          "x-workspace-bound": tenant.workspaceId,
          "x-workspace-id": tenant.workspaceId,
        },
      }
    );
  } catch (err) {
    console.error("[analytics/usage] failed:", err);
    return apiFail(
      err instanceof Error ? err.message : "Usage analytics failed.",
      "USAGE_ANALYTICS_FAILED",
      503,
      { "x-workspace-bound": tenant.workspaceId }
    );
  }
}
