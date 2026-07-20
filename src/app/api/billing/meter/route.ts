import { NextResponse } from "next/server";
import { z } from "zod";
import {
  calculateMeterFee,
  recordWorkspaceMeterUsage,
  type MeterFeeBreakdown,
  type MeterRecordResult,
} from "@/lib/billing/meterEngine";
import { getPrisma } from "@/lib/prisma";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";
import { maskApiKey } from "@/lib/crypto/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorBody = { success: false; error: string; code: string };

type MeterWorkspacePublic = {
  id: string;
  name: string;
  apiKeyMasked: string;
  hasCredentialCipher: boolean;
  meterBalanceUsd: number;
  meterSpendUsd: number;
  meterLastAt: string | null;
};

const MeterPostSchema = z.object({
  workspaceId: z.string().uuid().optional().nullable(),
  source: z.enum(["heal", "sandbox", "manual", "plugin"]).default("manual"),
  inputTokens: z.number().int().min(0).max(2_000_000),
  correctionCycles: z.number().int().min(0).max(3).default(0),
  notificationsSent: z.number().int().min(0).max(50).default(0),
  pluginsInvoked: z.number().int().min(0).max(500).default(0),
  pluginRuns: z
    .array(
      z.object({
        pluginId: z.string().uuid(),
        runs: z.number().int().min(1).max(1000),
      })
    )
    .max(50)
    .optional(),
  referenceId: z.string().max(128).optional().nullable(),
  dryRun: z.boolean().optional(),
});

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
  });
}

async function requireMeterAuth(
  request: Request
): Promise<NextResponse | null> {
  const gate = request.headers.get("x-agent-auth")?.trim();
  if (gate === "verified") return null;

  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
    return jsonError(verdict.reason, "AGENT_TOKEN_INVALID", 401);
  }

  // Workspace key alone is enough for tenant self-meter reads.
  const wsKey =
    request.headers.get("x-workspace-key")?.trim() ||
    request.headers.get("x-workspace-api-key")?.trim();
  if (wsKey) return null;

  return jsonError(
    "Unauthorized. /api/billing/meter requires agent token or workspace key.",
    "METER_UNAUTHORIZED",
    401
  );
}

/**
 * GET /api/billing/meter — workspace meter profile (masked credentials).
 */
export async function GET(request: Request) {
  const denied = await requireMeterAuth(request);
  if (denied) return denied;

  try {
    const workspaceId = await resolveWorkspaceId(request, null);
    if (!workspaceId) {
      return jsonError(
        "workspaceId or x-workspace-key required.",
        "WORKSPACE_REQUIRED",
        400
      );
    }

    const row = await getPrisma().workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        apiKey: true,
        credentialCipher: true,
        meterBalanceUsd: true,
        meterSpendUsd: true,
        meterLastAt: true,
      },
    });

    if (!row) {
      return jsonError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);
    }

    const publicWs: MeterWorkspacePublic = {
      id: row.id,
      name: row.name,
      apiKeyMasked: maskApiKey(row.apiKey),
      hasCredentialCipher: Boolean(row.credentialCipher),
      meterBalanceUsd: row.meterBalanceUsd,
      meterSpendUsd: row.meterSpendUsd,
      meterLastAt: row.meterLastAt?.toISOString() ?? null,
    };

    const recent = await getPrisma().workspaceMeterEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        source: true,
        feeUsd: true,
        inputTokens: true,
        correctionCycles: true,
        notificationsSent: true,
        pluginsInvoked: true,
        balanceAfterUsd: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      workspace: publicWs,
      events: recent,
    });
  } catch (err) {
    console.error("[billing/meter] GET failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Meter read failed.",
      "METER_READ_FAILED",
      503
    );
  }
}

/**
 * POST /api/billing/meter — record (or dry-run) a metered micro-transaction.
 */
export async function POST(request: Request) {
  const denied = await requireMeterAuth(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = MeterPostSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Invalid meter payload.",
      "INVALID_METER",
      400
    );
  }

  const data = parsed.data;
  const workspaceId = await resolveWorkspaceId(
    request,
    data.workspaceId ?? null
  );
  if (!workspaceId) {
    return jsonError(
      "workspaceId or x-workspace-key required.",
      "WORKSPACE_REQUIRED",
      400
    );
  }

  const fee: MeterFeeBreakdown = calculateMeterFee({
    inputTokens: data.inputTokens,
    correctionCycles: data.correctionCycles,
    notificationsSent: data.notificationsSent,
    pluginsInvoked: data.pluginsInvoked,
  });

  if (data.dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      workspaceId,
      fee,
    });
  }

  try {
    const result: MeterRecordResult = await recordWorkspaceMeterUsage({
      workspaceId,
      source: data.source,
      inputTokens: data.inputTokens,
      correctionCycles: data.correctionCycles,
      notificationsSent: data.notificationsSent,
      pluginsInvoked: data.pluginsInvoked,
      pluginRuns: data.pluginRuns,
      referenceId: data.referenceId ?? null,
    });

    if (!result.ok && result.skipped) {
      return jsonError(
        result.reason ?? "Meter skipped.",
        "METER_SKIPPED",
        404
      );
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      workspaceId,
      fee: result.fee,
      split: result.split,
      balanceBeforeUsd: result.balanceBeforeUsd,
      balanceAfterUsd: result.balanceAfterUsd,
      spendTotalUsd: result.spendTotalUsd,
      eventId: result.eventId,
    });
  } catch (err) {
    console.error("[billing/meter] POST failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Meter write failed.",
      "METER_WRITE_FAILED",
      503
    );
  }
}
