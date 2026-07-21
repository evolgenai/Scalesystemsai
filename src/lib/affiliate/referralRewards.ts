/**
 * Referral tracking + idempotent Gas reward settlement.
 * Guards: unique gasPaymentId reward, self-referral block, shared-membership fraud.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  Prisma,
  type ReferralStatus,
  type GasTransactionType,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const MAX_TX_RETRIES = 3 as const;
const TX_TIMEOUT_MS = 15_000;
const TX_MAX_WAIT_MS = 5_000;

/** Default 15% recurring Gas reward on referred purchases (basis points). */
const DEFAULT_REWARD_BPS = 1_500;
/** Soft cap so oversized packs cannot mint unbounded referral Gas. */
const DEFAULT_REWARD_CAP = 250_000;

export type AffiliateStats = {
  workspaceId: string;
  referralCode: string;
  referralCount: number;
  qualifiedCount: number;
  rewardedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalGasEarned: number;
  conversionRate: number;
  qualificationRate: number;
};

export type ClaimReferralResult = {
  rewardId: string;
  attributionId: string;
  referrerWorkspaceId: string;
  referredWorkspaceId: string;
  gasPaymentId: string;
  gasAmount: number;
  balanceAfter: number;
  ledgerId: string;
  alreadyClaimed: boolean;
  status: ReferralStatus;
};

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === "P2034" || err.code === "P2002";
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

function asMetaRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function resolveReferralRewardGas(purchasedGas: number): number {
  const bpsEnv = Number.parseInt(
    process.env.REFERRAL_REWARD_BPS?.trim() ?? "",
    10
  );
  const capEnv = Number.parseInt(
    process.env.REFERRAL_REWARD_CAP_GAS?.trim() ?? "",
    10
  );
  const bps =
    Number.isFinite(bpsEnv) && bpsEnv >= 0 ? bpsEnv : DEFAULT_REWARD_BPS;
  const cap =
    Number.isFinite(capEnv) && capEnv > 0 ? capEnv : DEFAULT_REWARD_CAP;
  const raw = Math.floor((Math.max(0, Math.trunc(purchasedGas)) * bps) / 10_000);
  return Math.max(0, Math.min(raw, cap));
}

function mintReferralCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase();
  return `SS${raw}`;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Ensure the workspace has a stable public referral code.
 */
export async function ensureReferralCode(workspaceId: string): Promise<{
  id: string;
  code: string;
  workspaceId: string;
}> {
  const prisma = getPrisma();
  const existing = await prisma.referralCode.findUnique({
    where: { workspaceId },
    select: { id: true, code: true, workspaceId: true },
  });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = mintReferralCode();
    try {
      return await prisma.referralCode.create({
        data: { workspaceId, code },
        select: { id: true, code: true, workspaceId: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raced = await prisma.referralCode.findUnique({
          where: { workspaceId },
          select: { id: true, code: true, workspaceId: true },
        });
        if (raced) return raced;
        continue;
      }
      throw err;
    }
  }

  // Deterministic fallback if random collisions persist.
  const fallback = `SS${createHash("sha256")
    .update(workspaceId)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase()}`;
  return prisma.referralCode.upsert({
    where: { workspaceId },
    create: { workspaceId, code: fallback },
    update: {},
    select: { id: true, code: true, workspaceId: true },
  });
}

/**
 * Detect self-referral + shared-seat fraud between two workspaces.
 */
export async function detectReferralFraud(
  referrerWorkspaceId: string,
  referredWorkspaceId: string
): Promise<{ blocked: boolean; reason: string | null }> {
  if (referrerWorkspaceId === referredWorkspaceId) {
    return { blocked: true, reason: "self_referral" };
  }

  const prisma = getPrisma();
  const overlap = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT a."userId"
    FROM "WorkspaceMembership" a
    INNER JOIN "WorkspaceMembership" b
      ON a."userId" = b."userId"
    WHERE a."workspaceId" = ${referrerWorkspaceId}
      AND b."workspaceId" = ${referredWorkspaceId}
    LIMIT 1
  `;

  if (overlap.length > 0) {
    return { blocked: true, reason: "shared_membership" };
  }

  return { blocked: false, reason: null };
}

/**
 * Attribute a referred workspace to a referral code (idempotent).
 */
export async function attributeReferral(input: {
  referredWorkspaceId: string;
  referralCode: string;
}): Promise<{
  attributionId: string;
  referrerWorkspaceId: string;
  status: ReferralStatus;
  created: boolean;
  rejected: boolean;
  reason: string | null;
}> {
  const prisma = getPrisma();
  const code = normalizeCode(input.referralCode);
  if (!code) {
    throw new Error("referralCode is required.");
  }

  const referral = await prisma.referralCode.findUnique({
    where: { code },
    select: { id: true, workspaceId: true, code: true },
  });
  if (!referral) {
    throw new Error(`Unknown referral code: ${code}`);
  }

  const fraud = await detectReferralFraud(
    referral.workspaceId,
    input.referredWorkspaceId
  );
  if (fraud.blocked) {
    const rejected = await prisma.referralAttribution.upsert({
      where: { referredWorkspaceId: input.referredWorkspaceId },
      create: {
        referralCodeId: referral.id,
        referrerWorkspaceId: referral.workspaceId,
        referredWorkspaceId: input.referredWorkspaceId,
        status: "REJECTED",
        rejectedReason: fraud.reason,
      },
      update: {
        status: "REJECTED",
        rejectedReason: fraud.reason ?? "fraud",
      },
      select: {
        id: true,
        referrerWorkspaceId: true,
        status: true,
      },
    });
    return {
      attributionId: rejected.id,
      referrerWorkspaceId: rejected.referrerWorkspaceId,
      status: rejected.status,
      created: false,
      rejected: true,
      reason: fraud.reason,
    };
  }

  const existing = await prisma.referralAttribution.findUnique({
    where: { referredWorkspaceId: input.referredWorkspaceId },
    select: {
      id: true,
      referrerWorkspaceId: true,
      status: true,
      referralCodeId: true,
    },
  });

  if (existing) {
    return {
      attributionId: existing.id,
      referrerWorkspaceId: existing.referrerWorkspaceId,
      status: existing.status,
      created: false,
      rejected: existing.status === "REJECTED",
      reason: existing.status === "REJECTED" ? "already_rejected" : null,
    };
  }

  try {
    const created = await prisma.referralAttribution.create({
      data: {
        referralCodeId: referral.id,
        referrerWorkspaceId: referral.workspaceId,
        referredWorkspaceId: input.referredWorkspaceId,
        status: "PENDING",
      },
      select: {
        id: true,
        referrerWorkspaceId: true,
        status: true,
      },
    });
    return {
      attributionId: created.id,
      referrerWorkspaceId: created.referrerWorkspaceId,
      status: created.status,
      created: true,
      rejected: false,
      reason: null,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const raced = await prisma.referralAttribution.findUnique({
        where: { referredWorkspaceId: input.referredWorkspaceId },
        select: {
          id: true,
          referrerWorkspaceId: true,
          status: true,
        },
      });
      if (raced) {
        return {
          attributionId: raced.id,
          referrerWorkspaceId: raced.referrerWorkspaceId,
          status: raced.status,
          created: false,
          rejected: raced.status === "REJECTED",
          reason: null,
        };
      }
    }
    throw err;
  }
}

export async function getAffiliateStats(
  workspaceId: string
): Promise<AffiliateStats> {
  const prisma = getPrisma();
  const codeRow = await ensureReferralCode(workspaceId);

  const [counts, earned] = await Promise.all([
    prisma.referralAttribution.groupBy({
      by: ["status"],
      where: { referrerWorkspaceId: workspaceId },
      _count: { _all: true },
    }),
    prisma.referralReward.aggregate({
      where: { referrerWorkspaceId: workspaceId },
      _sum: { gasAmount: true },
      _count: { _all: true },
    }),
  ]);

  const byStatus: Record<ReferralStatus, number> = {
    PENDING: 0,
    QUALIFIED: 0,
    REWARDED: 0,
    REJECTED: 0,
  };
  for (const row of counts) {
    byStatus[row.status] = row._count._all;
  }

  const referralCount =
    byStatus.PENDING +
    byStatus.QUALIFIED +
    byStatus.REWARDED +
    byStatus.REJECTED;
  const convertible = referralCount - byStatus.REJECTED;
  const converted = byStatus.QUALIFIED + byStatus.REWARDED;
  const conversionRate =
    convertible > 0 ? Number((converted / convertible).toFixed(4)) : 0;
  const qualificationRate =
    referralCount > 0 ? Number((converted / referralCount).toFixed(4)) : 0;

  return {
    workspaceId,
    referralCode: codeRow.code,
    referralCount,
    qualifiedCount: byStatus.QUALIFIED,
    rewardedCount: byStatus.REWARDED,
    pendingCount: byStatus.PENDING,
    rejectedCount: byStatus.REJECTED,
    totalGasEarned: earned._sum.gasAmount ?? 0,
    conversionRate,
    qualificationRate,
  };
}

/**
 * Idempotent claim: credit referrer once per COMPLETED GasPayment.
 */
export async function claimReferralReward(input: {
  gasPaymentId: string;
  /** Optional code when attribution is missing but present on payment metadata / request. */
  referralCode?: string | null;
}): Promise<ClaimReferralResult> {
  const prisma = getPrisma();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const payments = await tx.$queryRaw<
            Array<{
              id: string;
              workspaceId: string;
              gasAmount: number;
              status: string;
              metadataJson: unknown;
            }>
          >`
            SELECT id, "workspaceId", "gasAmount", status, "metadataJson"
            FROM "GasPayment"
            WHERE id = ${input.gasPaymentId}
            FOR UPDATE
          `;
          const payment = payments[0];
          if (!payment) {
            throw new Error(`GasPayment not found: ${input.gasPaymentId}`);
          }
          if (payment.status !== "COMPLETED") {
            throw new Error(
              `GasPayment must be COMPLETED to claim referral (status=${payment.status}).`
            );
          }

          const existingReward = await tx.referralReward.findUnique({
            where: { gasPaymentId: payment.id },
            select: {
              id: true,
              attributionId: true,
              referrerWorkspaceId: true,
              referredWorkspaceId: true,
              gasPaymentId: true,
              gasAmount: true,
              ledgerId: true,
            },
          });
          if (existingReward) {
            const ws = await tx.workspace.findUnique({
              where: { id: existingReward.referrerWorkspaceId },
              select: { gasBalance: true },
            });
            return {
              rewardId: existingReward.id,
              attributionId: existingReward.attributionId,
              referrerWorkspaceId: existingReward.referrerWorkspaceId,
              referredWorkspaceId: existingReward.referredWorkspaceId,
              gasPaymentId: existingReward.gasPaymentId,
              gasAmount: existingReward.gasAmount,
              balanceAfter: ws?.gasBalance ?? 0,
              ledgerId: existingReward.ledgerId ?? "",
              alreadyClaimed: true,
              status: "REWARDED" as const,
            };
          }

          let attribution = await tx.referralAttribution.findUnique({
            where: { referredWorkspaceId: payment.workspaceId },
            select: {
              id: true,
              referralCodeId: true,
              referrerWorkspaceId: true,
              referredWorkspaceId: true,
              status: true,
              rejectedReason: true,
            },
          });

          if (!attribution) {
            const meta = asMetaRecord(payment.metadataJson);
            const codeRaw =
              input.referralCode?.trim() ||
              (typeof meta.referralCode === "string"
                ? meta.referralCode
                : typeof meta.ref === "string"
                  ? meta.ref
                  : "");
            if (!codeRaw) {
              throw new Error(
                "No referral attribution for this workspace and no referralCode on payment."
              );
            }

            const codeNorm = normalizeCode(codeRaw);
            const codeRow = await tx.referralCode.findUnique({
              where: { code: codeNorm },
              select: { id: true, workspaceId: true },
            });
            if (!codeRow) {
              throw new Error(`Unknown referral code: ${codeNorm}`);
            }

            if (codeRow.workspaceId === payment.workspaceId) {
              attribution = await tx.referralAttribution.create({
                data: {
                  referralCodeId: codeRow.id,
                  referrerWorkspaceId: codeRow.workspaceId,
                  referredWorkspaceId: payment.workspaceId,
                  status: "REJECTED",
                  rejectedReason: "self_referral",
                },
                select: {
                  id: true,
                  referralCodeId: true,
                  referrerWorkspaceId: true,
                  referredWorkspaceId: true,
                  status: true,
                  rejectedReason: true,
                },
              });
            } else {
              const overlap = await tx.$queryRaw<Array<{ userId: string }>>`
                SELECT a."userId"
                FROM "WorkspaceMembership" a
                INNER JOIN "WorkspaceMembership" b
                  ON a."userId" = b."userId"
                WHERE a."workspaceId" = ${codeRow.workspaceId}
                  AND b."workspaceId" = ${payment.workspaceId}
                LIMIT 1
              `;
              if (overlap.length > 0) {
                attribution = await tx.referralAttribution.create({
                  data: {
                    referralCodeId: codeRow.id,
                    referrerWorkspaceId: codeRow.workspaceId,
                    referredWorkspaceId: payment.workspaceId,
                    status: "REJECTED",
                    rejectedReason: "shared_membership",
                  },
                  select: {
                    id: true,
                    referralCodeId: true,
                    referrerWorkspaceId: true,
                    referredWorkspaceId: true,
                    status: true,
                    rejectedReason: true,
                  },
                });
              } else {
                attribution = await tx.referralAttribution.create({
                  data: {
                    referralCodeId: codeRow.id,
                    referrerWorkspaceId: codeRow.workspaceId,
                    referredWorkspaceId: payment.workspaceId,
                    status: "PENDING",
                  },
                  select: {
                    id: true,
                    referralCodeId: true,
                    referrerWorkspaceId: true,
                    referredWorkspaceId: true,
                    status: true,
                    rejectedReason: true,
                  },
                });
              }
            }
          }

          if (attribution.status === "REJECTED") {
            throw new Error(
              `Referral rejected (${attribution.rejectedReason ?? "fraud"}).`
            );
          }

          if (
            attribution.referrerWorkspaceId === attribution.referredWorkspaceId
          ) {
            await tx.referralAttribution.update({
              where: { id: attribution.id },
              data: {
                status: "REJECTED",
                rejectedReason: "self_referral",
              },
            });
            throw new Error("Self-referral is not allowed.");
          }

          const rewardGas = resolveReferralRewardGas(payment.gasAmount);
          if (rewardGas <= 0) {
            throw new Error("Referral reward amount resolved to zero.");
          }

          const locked = await tx.$queryRaw<
            Array<{ id: string; gasBalance: number }>
          >`
            SELECT id, "gasBalance"
            FROM "Workspace"
            WHERE id = ${attribution.referrerWorkspaceId}
            FOR UPDATE
          `;
          const referrer = locked[0];
          if (!referrer) {
            throw new Error(
              `Referrer workspace not found: ${attribution.referrerWorkspaceId}`
            );
          }

          const balanceAfter = referrer.gasBalance + rewardGas;
          await tx.workspace.update({
            where: { id: referrer.id },
            data: { gasBalance: balanceAfter },
          });

          const ledger = await tx.gasLedger.create({
            data: {
              workspaceId: referrer.id,
              amount: rewardGas,
              transactionType: "REFERRAL_BONUS" satisfies GasTransactionType,
              description: `Referral bonus · payment ${payment.id} · from workspace ${payment.workspaceId}`,
            },
          });

          const reward = await tx.referralReward.create({
            data: {
              attributionId: attribution.id,
              referralCodeId: attribution.referralCodeId,
              referrerWorkspaceId: attribution.referrerWorkspaceId,
              referredWorkspaceId: attribution.referredWorkspaceId,
              gasPaymentId: payment.id,
              gasAmount: rewardGas,
              ledgerId: ledger.id,
            },
          });

          await tx.referralAttribution.update({
            where: { id: attribution.id },
            data: {
              status: "REWARDED",
              qualifiedAt: new Date(),
            },
          });

          return {
            rewardId: reward.id,
            attributionId: attribution.id,
            referrerWorkspaceId: attribution.referrerWorkspaceId,
            referredWorkspaceId: attribution.referredWorkspaceId,
            gasPaymentId: payment.id,
            gasAmount: rewardGas,
            balanceAfter,
            ledgerId: ledger.id,
            alreadyClaimed: false,
            status: "REWARDED" as const,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: TX_TIMEOUT_MS,
          maxWait: TX_MAX_WAIT_MS,
        }
      );
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt >= MAX_TX_RETRIES - 1) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Referral claim failed after retries.");
}

/**
 * Fire-and-forget safe trigger after GasPayment settlement.
 * Never throws to the payment pipeline — logs and returns null on failure.
 */
export async function maybeAutoClaimReferralReward(input: {
  gasPaymentId: string;
  referredWorkspaceId: string;
  metadata?: Record<string, unknown>;
}): Promise<ClaimReferralResult | null> {
  try {
    const prisma = getPrisma();
    const attribution = await prisma.referralAttribution.findUnique({
      where: { referredWorkspaceId: input.referredWorkspaceId },
      select: { id: true, status: true },
    });

    const metaCode =
      typeof input.metadata?.referralCode === "string"
        ? input.metadata.referralCode
        : typeof input.metadata?.ref === "string"
          ? input.metadata.ref
          : null;

    if (!attribution && !metaCode) {
      return null;
    }

    if (attribution?.status === "REJECTED") {
      return null;
    }

    return await claimReferralReward({
      gasPaymentId: input.gasPaymentId,
      referralCode: metaCode,
    });
  } catch (err) {
    console.error("[affiliate] auto-claim skipped", {
      gasPaymentId: input.gasPaymentId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
