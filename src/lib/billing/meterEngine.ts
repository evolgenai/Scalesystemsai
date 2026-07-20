/**
 * Utility-metered execution engine — fee calc, Workspace deduction, plugin revenue splits.
 * Concurrent-safe: row locks + increment ops + Serializable retries (max 3).
 */

import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { computePluginRevenueSplit } from "@/lib/marketplace/revenueSplit";
import { METER_RATES } from "@/lib/billing/meterRates";

export { METER_RATES };

const MAX_TX_RETRIES = 3 as const;
const TX_TIMEOUT_MS = 15_000;
const TX_MAX_WAIT_MS = 5_000;

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
  retries: number;
};

type LockedWorkspaceRow = {
  id: string;
  meterBalanceUsd: number;
  meterSpendUsd: number;
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

function isRetryableTxError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034 serialization failure; P2028 transaction API error / timeout
    return err.code === "P2034" || err.code === "P2028";
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes("serialization") ||
      m.includes("deadlock") ||
      m.includes("could not serialize") ||
      m.includes("write conflict")
    );
  }
  return false;
}

async function lockWorkspaceRow(
  tx: Prisma.TransactionClient,
  workspaceId: string
): Promise<LockedWorkspaceRow | null> {
  const rows = await tx.$queryRaw<LockedWorkspaceRow[]>`
    SELECT id, "meterBalanceUsd", "meterSpendUsd"
    FROM "Workspace"
    WHERE id = ${workspaceId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Calculate fee, deduct Workspace balance, split marketplace plugin revenue to developer wallets.
 * Multi-tenant: only AgentPlugin rows matching workspaceId are credited.
 * Atomic under FOR UPDATE + Serializable isolation with bounded retries.
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

  const pluginRuns = (input.pluginRuns ?? []).filter(
    (p) => p.pluginId && p.runs > 0
  );

  type CreditOp = {
    pluginId: string;
    developerId: string;
    walletId: string;
    runs: number;
    developerShareUsd: number;
    platformShareUsd: number;
    grossUsd: number;
  };

  // Resolve plugin pricing outside the lock to shrink critical section.
  let marketplaceGrossUsd = 0;
  let platformShareUsd = 0;
  let developerShareUsd = 0;
  let creditedPlugins = 0;
  const credits: CreditOp[] = [];

  if (pluginRuns.length > 0) {
    const ids = [...new Set(pluginRuns.map((p) => p.pluginId))];
    const plugins = await prisma.agentPlugin.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        workspaceId: input.workspaceId,
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

  // Stable lock order: workspace → plugins (id ASC) → wallets (developerId ASC)
  credits.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  const walletCredits = [...credits].sort((a, b) =>
    a.developerId.localeCompare(b.developerId)
  );

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const locked = await lockWorkspaceRow(tx, input.workspaceId);
          if (!locked) {
            return { kind: "missing" as const };
          }

          const balanceBefore = locked.meterBalanceUsd;
          const balanceAfter = round6(
            Math.max(0, balanceBefore - fee.totalUsd)
          );
          const spendTotal = round6(locked.meterSpendUsd + fee.totalUsd);

          const created = await tx.workspaceMeterEvent.create({
            data: {
              workspaceId: locked.id,
              source: input.source,
              referenceId: input.referenceId ?? null,
              inputTokens: Math.floor(clampNonNeg(input.inputTokens)),
              correctionCycles: Math.floor(clampNonNeg(input.correctionCycles)),
              notificationsSent: Math.floor(
                clampNonNeg(input.notificationsSent)
              ),
              pluginsInvoked: Math.floor(clampNonNeg(input.pluginsInvoked)),
              feeUsd: fee.totalUsd,
              platformShareUsd,
              developerShareUsd,
              breakdownJson: fee,
              metadataJson: {
                ...(input.metadata ?? {}),
                txAttempt: attempt,
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
            where: { id: locked.id },
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
          }

          for (const credit of walletCredits) {
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

          return {
            kind: "ok" as const,
            eventId: created.id,
            balanceBefore,
            balanceAfter,
            spendTotal,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: TX_MAX_WAIT_MS,
          timeout: TX_TIMEOUT_MS,
        }
      );

      if (result.kind === "missing") {
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
          retries: attempt,
        };
      }

      return {
        ok: true,
        skipped: false,
        fee,
        split: {
          platformShareUsd,
          developerShareUsd,
          creditedPlugins,
        },
        balanceBeforeUsd: result.balanceBefore,
        balanceAfterUsd: result.balanceAfter,
        spendTotalUsd: result.spendTotal,
        eventId: result.eventId,
        retries: attempt,
      };
    } catch (err) {
      lastError = err;
      if (attempt + 1 >= MAX_TX_RETRIES || !isRetryableTxError(err)) {
        break;
      }
      // Brief jittered backoff before retry
      await new Promise((r) =>
        setTimeout(r, 25 * (attempt + 1) + Math.floor(Math.random() * 40))
      );
    }
  }

  console.error("[meterEngine] atomic write failed after retries:", lastError);
  return {
    ok: false,
    skipped: true,
    reason: "meter_tx_failed",
    fee,
    split: {
      platformShareUsd,
      developerShareUsd,
      creditedPlugins,
    },
    balanceBeforeUsd: null,
    balanceAfterUsd: null,
    spendTotalUsd: null,
    eventId: null,
    retries: MAX_TX_RETRIES,
  };
}
