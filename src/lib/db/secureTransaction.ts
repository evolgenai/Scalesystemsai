import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

type TxClient = Omit<
  ReturnType<typeof getPrisma>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export type SecureTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

const DEFAULT_OPTS: SecureTransactionOptions = {
  isolationLevel: "ReadCommitted",
  maxWait: 5000,
  timeout: 10000,
};

/**
 * Wrap multi-step writes in a single Prisma transaction with bounded wait/timeout.
 */
export async function withSecureTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  opts: SecureTransactionOptions = {}
): Promise<T> {
  const merged = { ...DEFAULT_OPTS, ...opts };
  return getPrisma().$transaction(fn, {
    isolationLevel: merged.isolationLevel,
    maxWait: merged.maxWait,
    timeout: merged.timeout,
  });
}
