/**
 * Idempotent Gas payment settlement — credits Workspace once per GasPayment row.
 */

import {
  Prisma,
  type GasPaymentProvider,
  type GasPaymentStatus,
} from "@prisma/client";
import { creditGas } from "@/lib/billing/gasMeter";
import { getPrisma } from "@/lib/prisma";

const MAX_TX_RETRIES = 3 as const;

export type SettleGasPaymentInput = {
  paymentId: string;
  externalIdAlt?: string | null;
  metadata?: Record<string, unknown>;
  description?: string;
};

export type SettleGasPaymentResult = {
  paymentId: string;
  workspaceId: string;
  gasAmount: number;
  balanceAfter: number;
  ledgerId: string;
  alreadyCredited: boolean;
  status: GasPaymentStatus;
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

/**
 * Mark payment COMPLETED and credit Gas exactly once (row lock on GasPayment).
 */
export async function settleGasPayment(
  input: SettleGasPaymentInput
): Promise<SettleGasPaymentResult> {
  const prisma = getPrisma();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              workspaceId: string;
              gasAmount: number;
              status: GasPaymentStatus;
              ledgerId: string | null;
              packageId: string;
              provider: GasPaymentProvider;
              externalId: string;
              metadataJson: unknown;
            }>
          >`
            SELECT id, "workspaceId", "gasAmount", status, "ledgerId",
                   "packageId", provider, "externalId", "metadataJson"
            FROM "GasPayment"
            WHERE id = ${input.paymentId}
            FOR UPDATE
          `;

          const payment = rows[0];
          if (!payment) {
            throw new Error(`GasPayment not found: ${input.paymentId}`);
          }

          if (payment.status === "COMPLETED" && payment.ledgerId) {
            const ws = await tx.workspace.findUnique({
              where: { id: payment.workspaceId },
              select: { gasBalance: true },
            });
            return {
              paymentId: payment.id,
              workspaceId: payment.workspaceId,
              gasAmount: payment.gasAmount,
              balanceAfter: ws?.gasBalance ?? 0,
              ledgerId: payment.ledgerId,
              alreadyCredited: true,
              status: "COMPLETED" as const,
            };
          }

          if (
            payment.status === "FAILED" ||
            payment.status === "CANCELLED" ||
            payment.status === "EXPIRED"
          ) {
            throw new Error(
              `Cannot settle GasPayment in status ${payment.status}.`
            );
          }

          const description =
            input.description ??
            `Gas recharge · ${payment.provider} · ${payment.packageId} · ${payment.externalId}`;

          const locked = await tx.$queryRaw<
            Array<{ id: string; gasBalance: number }>
          >`
            SELECT id, "gasBalance"
            FROM "Workspace"
            WHERE id = ${payment.workspaceId}
            FOR UPDATE
          `;
          const ws = locked[0];
          if (!ws) {
            throw new Error(`Workspace not found: ${payment.workspaceId}`);
          }

          const balanceAfter = ws.gasBalance + payment.gasAmount;
          await tx.workspace.update({
            where: { id: ws.id },
            data: { gasBalance: balanceAfter },
          });

          const ledger = await tx.gasLedger.create({
            data: {
              workspaceId: ws.id,
              amount: payment.gasAmount,
              transactionType: "RECHARGE",
              description,
            },
          });

          await tx.gasPayment.update({
            where: { id: payment.id },
            data: {
              status: "COMPLETED",
              ledgerId: ledger.id,
              creditedAt: new Date(),
              externalIdAlt: input.externalIdAlt ?? undefined,
              metadataJson: {
                ...asMetaRecord(payment.metadataJson),
                ...(input.metadata ?? {}),
              } as Prisma.InputJsonValue,
            },
          });

          return {
            paymentId: payment.id,
            workspaceId: payment.workspaceId,
            gasAmount: payment.gasAmount,
            balanceAfter,
            ledgerId: ledger.id,
            alreadyCredited: false,
            status: "COMPLETED" as const,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15_000,
          maxWait: 5_000,
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
    : new Error("Gas payment settlement failed after retries.");
}

/**
 * Create a PENDING GasPayment row (unique on externalId).
 */
export async function createPendingGasPayment(input: {
  workspaceId: string;
  provider: GasPaymentProvider;
  packageId: string;
  gasAmount: number;
  amountMinor: number;
  currency: string;
  externalId: string;
  externalIdAlt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const prisma = getPrisma();
  return prisma.gasPayment.create({
    data: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      packageId: input.packageId,
      gasAmount: input.gasAmount,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "PENDING",
      externalId: input.externalId,
      externalIdAlt: input.externalIdAlt ?? undefined,
      metadataJson: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function findGasPaymentByExternalId(externalId: string) {
  return getPrisma().gasPayment.findUnique({ where: { externalId } });
}

/** Re-export creditGas for callers that settle outside GasPayment rows. */
export { creditGas };
