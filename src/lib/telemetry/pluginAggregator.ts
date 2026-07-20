/**
 * Marketplace plugin telemetry aggregator.
 * Joins AgentPlugin balances with WorkspaceMeterEvent invocation/revenue signals.
 */

import { getPrisma } from "@/lib/prisma";

export type PluginInvocationFrequency = {
  totalInvokes: number;
  events1h: number;
  events24h: number;
  events7d: number;
};

export type PluginMeterTotals = {
  feeUsd: number;
  platformShareUsd: number;
  developerShareUsd: number;
  inputTokens: number;
  pluginsInvoked: number;
};

export type PluginTelemetryRow = {
  pluginId: string;
  name: string;
  developerId: string;
  walletId: string | null;
  version: string;
  pricePerRun: number;
  isActive: boolean;
  runCount: number;
  revenueUsd: number;
  invocationFrequency: PluginInvocationFrequency;
  meter: PluginMeterTotals;
  lastInvokedAt: string | null;
};

export type WorkspacePluginTelemetry = {
  workspaceId: string;
  generatedAt: string;
  activePluginCount: number;
  totals: {
    runCount: number;
    revenueUsd: number;
    feeUsd: number;
    platformShareUsd: number;
    developerShareUsd: number;
    pluginsInvoked: number;
    meterEvents: number;
  };
  plugins: PluginTelemetryRow[];
  recentEvents: Array<{
    id: string;
    source: string;
    referenceId: string | null;
    pluginsInvoked: number;
    feeUsd: number;
    platformShareUsd: number;
    developerShareUsd: number;
    balanceAfterUsd: number;
    createdAt: string;
  }>;
};

type RevenueCredit = {
  pluginId?: unknown;
  runs?: unknown;
  developerShareUsd?: unknown;
  platformShareUsd?: unknown;
  grossUsd?: unknown;
};

function asFinite(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function emptyMeter(): PluginMeterTotals {
  return {
    feeUsd: 0,
    platformShareUsd: 0,
    developerShareUsd: 0,
    inputTokens: 0,
    pluginsInvoked: 0,
  };
}

function emptyFreq(): PluginInvocationFrequency {
  return {
    totalInvokes: 0,
    events1h: 0,
    events24h: 0,
    events7d: 0,
  };
}

function parseCredits(metadata: unknown): RevenueCredit[] {
  if (!metadata || typeof metadata !== "object") return [];
  const credits = (metadata as { revenueCredits?: unknown }).revenueCredits;
  if (!Array.isArray(credits)) return [];
  return credits as RevenueCredit[];
}

/**
 * Aggregate active-plugin execution metrics for a single authenticated workspace.
 * Tenant-scoped: never queries outside workspaceId.
 */
export async function aggregateWorkspacePluginTelemetry(
  workspaceId: string
): Promise<WorkspacePluginTelemetry> {
  const prisma = getPrisma();
  const now = Date.now();
  const since1h = new Date(now - 60 * 60 * 1000);
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const pluginWhere = { workspaceId, isActive: true as const };
  const meterWhere = {
    workspaceId,
    OR: [{ source: "plugin" }, { pluginsInvoked: { gt: 0 } }],
  };

  const [plugins, meterAgg, recentEvents, windowEvents] = await Promise.all([
    prisma.agentPlugin.findMany({
      where: pluginWhere,
      orderBy: [{ runCount: "desc" }, { updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        developerId: true,
        walletId: true,
        version: true,
        pricePerRun: true,
        isActive: true,
        runCount: true,
        revenueUsd: true,
        updatedAt: true,
      },
    }),
    prisma.workspaceMeterEvent.aggregate({
      where: meterWhere,
      _count: { _all: true },
      _sum: {
        feeUsd: true,
        platformShareUsd: true,
        developerShareUsd: true,
        pluginsInvoked: true,
        inputTokens: true,
      },
    }),
    prisma.workspaceMeterEvent.findMany({
      where: meterWhere,
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        source: true,
        referenceId: true,
        pluginsInvoked: true,
        feeUsd: true,
        platformShareUsd: true,
        developerShareUsd: true,
        balanceAfterUsd: true,
        createdAt: true,
      },
    }),
    prisma.workspaceMeterEvent.findMany({
      where: {
        ...meterWhere,
        createdAt: { gte: since7d },
      },
      orderBy: { createdAt: "desc" },
      take: 2_000,
      select: {
        pluginsInvoked: true,
        feeUsd: true,
        platformShareUsd: true,
        developerShareUsd: true,
        inputTokens: true,
        referenceId: true,
        metadataJson: true,
        createdAt: true,
      },
    }),
  ]);

  const pluginIds = new Set(plugins.map((p) => p.id));
  const perPlugin = new Map<
    string,
    {
      freq: PluginInvocationFrequency;
      meter: PluginMeterTotals;
      lastInvokedAt: Date | null;
    }
  >();

  for (const p of plugins) {
    perPlugin.set(p.id, {
      freq: emptyFreq(),
      meter: emptyMeter(),
      lastInvokedAt: null,
    });
  }

  for (const ev of windowEvents) {
    const ts = ev.createdAt.getTime();
    const in1h = ts >= since1h.getTime();
    const in24h = ts >= since24h.getTime();
    const credits = parseCredits(ev.metadataJson);

    let attributed = false;
    for (const credit of credits) {
      const pluginId =
        typeof credit.pluginId === "string" ? credit.pluginId : null;
      if (!pluginId || !pluginIds.has(pluginId)) continue;
      const bucket = perPlugin.get(pluginId);
      if (!bucket) continue;

      const runs = Math.max(0, Math.floor(asFinite(credit.runs)));
      bucket.freq.totalInvokes += runs;
      bucket.freq.events7d += 1;
      if (in24h) bucket.freq.events24h += 1;
      if (in1h) bucket.freq.events1h += 1;

      bucket.meter.pluginsInvoked += runs;
      bucket.meter.developerShareUsd = round6(
        bucket.meter.developerShareUsd + asFinite(credit.developerShareUsd)
      );
      bucket.meter.platformShareUsd = round6(
        bucket.meter.platformShareUsd + asFinite(credit.platformShareUsd)
      );
      bucket.meter.feeUsd = round6(
        bucket.meter.feeUsd + asFinite(credit.grossUsd)
      );
      bucket.meter.inputTokens += ev.inputTokens;

      if (!bucket.lastInvokedAt || ev.createdAt > bucket.lastInvokedAt) {
        bucket.lastInvokedAt = ev.createdAt;
      }
      attributed = true;
    }

    // Fallback: referenceId may be a plugin id when credits are absent.
    if (!attributed && ev.referenceId && pluginIds.has(ev.referenceId)) {
      const bucket = perPlugin.get(ev.referenceId);
      if (bucket) {
        const runs = Math.max(1, ev.pluginsInvoked);
        bucket.freq.totalInvokes += runs;
        bucket.freq.events7d += 1;
        if (in24h) bucket.freq.events24h += 1;
        if (in1h) bucket.freq.events1h += 1;
        bucket.meter.pluginsInvoked += runs;
        bucket.meter.feeUsd = round6(bucket.meter.feeUsd + ev.feeUsd);
        bucket.meter.platformShareUsd = round6(
          bucket.meter.platformShareUsd + ev.platformShareUsd
        );
        bucket.meter.developerShareUsd = round6(
          bucket.meter.developerShareUsd + ev.developerShareUsd
        );
        bucket.meter.inputTokens += ev.inputTokens;
        if (!bucket.lastInvokedAt || ev.createdAt > bucket.lastInvokedAt) {
          bucket.lastInvokedAt = ev.createdAt;
        }
      }
    }
  }

  const rows: PluginTelemetryRow[] = plugins.map((p) => {
    const agg = perPlugin.get(p.id)!;
    // Prefer durable counters on AgentPlugin; overlay windowed meter detail.
    const totalInvokes = Math.max(p.runCount, agg.freq.totalInvokes);
    return {
      pluginId: p.id,
      name: p.name,
      developerId: p.developerId,
      walletId: p.walletId,
      version: p.version,
      pricePerRun: p.pricePerRun,
      isActive: p.isActive,
      runCount: p.runCount,
      revenueUsd: round6(p.revenueUsd),
      invocationFrequency: {
        totalInvokes,
        events1h: agg.freq.events1h,
        events24h: agg.freq.events24h,
        events7d: agg.freq.events7d,
      },
      meter: {
        feeUsd: round6(agg.meter.feeUsd),
        platformShareUsd: round6(agg.meter.platformShareUsd),
        developerShareUsd: round6(agg.meter.developerShareUsd),
        inputTokens: agg.meter.inputTokens,
        pluginsInvoked: agg.meter.pluginsInvoked,
      },
      lastInvokedAt:
        agg.lastInvokedAt?.toISOString() ?? p.updatedAt.toISOString(),
    };
  });

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    activePluginCount: plugins.length,
    totals: {
      runCount: rows.reduce((s, r) => s + r.runCount, 0),
      revenueUsd: round6(rows.reduce((s, r) => s + r.revenueUsd, 0)),
      feeUsd: round6(asFinite(meterAgg._sum.feeUsd)),
      platformShareUsd: round6(asFinite(meterAgg._sum.platformShareUsd)),
      developerShareUsd: round6(asFinite(meterAgg._sum.developerShareUsd)),
      pluginsInvoked: Math.floor(asFinite(meterAgg._sum.pluginsInvoked)),
      meterEvents: meterAgg._count._all,
    },
    plugins: rows,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      source: e.source,
      referenceId: e.referenceId,
      pluginsInvoked: e.pluginsInvoked,
      feeUsd: e.feeUsd,
      platformShareUsd: e.platformShareUsd,
      developerShareUsd: e.developerShareUsd,
      balanceAfterUsd: e.balanceAfterUsd,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
