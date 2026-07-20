import { NextResponse } from "next/server";
import { proposeHealPatch } from "@/lib/agents/healAgent";
import {
  countPluginInvokes,
  estimateInputTokens,
  recordWorkspaceMeterUsage,
  type MeterRecordResult,
} from "@/lib/billing/meterEngine";
import { getPrisma } from "@/lib/prisma";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";
import {
  buildChaosIncidents,
  ChaosRequestSchema,
} from "@/lib/telemetry/chaosIncidents";
import { dispatchHealNotifications } from "@/lib/telemetry/healNotify";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorBody = { success: false; error: string; code: string };

type ChaosHealLog = {
  errorId: string;
  validatorApproved: boolean;
  correctionCycles: number;
  phases: string[];
  meterEventId: string | null;
  meterOk: boolean;
};

type ChaosMeterLog = {
  index: number;
  ok: boolean;
  eventId: string | null;
  feeUsd: number;
  retries: number;
  reason?: string;
};

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
  });
}

async function requireChaosAuth(
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

  return jsonError(
    "Unauthorized. /api/telemetry/chaos requires a verified agent token.",
    "CHAOS_UNAUTHORIZED",
    401
  );
}

/**
 * POST /api/telemetry/chaos
 * Inject predefined compound incidents → AppErrorLog → heal pipeline.
 * Optional concurrent meterBurst stresses atomic billing / 70-30 splits.
 */
export async function POST(request: Request) {
  const denied = await requireChaosAuth(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = ChaosRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Invalid chaos payload.",
      "INVALID_CHAOS",
      400
    );
  }

  const data = parsed.data;
  const workspaceId = await resolveWorkspaceId(
    request,
    data.workspaceId ?? null
  );

  const prisma = getPrisma();
  const incidents = buildChaosIncidents(data.profile, data.burst);
  const executionLog: string[] = [];
  const healLogs: ChaosHealLog[] = [];
  const meterLogs: ChaosMeterLog[] = [];

  try {
    if (workspaceId) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true },
      });
      if (!ws) {
        return jsonError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);
      }
    }

    executionLog.push(
      `chaos:profile=${data.profile} burst=${data.burst} triggerHeal=${data.triggerHeal} meterBurst=${data.meterBurst}`
    );

    const createdIds: string[] = [];
    for (const incident of incidents) {
      const row = await prisma.appErrorLog.create({
        data: {
          route: incident.route,
          errorMessage: incident.errorMessage,
          stackTrace: incident.stackTrace,
          workspaceId,
        },
        select: { id: true },
      });
      createdIds.push(row.id);
      executionLog.push(`ingest:errorId=${row.id} route=${incident.route}`);
    }

    if (data.triggerHeal) {
      for (const errorId of createdIds) {
        const latest = await prisma.appErrorLog.findUniqueOrThrow({
          where: { id: errorId },
        });

        const proposal = await proposeHealPatch({
          route: latest.route,
          errorMessage: latest.errorMessage,
          stackTrace: latest.stackTrace,
          workspaceId: latest.workspaceId ?? workspaceId,
        });

        await prisma.appErrorLog.update({
          where: { id: latest.id },
          data: {
            resolved: proposal.validatorApproved,
            patchApplied: proposal.patch,
            explanation: [
              `chaos:${data.profile}`,
              `phases: ${proposal.phases.join(" → ")}`,
              `validatorApproved: ${proposal.validatorApproved}`,
              `correctionCycles: ${proposal.correctionCycles}`,
              proposal.explanation,
            ].join("\n\n"),
          },
        });

        let notifications: string[] = [];
        if (proposal.validatorApproved) {
          try {
            const notify = await dispatchHealNotifications({
              route: latest.route,
              errorMessage: latest.errorMessage,
              patch: proposal.patch,
              validatorStatus: "APPROVED",
              targetFile: proposal.targetFile,
              workspaceName: proposal.workspaceName,
            });
            notifications = notify.logs;
          } catch {
            notifications = ["webhook: failed"];
          }
        }

        let meter: MeterRecordResult | null = null;
        const scoped = latest.workspaceId ?? workspaceId;
        if (scoped) {
          const activePlugins = await prisma.agentPlugin.findMany({
            where: { workspaceId: scoped, isActive: true },
            select: { id: true, name: true },
            take: 50,
          });
          const pluginRuns = activePlugins
            .map((p) => {
              const runs = proposal.toolCalls.filter((line) =>
                line.toLowerCase().includes(p.name.toLowerCase())
              ).length;
              return runs > 0 ? { pluginId: p.id, runs } : null;
            })
            .filter((r): r is { pluginId: string; runs: number } => r !== null);

          meter = await recordWorkspaceMeterUsage({
            workspaceId: scoped,
            source: "heal",
            inputTokens: estimateInputTokens([
              latest.route,
              latest.errorMessage,
              latest.stackTrace,
              proposal.patch,
            ]),
            correctionCycles: proposal.correctionCycles,
            notificationsSent: notifications.filter((l) =>
              /:\s*sent\b/i.test(l)
            ).length,
            pluginsInvoked: countPluginInvokes(proposal.toolCalls),
            pluginRuns,
            referenceId: latest.id,
            metadata: { chaos: data.profile },
          });
        }

        healLogs.push({
          errorId: latest.id,
          validatorApproved: proposal.validatorApproved,
          correctionCycles: proposal.correctionCycles,
          phases: proposal.phases,
          meterEventId: meter?.eventId ?? null,
          meterOk: Boolean(meter?.ok),
        });
        executionLog.push(
          `heal:errorId=${latest.id} approved=${proposal.validatorApproved} cycles=${proposal.correctionCycles} meterOk=${Boolean(meter?.ok)}`
        );
      }
    }

    if (data.meterBurst > 0) {
      if (!workspaceId) {
        return jsonError(
          "meterBurst requires workspace scope (x-workspace-key or workspaceId).",
          "WORKSPACE_REQUIRED",
          400
        );
      }

      executionLog.push(`meter:stress_start n=${data.meterBurst}`);
      const tasks = Array.from({ length: data.meterBurst }, (_, index) =>
        recordWorkspaceMeterUsage({
          workspaceId,
          source: "manual",
          inputTokens: 250 + index * 17,
          correctionCycles: index % 4 === 0 ? 1 : 0,
          notificationsSent: index % 3 === 0 ? 1 : 0,
          pluginsInvoked: data.pluginRuns?.length ? 1 : 0,
          pluginRuns: data.pluginRuns,
          referenceId: `chaos-meter-${data.profile}-${index}`,
          metadata: { chaos: data.profile, stressIndex: index },
        }).then((result) => {
          const entry: ChaosMeterLog = {
            index,
            ok: result.ok,
            eventId: result.eventId,
            feeUsd: result.fee.totalUsd,
            retries: result.retries,
            reason: result.reason,
          };
          return entry;
        })
      );

      const settled = await Promise.all(tasks);
      meterLogs.push(...settled);
      const okCount = settled.filter((s) => s.ok).length;
      executionLog.push(
        `meter:stress_done ok=${okCount}/${settled.length} maxRetries=${Math.max(0, ...settled.map((s) => s.retries))}`
      );
    }

    return NextResponse.json({
      success: true,
      profile: data.profile,
      workspaceId,
      injected: createdIds.length,
      errorIds: createdIds,
      heal: healLogs,
      meterStress: {
        requested: data.meterBurst,
        ok: meterLogs.filter((m) => m.ok).length,
        failed: meterLogs.filter((m) => !m.ok).length,
        logs: meterLogs,
      },
      executionLog,
    });
  } catch (err) {
    console.error("[telemetry/chaos] failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Chaos injection failed.",
      "CHAOS_FAILED",
      503
    );
  }
}
