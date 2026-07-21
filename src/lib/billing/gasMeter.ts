/**
 * Gas credit meter — per-node deduction against Workspace.gasBalance + GasLedger.
 * Concurrent-safe via FOR UPDATE row locks and bounded Serializable retries.
 */

import { createHash } from "node:crypto";
import { Prisma, type GasTransactionType } from "@prisma/client";
import { recordDailyUsageInTx } from "@/lib/billing/usageAnalytics";
import { getPrisma } from "@/lib/prisma";
import { normalizeNodeType } from "@/lib/swarm/types";
import { publishGasEvent } from "@/lib/telemetry/telemetryBus";

const MAX_TX_RETRIES = 3 as const;
const TX_TIMEOUT_MS = 15_000;
const TX_MAX_WAIT_MS = 5_000;

export const INSUFFICIENT_GAS_MESSAGE =
  "Insufficient Gas Credits. Please top up workspace." as const;

/** Fixed gas costs by metered node family. */
export const GAS_COSTS = {
  webhook_trigger: 10,
  scraper: 50,
  ai_agent: 100,
} as const;

export type MeteredGasKind = keyof typeof GAS_COSTS;

export class InsufficientGasError extends Error {
  readonly code = "INSUFFICIENT_GAS" as const;

  constructor(message: string = INSUFFICIENT_GAS_MESSAGE) {
    super(message);
    this.name = "InsufficientGasError";
  }
}

export type DeductGasResult = {
  workspaceId: string;
  nodeType: string;
  gasKind: MeteredGasKind | null;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  ledgerId: string | null;
  skipped: boolean;
};

type LockedGasRow = {
  id: string;
  gasBalance: number;
};

function emitGasDeduction(
  result: DeductGasResult,
  description?: string | null
): void {
  if (result.skipped || result.amount <= 0) return;
  try {
    publishGasEvent(result.workspaceId, {
      amount: result.amount,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      gasKind: result.gasKind,
      nodeType: result.nodeType,
      ledgerId: result.ledgerId,
      description: description ?? null,
    });
  } catch {
    /* telemetry must never break metering */
  }
}

function isRetryableTxError(err: unknown): boolean {
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

async function lockWorkspaceGas(
  tx: Prisma.TransactionClient,
  workspaceId: string
): Promise<LockedGasRow | null> {
  const rows = await tx.$queryRaw<LockedGasRow[]>`
    SELECT id, "gasBalance"
    FROM "Workspace"
    WHERE id = ${workspaceId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Map workflow node types → metered gas kind.
 * Webhook Trigger = 10, Scraper = 50, AI Agent = 100. Others are free (0).
 * Python terminal / skill invocations map onto existing ledger categories
 * (no schema or analytics breaking changes).
 */
export function resolveGasKind(nodeType: string): MeteredGasKind | null {
  const normalized = normalizeNodeType(nodeType);
  const raw = nodeType.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (
    normalized === "trigger" ||
    raw === "webhook" ||
    raw === "webhook_trigger" ||
    raw.includes("webhook")
  ) {
    return "webhook_trigger";
  }
  if (
    normalized === "scraper" ||
    raw === "skill_playwright" ||
    raw.includes("playwright")
  ) {
    return "scraper";
  }
  if (
    normalized === "ai" ||
    normalized === "agent" ||
    raw === "python_terminal" ||
    raw === "skill_install" ||
    raw.startsWith("skill_")
  ) {
    return "ai_agent";
  }
  return null;
}

/**
 * Atomically deduct an explicit gas amount under an existing MeteredGasKind.
 * Used by the Python virtual terminal + skill metering (additive; does not
 * alter GAS_COSTS or existing deductGas callers).
 */
export async function deductGasUnits(
  workspaceId: string,
  amount: number,
  options?: {
    gasKind?: MeteredGasKind;
    description?: string;
    nodeType?: string;
  }
): Promise<DeductGasResult> {
  const units = Math.max(0, Math.trunc(amount));
  const gasKind = options?.gasKind ?? "ai_agent";
  const nodeType = options?.nodeType ?? gasKind;
  const prisma = getPrisma();

  if (units <= 0) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { gasBalance: true },
    });
    if (!ws) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    if (ws.gasBalance <= 0) {
      throw new InsufficientGasError();
    }
    return {
      workspaceId,
      nodeType,
      gasKind,
      amount: 0,
      balanceBefore: ws.gasBalance,
      balanceAfter: ws.gasBalance,
      ledgerId: null,
      skipped: true,
    };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const locked = await lockWorkspaceGas(tx, workspaceId);
          if (!locked) {
            throw new Error(`Workspace not found: ${workspaceId}`);
          }

          if (locked.gasBalance <= 0 || locked.gasBalance < units) {
            throw new InsufficientGasError();
          }

          const balanceBefore = locked.gasBalance;
          const balanceAfter = balanceBefore - units;

          await tx.workspace.update({
            where: { id: locked.id },
            data: { gasBalance: balanceAfter },
          });

          const ledger = await tx.gasLedger.create({
            data: {
              workspaceId: locked.id,
              amount: units,
              transactionType: "EXECUTION_FEE" satisfies GasTransactionType,
              description:
                options?.description ??
                `Execution fee: ${gasKind} (${nodeType}) — ${units} GAS`,
            },
          });

          await recordDailyUsageInTx(tx, locked.id, gasKind, units);

          return {
            workspaceId: locked.id,
            nodeType,
            gasKind,
            amount: units,
            balanceBefore,
            balanceAfter,
            ledgerId: ledger.id,
            skipped: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: TX_TIMEOUT_MS,
          maxWait: TX_MAX_WAIT_MS,
        }
      );
      emitGasDeduction(result, options?.description);
      return result;
    } catch (err) {
      lastError = err;
      if (err instanceof InsufficientGasError) throw err;
      if (!isRetryableTxError(err) || attempt >= MAX_TX_RETRIES - 1) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gas deduction failed after retries.");
}

export function resolveGasCost(nodeType: string): number {
  const kind = resolveGasKind(nodeType);
  return kind ? GAS_COSTS[kind] : 0;
}

export function hashCliApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey.trim()).digest("hex");
}

/**
 * Atomically deduct gas for a single workflow node execution.
 * Throws InsufficientGasError when gasBalance <= 0 or balance < cost.
 */
export async function deductGas(
  workspaceId: string,
  nodeType: string
): Promise<DeductGasResult> {
  const amount = resolveGasCost(nodeType);
  const gasKind = resolveGasKind(nodeType);
  const prisma = getPrisma();

  if (amount <= 0 || !gasKind) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { gasBalance: true },
    });
    if (!ws) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    if (ws.gasBalance <= 0) {
      throw new InsufficientGasError();
    }
    return {
      workspaceId,
      nodeType,
      gasKind: null,
      amount: 0,
      balanceBefore: ws.gasBalance,
      balanceAfter: ws.gasBalance,
      ledgerId: null,
      skipped: true,
    };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const locked = await lockWorkspaceGas(tx, workspaceId);
          if (!locked) {
            throw new Error(`Workspace not found: ${workspaceId}`);
          }

          if (locked.gasBalance <= 0 || locked.gasBalance < amount) {
            throw new InsufficientGasError();
          }

          const balanceBefore = locked.gasBalance;
          const balanceAfter = balanceBefore - amount;

          await tx.workspace.update({
            where: { id: locked.id },
            data: { gasBalance: balanceAfter },
          });

          const ledger = await tx.gasLedger.create({
            data: {
              workspaceId: locked.id,
              amount,
              transactionType: "EXECUTION_FEE" satisfies GasTransactionType,
              description: `Execution fee: ${gasKind} (${nodeType}) — ${amount} GAS`,
            },
          });

          await recordDailyUsageInTx(tx, locked.id, gasKind, amount);

          return {
            workspaceId: locked.id,
            nodeType,
            gasKind,
            amount,
            balanceBefore,
            balanceAfter,
            ledgerId: ledger.id,
            skipped: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: TX_TIMEOUT_MS,
          maxWait: TX_MAX_WAIT_MS,
        }
      );
      emitGasDeduction(
        result,
        `Execution fee: ${gasKind} (${nodeType}) — ${amount} GAS`
      );
      return result;
    } catch (err) {
      lastError = err;
      if (err instanceof InsufficientGasError) throw err;
      if (!isRetryableTxError(err) || attempt >= MAX_TX_RETRIES - 1) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gas deduction failed after retries.");
}

/**
 * Deduct gas for every node in a blueprint graph (pre-execution reserve).
 * Fail-fast on first insufficient balance.
 */
export async function deductGasForNodes(
  workspaceId: string,
  nodeTypes: string[]
): Promise<DeductGasResult[]> {
  const results: DeductGasResult[] = [];
  for (const nodeType of nodeTypes) {
    results.push(await deductGas(workspaceId, nodeType));
  }
  return results;
}

export type CreditGasResult = {
  workspaceId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  ledgerId: string;
};

/**
 * Atomically credit Gas (RECHARGE) under FOR UPDATE + Serializable retries.
 */
export async function creditGas(
  workspaceId: string,
  amount: number,
  description: string
): Promise<CreditGasResult> {
  const units = Math.max(0, Math.trunc(amount));
  if (units <= 0) {
    throw new Error("creditGas requires a positive integer amount.");
  }

  const prisma = getPrisma();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const locked = await lockWorkspaceGas(tx, workspaceId);
          if (!locked) {
            throw new Error(`Workspace not found: ${workspaceId}`);
          }

          const balanceBefore = locked.gasBalance;
          const balanceAfter = balanceBefore + units;

          await tx.workspace.update({
            where: { id: locked.id },
            data: { gasBalance: balanceAfter },
          });

          const ledger = await tx.gasLedger.create({
            data: {
              workspaceId: locked.id,
              amount: units,
              transactionType: "RECHARGE" satisfies GasTransactionType,
              description,
            },
          });

          return {
            workspaceId: locked.id,
            amount: units,
            balanceBefore,
            balanceAfter,
            ledgerId: ledger.id,
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
      if (!isRetryableTxError(err) || attempt >= MAX_TX_RETRIES - 1) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gas credit failed after retries.");
}
