/**
 * Serverless-safe Prisma + pg Pool singleton.
 * Reuses global pool across hot reloads; reconnects after abrupt disconnects.
 * Prefer Node.js runtime (not Edge) — adapter uses `pg`.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolConfig } from "pg";

type PrismaGlobals = {
  prisma?: PrismaClient;
  pgPool?: Pool;
  prismaGeneration?: number;
};

const globalForPrisma = globalThis as unknown as PrismaGlobals;

const LOG_PREFIX = "[prisma]";

/** Cap connections per isolate — Vercel/serverless friendly. */
function resolvePoolConfig(connectionString: string): PoolConfig {
  const isProd = process.env.NODE_ENV === "production";
  const maxEnv = Number.parseInt(process.env.PRISMA_POOL_MAX ?? "", 10);
  const max = Number.isFinite(maxEnv) && maxEnv > 0 ? Math.min(maxEnv, 10) : isProd ? 3 : 5;

  return {
    connectionString,
    max,
    idleTimeoutMillis: Number.parseInt(
      process.env.PRISMA_POOL_IDLE_MS ?? "10000",
      10
    ),
    connectionTimeoutMillis: Number.parseInt(
      process.env.PRISMA_POOL_CONNECT_MS ?? "8000",
      10
    ),
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    application_name: "scalesystems-next",
  };
}

function attachPoolGuards(pool: Pool): void {
  pool.on("error", (err) => {
    console.error(`${LOG_PREFIX} pool error — scheduling reset`, {
      message: err.message,
      code: (err as NodeJS.ErrnoException).code,
    });
    void resetPrismaClient("pool_error");
  });
}

function createPool(connectionString: string): Pool {
  const pool = new Pool(resolvePoolConfig(connectionString));
  attachPoolGuards(pool);
  console.info(`${LOG_PREFIX} pool launched`, {
    max: resolvePoolConfig(connectionString).max,
    generation: (globalForPrisma.prismaGeneration ?? 0) + 1,
  });
  return pool;
}

function createPrismaClient(pool: Pool): PrismaClient {
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
    log:
      process.env.PRISMA_LOG === "1"
        ? [
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [{ emit: "stdout", level: "error" }],
  });
  return client;
}

let resetInFlight: Promise<void> | null = null;

/**
 * Tear down pool + client after disconnect / fatal pool errors.
 * Safe to call concurrently — coalesces into one reset.
 */
export async function resetPrismaClient(reason: string): Promise<void> {
  if (resetInFlight) return resetInFlight;

  resetInFlight = (async () => {
    console.warn(`${LOG_PREFIX} reset start`, { reason });
    const client = globalForPrisma.prisma;
    const pool = globalForPrisma.pgPool;
    globalForPrisma.prisma = undefined;
    globalForPrisma.pgPool = undefined;
    globalForPrisma.prismaGeneration = (globalForPrisma.prismaGeneration ?? 0) + 1;

    try {
      await client?.$disconnect();
    } catch (err) {
      console.error(`${LOG_PREFIX} $disconnect failed`, {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await pool?.end();
    } catch (err) {
      console.error(`${LOG_PREFIX} pool.end failed`, {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    console.info(`${LOG_PREFIX} reset complete`, {
      generation: globalForPrisma.prismaGeneration,
    });
  })().finally(() => {
    resetInFlight = null;
  });

  return resetInFlight;
}

export function isPrismaDisconnectError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      err.code === "P1001" ||
      err.code === "P1002" ||
      err.code === "P1017" ||
      err.code === "P2024"
    );
  }
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientRustPanicError) return true;

  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes("connection terminated") ||
      m.includes("server closed the connection") ||
      m.includes("cannot use a pool after calling end") ||
      m.includes("not queryable") ||
      m.includes("econnreset") ||
      m.includes("econnrefused") ||
      m.includes("connection timeout") ||
      m.includes("client has encountered a connection error")
    );
  }
  return false;
}

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not configured.");
  }

  // Prefer pooled Neon URL when provided (serverless).
  const pooled =
    process.env.DATABASE_POOL_URL?.trim() ||
    process.env.DATABASE_URL_POOLED?.trim() ||
    connectionString;

  const pool = globalForPrisma.pgPool ?? createPool(pooled);
  globalForPrisma.pgPool = pool;

  const client = createPrismaClient(pool);
  globalForPrisma.prisma = client;
  globalForPrisma.prismaGeneration = globalForPrisma.prismaGeneration ?? 1;

  return client;
}

const MAX_PRISMA_RETRIES = 2 as const;

/**
 * Run a DB operation with one automatic reconnect on sudden disconnect.
 */
export async function withPrisma<T>(
  operation: (db: PrismaClient) => Promise<T>,
  label = "query"
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_PRISMA_RETRIES; attempt += 1) {
    const db = getPrisma();
    try {
      const result = await operation(db);
      try {
        const { recordPoolSuccess } = await import("@/lib/db/poolMonitor");
        recordPoolSuccess();
      } catch {
        /* monitor optional */
      }
      return result;
    } catch (err) {
      lastError = err;
      if (!isPrismaDisconnectError(err) || attempt >= MAX_PRISMA_RETRIES) {
        // Final failure: let poolMonitor intercept P2024 / disconnects (log + heal).
        if (isPrismaDisconnectError(err)) {
          try {
            const { interceptPoolFailure, isPoolTimeoutError } = await import(
              "@/lib/db/poolMonitor"
            );
            if (isPoolTimeoutError(err) || isPrismaDisconnectError(err)) {
              await interceptPoolFailure(err, label);
            }
          } catch (monitorErr) {
            console.error(`${LOG_PREFIX} poolMonitor intercept failed`, {
              message:
                monitorErr instanceof Error
                  ? monitorErr.message
                  : String(monitorErr),
            });
          }
        }
        throw err;
      }
      console.warn(`${LOG_PREFIX} disconnect during ${label} — reconnect`, {
        attempt: attempt + 1,
        message: err instanceof Error ? err.message : String(err),
      });
      try {
        const { interceptPoolFailure } = await import("@/lib/db/poolMonitor");
        await interceptPoolFailure(err, label);
      } catch {
        await resetPrismaClient(`reconnect:${label}`);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${LOG_PREFIX} operation failed: ${label}`);
}
