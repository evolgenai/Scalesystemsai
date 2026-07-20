/**
 * CLI: verify telemetry/audit lookup indexes + EXPLAIN ANALYZE ≤50ms budget.
 * Usage: node --env-file=.env scripts/verify-db-indexes.mjs
 */

import { config } from "dotenv";
import { createRequire } from "node:module";

config();

const require = createRequire(import.meta.url);

async function loadVerifier() {
  // Prefer compiled/tsx path via dynamic import of the TS module through Next alias —
  // standalone script reimplements the critical checks with Prisma directly for Node CLI.
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const pg = require("pg");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 5_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  return { prisma, pool };
}

const BUDGET_MS = Number.parseInt(process.env.INDEX_LATENCY_BUDGET_MS ?? "50", 10) || 50;

const REQUIRED = [
  { table: "TelemetryAuditLog", hint: "(workspaceId, createdAt", purpose: "audit timeline" },
  { table: "TelemetryAuditLog", hint: "(workspaceId, action, createdAt", purpose: "audit action filter" },
  { table: "TelemetryAuditLog", hint: "(workspaceId, outcome, createdAt", purpose: "audit outcome filter" },
  { table: "AppErrorLog", hint: "(workspaceId, resolved, createdAt", purpose: "unresolved errors" },
  { table: "AppErrorLog", hint: "(workspaceId, createdAt", purpose: "error timeline" },
  { table: "WorkspaceMeterEvent", hint: "(workspaceId, createdAt", purpose: "meter rollups" },
  { table: "WorkspaceMeterEvent", hint: "(workspaceId, source, createdAt", purpose: "meter by source" },
  { table: "TelemetryAlertRule", hint: "(workspaceId, enabled", purpose: "alert processor" },
];

const PROBES = [
  {
    name: "audit_workspace_timeline",
    sql: `SELECT id FROM "TelemetryAuditLog" WHERE "workspaceId" = '00000000-0000-0000-0000-000000000000' ORDER BY "createdAt" DESC LIMIT 50`,
  },
  {
    name: "audit_action_filter",
    sql: `SELECT id FROM "TelemetryAuditLog" WHERE "workspaceId" = '00000000-0000-0000-0000-000000000000' AND action = 'auth.login' ORDER BY "createdAt" DESC LIMIT 50`,
  },
  {
    name: "errors_unresolved",
    sql: `SELECT id FROM "AppErrorLog" WHERE "workspaceId" = '00000000-0000-0000-0000-000000000000' AND resolved = false ORDER BY "createdAt" DESC LIMIT 50`,
  },
  {
    name: "meter_workspace_roll",
    sql: `SELECT COALESCE(SUM("feeUsd"), 0) FROM "WorkspaceMeterEvent" WHERE "workspaceId" = '00000000-0000-0000-0000-000000000000' AND "createdAt" > NOW() - INTERVAL '1 hour'`,
  },
];

function parseTiming(lines) {
  let planningTimeMs = null;
  let executionTimeMs = null;
  for (const line of lines) {
    const plan = /Planning Time:\s*([\d.]+)\s*ms/i.exec(line);
    if (plan) planningTimeMs = Number.parseFloat(plan[1]);
    const exec = /Execution Time:\s*([\d.]+)\s*ms/i.exec(line);
    if (exec) executionTimeMs = Number.parseFloat(exec[1]);
  }
  return { planningTimeMs, executionTimeMs };
}

function normalizeIndexText(s) {
  return s.toLowerCase().replace(/["`]/g, "").replace(/\s+/g, "");
}

async function main() {
  const { prisma, pool } = await loadVerifier();
  let exitCode = 0;

  try {
    const indexes = await prisma.$queryRaw`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;

    console.log(`[index-verify] budget=${BUDGET_MS}ms indexes_found=${indexes.length}`);

    const missing = [];
    for (const spec of REQUIRED) {
      const hint = normalizeIndexText(spec.hint);
      const hit = indexes.find((row) => {
        if (row.tablename.toLowerCase() !== spec.table.toLowerCase()) return false;
        return normalizeIndexText(row.indexdef).includes(hint);
      });
      if (hit) {
        console.log(`  ✓ ${spec.table} ${spec.hint} → ${hit.indexname}`);
      } else {
        console.log(`  ✗ MISSING ${spec.table} ${spec.hint} (${spec.purpose})`);
        missing.push(spec);
      }
    }

    const slow = [];
    for (const probe of PROBES) {
      try {
        const rows = await prisma.$queryRawUnsafe(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${probe.sql}`
        );
        const lines = rows.map((r) => r["QUERY PLAN"] ?? "").filter(Boolean);
        const { planningTimeMs, executionTimeMs } = parseTiming(lines);
        const ok =
          executionTimeMs !== null && executionTimeMs <= BUDGET_MS;
        const mark = ok ? "✓" : "✗";
        console.log(
          `  ${mark} probe ${probe.name}: plan=${planningTimeMs ?? "n/a"}ms exec=${executionTimeMs ?? "n/a"}ms`
        );
        if (!ok) slow.push(probe.name);
      } catch (err) {
        console.log(
          `  ✗ probe ${probe.name}: ${err instanceof Error ? err.message : err}`
        );
        slow.push(probe.name);
      }
    }

    if (missing.length || slow.length) {
      exitCode = 1;
      console.error(
        `[index-verify] FAILED missing=${missing.length} slow=${slow.length}`
      );
    } else {
      console.log("[index-verify] PASSED");
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[index-verify] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
