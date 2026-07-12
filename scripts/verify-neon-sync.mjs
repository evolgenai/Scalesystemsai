import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

config();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDirectConnectionString(connectionString) {
  return connectionString.replace("-pooler.", ".");
}

function withSslCompat(connectionString) {
  if (connectionString.includes("uselibpqcompat=")) {
    return connectionString;
  }

  const separator = connectionString.includes("?") ? "&" : "?";
  return `${connectionString}${separator}uselibpqcompat=true&connect_timeout=30`;
}

async function connectAndVerify(connectionString, label) {
  const pool = new pg.Pool({
    connectionString: withSslCompat(connectionString),
    max: 1,
    connectionTimeoutMillis: 45_000,
    idleTimeoutMillis: 5_000,
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const userCount = await prisma.user.count();

    console.log(`[Neon Sync] ${label} connected successfully.`);
    console.log(
      "[Neon Sync] Tables:",
      tables.map((t) => t.table_name).join(", ")
    );
    console.log("[Neon Sync] User rows:", userCount);
    return true;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function main() {
  const pooledUrl = process.env.DATABASE_URL;
  if (!pooledUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const attempts = [
    { label: "Pooled", url: pooledUrl },
    { label: "Direct", url: toDirectConnectionString(pooledUrl) },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    for (let retry = 1; retry <= 3; retry += 1) {
      try {
        const ok = await connectAndVerify(attempt.url, attempt.label);
        if (ok) {
          return;
        }
      } catch (error) {
        lastError = error;
        console.warn(
          `[Neon Sync] ${attempt.label} attempt ${retry}/3 failed:`,
          error?.code ?? error?.message ?? error
        );
        await sleep(retry * 2000);
      }
    }
  }

  throw lastError ?? new Error("Unable to verify Neon database connection.");
}

main().catch((error) => {
  console.error("[Neon Sync] Failed:", error?.message ?? error);
  process.exit(1);
});
