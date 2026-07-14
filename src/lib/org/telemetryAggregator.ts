import { getPrisma } from "@/lib/prisma";

export type TelemetryExecutionLog = {
  id: string;
  objective: string;
  status: string;
  credits: number;
  duration: number;
  persona: string;
};

export type WorkspaceTelemetry = {
  metrics: {
    totalSwarms: number;
    creditsSpent: number;
    tokensSpent: number;
    avgDurationSeconds: number;
    hitlRatePercentage: number;
  };
  executionLogs: TelemetryExecutionLog[];
};

function scopeWhere(userId: string, orgId: string | null) {
  if (orgId?.trim()) {
    return { orgId: orgId.trim() };
  }
  return { userId, orgId: null as string | null };
}

/**
 * Efficient workspace telemetry using Prisma aggregate + a bounded recent log window.
 * Avoids loading full kernelLogs blobs for summarization.
 */
export async function getWorkspaceTelemetry(
  userId: string,
  orgId: string | null
): Promise<WorkspaceTelemetry> {
  const where = scopeWhere(userId, orgId);
  const prisma = getPrisma();

  const [totals, hitlCount, recent] = await Promise.all([
    prisma.swarmSession.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        creditsUsed: true,
        tokensUsed: true,
        durationMs: true,
      },
      _avg: {
        durationMs: true,
      },
    }),
    prisma.swarmSession.count({
      where: {
        ...where,
        OR: [
          { hitlUsed: true },
          { interventionDirective: { not: null } },
          { status: "PAUSED" },
        ],
      },
    }),
    prisma.swarmSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        objective: true,
        status: true,
        creditsUsed: true,
        durationMs: true,
        persona: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const totalSwarms = totals._count._all;
  const creditsSpent = totals._sum.creditsUsed ?? 0;
  const tokensSpent = totals._sum.tokensUsed ?? 0;
  const avgDurationMs =
    totals._avg.durationMs ??
    (totalSwarms > 0 ? (totals._sum.durationMs ?? 0) / totalSwarms : 0);

  const hitlRatePercentage =
    totalSwarms > 0
      ? Math.round((hitlCount / totalSwarms) * 1000) / 10
      : 0;

  const executionLogs: TelemetryExecutionLog[] = recent.map((row) => {
    const fallbackDuration = Math.max(
      0,
      row.updatedAt.getTime() - row.createdAt.getTime()
    );
    const durationMs = row.durationMs > 0 ? row.durationMs : fallbackDuration;

    return {
      id: row.id,
      objective: row.objective.slice(0, 180),
      status: row.status,
      credits: row.creditsUsed,
      duration: Math.round(durationMs / 1000),
      persona: row.persona?.trim() || "Default",
    };
  });

  return {
    metrics: {
      totalSwarms,
      creditsSpent,
      tokensSpent,
      avgDurationSeconds: Math.round((avgDurationMs / 1000) * 10) / 10,
      hitlRatePercentage,
    },
    executionLogs,
  };
}
