/**
 * Gas usage analytics — daily rollups, 7-day burn velocity, depletion ETA.
 * Tenant-scoped; never cross workspace boundaries.
 */

import type { MeteredGasKind } from "@/lib/billing/gasMeter";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const BURN_VELOCITY_WINDOW_DAYS = 7 as const;
export const DEFAULT_HISTORY_DAYS = 30 as const;
export const MAX_HISTORY_DAYS = 90 as const;

export type UsageGroupBy = "day" | "hour";

export type UsageBucket = {
  /** ISO timestamp — UTC day start (groupBy=day) or hour start (groupBy=hour). */
  period: string;
  totalGasConsumed: number;
  scraperGas: number;
  aiGas: number;
  webhookGas: number;
  executionCount: number;
};

export type BurnVelocity = {
  windowDays: number;
  /** Gas consumed per day over the trailing window (7-day moving average). */
  gasPerDay: number;
  totalGasInWindow: number;
  daysWithData: number;
};

export type DepletionForecast = {
  currentGasBalance: number;
  burnVelocityGasPerDay: number;
  /** ISO date when balance hits 0 at current velocity; null if not depleting. */
  estimatedDepletionAt: string | null;
  /** Whole days remaining until depletion; null if infinite / not burning. */
  daysRemaining: number | null;
  isDepleting: boolean;
};

export type WorkspaceUsageAnalytics = {
  workspaceId: string;
  groupBy: UsageGroupBy;
  range: { from: string; to: string; days: number };
  series: UsageBucket[];
  burnVelocity: BurnVelocity;
  depletion: DepletionForecast;
  totals: {
    totalGasConsumed: number;
    scraperGas: number;
    aiGas: number;
    webhookGas: number;
    executionCount: number;
  };
};

type CategoryDeltas = {
  scraperGas: number;
  aiGas: number;
  webhookGas: number;
};

type HourlyAggRow = {
  period: Date;
  total_gas: bigint | number;
  scraper_gas: bigint | number;
  ai_gas: bigint | number;
  webhook_gas: bigint | number;
  execution_count: bigint | number;
};

function asInt(n: unknown): number {
  if (typeof n === "bigint") return Number(n);
  if (typeof n === "number" && Number.isFinite(n)) return Math.trunc(n);
  return 0;
}

/** UTC midnight for the calendar day containing `at`. */
export function utcDayStart(at: Date = new Date()): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  );
}

export function categoryDeltasForKind(
  kind: MeteredGasKind | null,
  amount: number
): CategoryDeltas {
  const empty: CategoryDeltas = {
    scraperGas: 0,
    aiGas: 0,
    webhookGas: 0,
  };
  if (!kind || amount <= 0) return empty;
  if (kind === "scraper") return { ...empty, scraperGas: amount };
  if (kind === "ai_agent") return { ...empty, aiGas: amount };
  if (kind === "webhook_trigger") return { ...empty, webhookGas: amount };
  return empty;
}

/**
 * Increment DailyUsageMetric inside an open Prisma transaction (gas deduct path).
 */
export async function recordDailyUsageInTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  gasKind: MeteredGasKind,
  amount: number,
  at: Date = new Date()
): Promise<void> {
  if (amount <= 0) return;
  const date = utcDayStart(at);
  const cats = categoryDeltasForKind(gasKind, amount);

  await tx.dailyUsageMetric.upsert({
    where: { workspaceId_date: { workspaceId, date } },
    create: {
      workspaceId,
      date,
      totalGasConsumed: amount,
      scraperGas: cats.scraperGas,
      aiGas: cats.aiGas,
      webhookGas: cats.webhookGas,
      executionCount: 1,
    },
    update: {
      totalGasConsumed: { increment: amount },
      scraperGas: { increment: cats.scraperGas },
      aiGas: { increment: cats.aiGas },
      webhookGas: { increment: cats.webhookGas },
      executionCount: { increment: 1 },
    },
  });
}

function clampHistoryDays(days: number): number {
  if (!Number.isFinite(days) || days < 1) return DEFAULT_HISTORY_DAYS;
  return Math.min(Math.trunc(days), MAX_HISTORY_DAYS);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 7-day moving burn velocity (Gas/day) from ordered daily totals.
 * Uses the trailing `windowDays` calendar days ending at `endDay` (inclusive).
 */
export function computeBurnVelocity(
  dailyTotals: Array<{ date: Date; totalGasConsumed: number }>,
  endDay: Date = utcDayStart(),
  windowDays: number = BURN_VELOCITY_WINDOW_DAYS
): BurnVelocity {
  const end = utcDayStart(endDay).getTime();
  const start = end - (windowDays - 1) * 86_400_000;

  let totalGasInWindow = 0;
  let daysWithData = 0;

  for (const row of dailyTotals) {
    const t = utcDayStart(row.date).getTime();
    if (t < start || t > end) continue;
    totalGasInWindow += Math.max(0, row.totalGasConsumed);
    if (row.totalGasConsumed > 0) daysWithData += 1;
  }

  return {
    windowDays,
    gasPerDay: round2(totalGasInWindow / windowDays),
    totalGasInWindow,
    daysWithData,
  };
}

/**
 * Predict depletion date from current balance and Gas/day velocity.
 */
export function estimateDepletion(
  gasBalance: number,
  burnVelocityGasPerDay: number,
  from: Date = new Date()
): DepletionForecast {
  const balance = Math.max(0, Math.trunc(gasBalance));
  const velocity = Math.max(0, burnVelocityGasPerDay);

  if (balance <= 0) {
    return {
      currentGasBalance: balance,
      burnVelocityGasPerDay: round2(velocity),
      estimatedDepletionAt: from.toISOString(),
      daysRemaining: 0,
      isDepleting: true,
    };
  }

  if (velocity <= 0) {
    return {
      currentGasBalance: balance,
      burnVelocityGasPerDay: 0,
      estimatedDepletionAt: null,
      daysRemaining: null,
      isDepleting: false,
    };
  }

  const daysRemaining = round2(balance / velocity);
  const ms = daysRemaining * 86_400_000;
  const eta = new Date(from.getTime() + ms);

  return {
    currentGasBalance: balance,
    burnVelocityGasPerDay: round2(velocity),
    estimatedDepletionAt: eta.toISOString(),
    daysRemaining,
    isDepleting: true,
  };
}

async function loadDailySeries(
  workspaceId: string,
  from: Date,
  to: Date
): Promise<UsageBucket[]> {
  const prisma = getPrisma();
  const rows = await prisma.dailyUsageMetric.findMany({
    where: {
      workspaceId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: "asc" },
    select: {
      date: true,
      totalGasConsumed: true,
      scraperGas: true,
      aiGas: true,
      webhookGas: true,
      executionCount: true,
    },
  });

  return rows.map((r) => ({
    period: r.date.toISOString(),
    totalGasConsumed: r.totalGasConsumed,
    scraperGas: r.scraperGas,
    aiGas: r.aiGas,
    webhookGas: r.webhookGas,
    executionCount: r.executionCount,
  }));
}

/**
 * Hourly EXECUTION_FEE rollup from GasLedger (description encodes gas kind).
 */
async function loadHourlySeries(
  workspaceId: string,
  from: Date,
  toExclusive: Date
): Promise<UsageBucket[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<HourlyAggRow[]>`
    SELECT
      date_trunc('hour', "createdAt") AS period,
      COALESCE(SUM(amount), 0) AS total_gas,
      COALESCE(SUM(
        CASE
          WHEN description ILIKE '%scraper%' THEN amount
          ELSE 0
        END
      ), 0) AS scraper_gas,
      COALESCE(SUM(
        CASE
          WHEN description ILIKE '%ai_agent%' THEN amount
          ELSE 0
        END
      ), 0) AS ai_gas,
      COALESCE(SUM(
        CASE
          WHEN description ILIKE '%webhook%' THEN amount
          ELSE 0
        END
      ), 0) AS webhook_gas,
      COUNT(*)::int AS execution_count
    FROM "GasLedger"
    WHERE "workspaceId" = ${workspaceId}
      AND "transactionType" = 'EXECUTION_FEE'
      AND "createdAt" >= ${from}
      AND "createdAt" < ${toExclusive}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  return rows.map((r) => ({
    period: new Date(r.period).toISOString(),
    totalGasConsumed: asInt(r.total_gas),
    scraperGas: asInt(r.scraper_gas),
    aiGas: asInt(r.ai_gas),
    webhookGas: asInt(r.webhook_gas),
    executionCount: asInt(r.execution_count),
  }));
}

/**
 * Backfill DailyUsageMetric from GasLedger when rollup rows are missing.
 * Idempotent upsert — safe to call on read path for sparse histories.
 */
export async function syncDailyUsageFromLedger(
  workspaceId: string,
  days: number = DEFAULT_HISTORY_DAYS
): Promise<number> {
  const prisma = getPrisma();
  const historyDays = clampHistoryDays(days);
  const to = utcDayStart();
  const from = new Date(to.getTime() - (historyDays - 1) * 86_400_000);
  const toExclusive = new Date(to.getTime() + 86_400_000);

  const rows = await prisma.$queryRaw<
    Array<{
      day: Date;
      total_gas: bigint | number;
      scraper_gas: bigint | number;
      ai_gas: bigint | number;
      webhook_gas: bigint | number;
      execution_count: bigint | number;
    }>
  >`
    SELECT
      date_trunc('day', "createdAt") AS day,
      COALESCE(SUM(amount), 0) AS total_gas,
      COALESCE(SUM(
        CASE WHEN description ILIKE '%scraper%' THEN amount ELSE 0 END
      ), 0) AS scraper_gas,
      COALESCE(SUM(
        CASE WHEN description ILIKE '%ai_agent%' THEN amount ELSE 0 END
      ), 0) AS ai_gas,
      COALESCE(SUM(
        CASE WHEN description ILIKE '%webhook%' THEN amount ELSE 0 END
      ), 0) AS webhook_gas,
      COUNT(*)::int AS execution_count
    FROM "GasLedger"
    WHERE "workspaceId" = ${workspaceId}
      AND "transactionType" = 'EXECUTION_FEE'
      AND "createdAt" >= ${from}
      AND "createdAt" < ${toExclusive}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  let upserted = 0;
  for (const row of rows) {
    const date = utcDayStart(new Date(row.day));
    const totalGasConsumed = asInt(row.total_gas);
    const scraperGas = asInt(row.scraper_gas);
    const aiGas = asInt(row.ai_gas);
    const webhookGas = asInt(row.webhook_gas);
    const executionCount = asInt(row.execution_count);

    await prisma.dailyUsageMetric.upsert({
      where: { workspaceId_date: { workspaceId, date } },
      create: {
        workspaceId,
        date,
        totalGasConsumed,
        scraperGas,
        aiGas,
        webhookGas,
        executionCount,
      },
      update: {
        totalGasConsumed,
        scraperGas,
        aiGas,
        webhookGas,
        executionCount,
      },
    });
    upserted += 1;
  }

  return upserted;
}

/**
 * Full workspace usage analytics payload for GET /api/analytics/usage.
 */
export async function getWorkspaceUsageAnalytics(
  workspaceId: string,
  options?: {
    days?: number;
    groupBy?: UsageGroupBy;
    sync?: boolean;
  }
): Promise<WorkspaceUsageAnalytics> {
  const prisma = getPrisma();
  const days = clampHistoryDays(options?.days ?? DEFAULT_HISTORY_DAYS);
  const groupBy: UsageGroupBy = options?.groupBy === "hour" ? "hour" : "day";
  const shouldSync = options?.sync !== false;

  const toDay = utcDayStart();
  const fromDay = new Date(toDay.getTime() - (days - 1) * 86_400_000);
  const toExclusive = new Date(toDay.getTime() + 86_400_000);

  if (shouldSync) {
    await syncDailyUsageFromLedger(workspaceId, days);
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { gasBalance: true },
  });
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const series =
    groupBy === "hour"
      ? await loadHourlySeries(workspaceId, fromDay, toExclusive)
      : await loadDailySeries(workspaceId, fromDay, toDay);

  const dailyForVelocity =
    groupBy === "day"
      ? series.map((s) => ({
          date: new Date(s.period),
          totalGasConsumed: s.totalGasConsumed,
        }))
      : (
          await loadDailySeries(
            workspaceId,
            new Date(
              toDay.getTime() - (BURN_VELOCITY_WINDOW_DAYS - 1) * 86_400_000
            ),
            toDay
          )
        ).map((s) => ({
          date: new Date(s.period),
          totalGasConsumed: s.totalGasConsumed,
        }));

  const burnVelocity = computeBurnVelocity(dailyForVelocity, toDay);
  const depletion = estimateDepletion(
    workspace.gasBalance,
    burnVelocity.gasPerDay
  );

  const totals = series.reduce(
    (acc, b) => {
      acc.totalGasConsumed += b.totalGasConsumed;
      acc.scraperGas += b.scraperGas;
      acc.aiGas += b.aiGas;
      acc.webhookGas += b.webhookGas;
      acc.executionCount += b.executionCount;
      return acc;
    },
    {
      totalGasConsumed: 0,
      scraperGas: 0,
      aiGas: 0,
      webhookGas: 0,
      executionCount: 0,
    }
  );

  return {
    workspaceId,
    groupBy,
    range: {
      from: fromDay.toISOString(),
      to: toDay.toISOString(),
      days,
    },
    series,
    burnVelocity,
    depletion,
    totals,
  };
}
