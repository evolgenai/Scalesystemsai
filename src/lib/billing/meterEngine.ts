/**
 * Utility-metered execution engine — fee calc, Workspace deduction, plugin revenue splits.
 */

import { getPrisma } from "@/lib/prisma";
import { computePluginRevenueSplit } from "@/lib/marketplace/revenueSplit";
import { METER_RATES } from "@/lib/billing/meterRates";

export { METER_RATES };

export type PluginRunCharge = {
  pluginId: string;
  runs: number;
};

export type MeterUsageInput = {
  workspaceId: string;
  source: "heal" | "sandbox" | "manual" | "plugin";
  inputTokens: number;
  correctionCycles: number;
  notificationsSent: number;
  pluginsInvoked: number;
  /** External marketplace plugins to monetize (tenant-scoped). */
  pluginRuns?: PluginRunCharge[];
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type MeterFeeBreakdown = {
  baseUsd: number;
  tokensUsd: number;
  correctionsUsd: number;
  notificationsUsd: number;
  pluginsUsd: number;
  marketplaceGrossUsd: number;
  totalUsd: number;
};

export type MeterRevenueSplitPublic = {
  platformShareUsd: number;
  developerShareUsd: number;
  creditedPlugins: number;
};

export type MeterRecordResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  fee: MeterFeeBreakdown;
  split: MeterRevenueSplitPublic;
  balanceBeforeUsd: number | null;
  balanceAfterUsd: number | null;
  spendTotalUsd: number | null;
  eventId: string | null;
};

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function estimateInputTokens(parts: Array<string | null | undefined>): number {
  const chars = parts
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .reduce((sum, p) => sum + p.length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

export function calculateMeterFee(input: {
  inputTokens: number;
  correctionCycles: number;
  notificationsSent: number;
  pluginsInvoked: number;
  marketplaceGrossUsd?: number;
}): MeterFeeBreakdown {
  const tokens = clampNonNeg(input.inputTokens);
  const cycles = clampNonNeg(input.correctionCycles);
  const notes = clampNonNeg(input.notificationsSent);
  const plugins = clampNonNeg(input.pluginsInvoked);
  const marketplaceGrossUsd = round6(clampNonNeg(input.marketplaceGrossUsd ?? 0));

  const tokensUsd = (tokens / 1000) * METER_RATES.per1kTokens;
  const correctionsUsd = cycles * METER_RATES.perCorrectionCycle;
  const notificationsUsd = notes * METER_RATES.perNotification;
  const pluginsUsd = plugins * METER_RATES.perPluginInvoke;
  const baseUsd = METER_RATES.healBase;
  const totalUsd = round6(
    baseUsd +
      tokensUsd +
      correctionsUsd +
      notificationsUsd +
      pluginsUsd +
      marketplaceGrossUsd
  );

  return {
    baseUsd,
    tokensUsd: round6(tokensUsd),
    correctionsUsd: round6(correctionsUsd),
    notificationsUsd: round6(notificationsUsd),
    pluginsUsd: round6(pluginsUsd),
    marketplaceGrossUsd,
    totalUsd,
  };
}

export function countPluginInvokes(toolCalls: string[]): number {
  let n = 0;
  for (const line of toolCalls) {
    if (
      /plugin|mcp:|openapi|marketplace|dynamic_tool|check_gate|cycle_parking|write_file|apply_patch|read_file/i.test(
        line
      )
    ) {
      n += 1;
    }
  }
  return n;
}

export function countSentNotifications(logs: string[]): number {
  return logs.filter((l) => /:\s*sent\b/i.test(l)).length;
}

/**
 * Calculate fee, deduct Workspace balance, split marketplace plugin revenue to developer wallets.
 * Multi-tenant: only AgentPlugin rows matching workspaceId are credited.
 */
export async function recordWorkspaceMeterUsage(
  input: MeterUsageInput
): Promise<MeterRecordResult> {
  const prisma = getPrisma();
  const emptySplit: MeterRevenueSplitPublic = {
    platformShareUsd: 0,
    developerShareUsd: 0,
    creditedPlugins: 0,
  };

  const ws = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      id: true,
      meterBalanceUsd: true,
      meterSpendUsd: true,
    },
  });

  if (!ws) {
    const fee = calculateMeterFee({
      inputTokens: input.inputTokens,
      correctionCycles: input.correctionCycles,
      notificationsSent: input.notificationsSent,
      pluginsInvoked: input.pluginsInvoked,
    });
    return {
      ok: false,
      skipped: true,
      reason: "workspace_not_found",
      fee,
      split: emptySplit,
      balanceBeforeUsd: null,
      balanceAfterUsd: null,
      spendTotalUsd: null,
      eventId: null,
    };
  }

  const pluginRuns = (input.pluginRuns ?? []).filter(
    (p) => p.pluginId && p.runs > 0
  );

  let marketplaceGrossUsd = 0;
  let platformShareUsd = 0;
  let developerShareUsd = 0;
  let creditedPlugins = 0;

  type CreditOp = {
    pluginId: string;
    developerId: string;
    walletId: string;
    runs: number;
    developerShareUsd: number;
    platformShareUsd: number;
    grossUsd: number;
  };
  const credits: CreditOp[] = [];

  if (pluginRuns.length > 0) {
    const ids = [...new Set(pluginRuns.map((p) => p.pluginId))];
    const plugins = await prisma.agentPlugin.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        workspaceId: ws.id,
      },
      select: {
        id: true,
        developerId: true,
        walletId: true,
        pricePerRun: true,
      },
    });
    const byId = new Map(plugins.map((p) => [p.id, p]));

    for (const run of pluginRuns) {
      const plugin = byId.get(run.pluginId);
      if (!plugin || !plugin.walletId) continue;
      const split = computePluginRevenueSplit({
        grossUsd: 0,
        runs: run.runs,
        pricePerRun: plugin.pricePerRun,
      });
      if (split.grossUsd <= 0) continue;
      marketplaceGrossUsd = round6(marketplaceGrossUsd + split.grossUsd);
      platformShareUsd = round6(platformShareUsd + split.platformShareUsd);
      developerShareUsd = round6(developerShareUsd + split.developerShareUsd);
      creditedPlugins += 1;
      credits.push({
        pluginId: plugin.id,
        developerId: plugin.developerId,
        walletId: plugin.walletId,
        runs: run.runs,
        developerShareUsd: split.developerShareUsd,
        platformShareUsd: split.platformShareUsd,
        grossUsd: split.grossUsd,
      });
    }
  }

  const fee = calculateMeterFee({
    inputTokens: input.inputTokens,
    correctionCycles: input.correctionCycles,
    notificationsSent: input.notificationsSent,
    pluginsInvoked: input.pluginsInvoked,
    marketplaceGrossUsd,
  });

  const balanceBefore = ws.meterBalanceUsd;
  const balanceAfter = round6(Math.max(0, balanceBefore - fee.totalUsd));
  const spendTotal = round6(ws.meterSpendUsd + fee.totalUsd);

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.workspaceMeterEvent.create({
      data: {
        workspaceId: ws.id,
        source: input.source,
        referenceId: input.referenceId ?? null,
        inputTokens: Math.floor(clampNonNeg(input.inputTokens)),
        correctionCycles: Math.floor(clampNonNeg(input.correctionCycles)),
        notificationsSent: Math.floor(clampNonNeg(input.notificationsSent)),
        pluginsInvoked: Math.floor(clampNonNeg(input.pluginsInvoked)),
        feeUsd: fee.totalUsd,
        platformShareUsd,
        developerShareUsd,
        breakdownJson: fee,
        metadataJson: {
          ...(input.metadata ?? {}),
          revenueCredits: credits.map((c) => ({
            pluginId: c.pluginId,
            developerId: c.developerId,
            walletId: c.walletId,
            runs: c.runs,
            developerShareUsd: c.developerShareUsd,
            platformShareUsd: c.platformShareUsd,
            grossUsd: c.grossUsd,
          })),
        },
        balanceAfterUsd: balanceAfter,
      },
      select: { id: true },
    });

    await tx.workspace.update({
      where: { id: ws.id },
      data: {
        meterBalanceUsd: balanceAfter,
        meterSpendUsd: spendTotal,
        meterLastAt: new Date(),
      },
    });

    for (const credit of credits) {
      await tx.agentPlugin.update({
        where: { id: credit.pluginId },
        data: {
          revenueUsd: { increment: credit.developerShareUsd },
          runCount: { increment: credit.runs },
        },
      });

      await tx.developerWallet.upsert({
        where: { developerId: credit.developerId },
        create: {
          developerId: credit.developerId,
          walletId: credit.walletId,
          balanceUsd: credit.developerShareUsd,
          lifetimeUsd: credit.developerShareUsd,
        },
        update: {
          walletId: credit.walletId,
          balanceUsd: { increment: credit.developerShareUsd },
          lifetimeUsd: { increment: credit.developerShareUsd },
        },
      });
    }

    return created;
  });

  return {
    ok: true,
    skipped: false,
    fee,
    split: {
      platformShareUsd,
      developerShareUsd,
      creditedPlugins,
    },
    balanceBeforeUsd: balanceBefore,
    balanceAfterUsd: balanceAfter,
    spendTotalUsd: spendTotal,
    eventId: event.id,
  };
}
