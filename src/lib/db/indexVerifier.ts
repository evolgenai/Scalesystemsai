/**
 * Database index verifier for high-volume telemetry / audit lookup paths.
 * Ensures required indexes exist and sample EXPLAIN ANALYZE plans stay under budget.
 */

import { getPrisma } from "@/lib/prisma";

export const INDEX_LATENCY_BUDGET_MS = 50;

export type RequiredIndexSpec = {
  table: string;
  /** Substring match against pg_indexes.indexdef (case-insensitive). */
  columnsHint: string;
  purpose: string;
};

export type IndexPresenceResult = {
  table: string;
  columnsHint: string;
  purpose: string;
  present: boolean;
  matchedIndex: string | null;
};

export type QueryProbeResult = {
  name: string;
  sql: string;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  withinBudget: boolean;
  detail: string;
};

export type IndexVerificationReport = {
  ok: boolean;
  budgetMs: number;
  checkedAt: string;
  indexes: IndexPresenceResult[];
  missingIndexes: IndexPresenceResult[];
  probes: QueryProbeResult[];
  slowProbes: QueryProbeResult[];
};

/** Critical composite indexes for tenant audit + telemetry aggregation. */
export const REQUIRED_TELEMETRY_INDEXES: RequiredIndexSpec[] = [
  {
    table: "TelemetryAuditLog",
    columnsHint: "(workspaceId, createdAt",
    purpose: "workspace audit time-series feed",
  },
  {
    table: "TelemetryAuditLog",
    columnsHint: "(workspaceId, action, createdAt",
    purpose: "action-filtered audit reads",
  },
  {
    table: "TelemetryAuditLog",
    columnsHint: "(workspaceId, outcome, createdAt",
    purpose: "outcome-filtered compliance scans",
  },
  {
    table: "AppErrorLog",
    columnsHint: "(workspaceId, resolved, createdAt",
    purpose: "unresolved error aggregation",
  },
  {
    table: "AppErrorLog",
    columnsHint: "(workspaceId, createdAt",
    purpose: "workspace error timeline",
  },
  {
    table: "WorkspaceMeterEvent",
    columnsHint: "(workspaceId, createdAt",
    purpose: "meter spend rollups",
  },
  {
    table: "WorkspaceMeterEvent",
    columnsHint: "(workspaceId, source, createdAt",
    purpose: "source-scoped meter aggregation",
  },
  {
    table: "TelemetryAlertRule",
    columnsHint: "(workspaceId, enabled",
    purpose: "enabled alert rule processor scans",
  },
];

type PgIndexRow = {
  tablename: string;
  indexname: string;
  indexdef: string;
};

type ExplainAnalyzeRow = {
  "QUERY PLAN"?: string;
};

function parseExplainTiming(lines: string[]): {
  planningTimeMs: number | null;
  executionTimeMs: number | null;
} {
  let planningTimeMs: number | null = null;
  let executionTimeMs: number | null = null;
  for (const line of lines) {
    const plan = /Planning Time:\s*([\d.]+)\s*ms/i.exec(line);
    if (plan) planningTimeMs = Number.parseFloat(plan[1]);
    const exec = /Execution Time:\s*([\d.]+)\s*ms/i.exec(line);
    if (exec) executionTimeMs = Number.parseFloat(exec[1]);
  }
  return { planningTimeMs, executionTimeMs };
}

async function listPublicIndexes(): Promise<PgIndexRow[]> {
  const prisma = getPrisma();
  return prisma.$queryRaw<PgIndexRow[]>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
  `;
}

function normalizeIndexText(s: string): string {
  return s.toLowerCase().replace(/["`]/g, "").replace(/\s+/g, "");
}

function matchIndex(
  indexes: PgIndexRow[],
  spec: RequiredIndexSpec
): IndexPresenceResult {
  const tableLc = spec.table.toLowerCase();
  const hintNorm = normalizeIndexText(spec.columnsHint);
  const hit = indexes.find((row) => {
    if (row.tablename.toLowerCase() !== tableLc) return false;
    return normalizeIndexText(row.indexdef).includes(hintNorm);
  });
  return {
    table: spec.table,
    columnsHint: spec.columnsHint,
    purpose: spec.purpose,
    present: Boolean(hit),
    matchedIndex: hit?.indexname ?? null,
  };
}

async function probeQuery(
  name: string,
  sql: string,
  budgetMs: number
): Promise<QueryProbeResult> {
  const prisma = getPrisma();
  try {
    const rows = await prisma.$queryRawUnsafe<ExplainAnalyzeRow[]>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`
    );
    const lines = rows
      .map((r) => r["QUERY PLAN"] ?? "")
      .filter(Boolean);
    const { planningTimeMs, executionTimeMs } = parseExplainTiming(lines);
    const total =
      (planningTimeMs ?? 0) + (executionTimeMs ?? Number.POSITIVE_INFINITY);
    const withinBudget =
      executionTimeMs !== null && executionTimeMs <= budgetMs;
    return {
      name,
      sql,
      planningTimeMs,
      executionTimeMs,
      withinBudget,
      detail: withinBudget
        ? `ok (${total.toFixed(2)}ms total)`
        : `exceeds ${budgetMs}ms budget (exec=${executionTimeMs ?? "n/a"}ms)`,
    };
  } catch (err) {
    return {
      name,
      sql,
      planningTimeMs: null,
      executionTimeMs: null,
      withinBudget: false,
      detail: err instanceof Error ? err.message : "probe failed",
    };
  }
}

/**
 * Verify required indexes + sample EXPLAIN ANALYZE latency for telemetry paths.
 */
export async function verifyTelemetryIndexes(options?: {
  budgetMs?: number;
  runProbes?: boolean;
}): Promise<IndexVerificationReport> {
  const budgetMs = options?.budgetMs ?? INDEX_LATENCY_BUDGET_MS;
  const runProbes = options?.runProbes !== false;
  const indexes = await listPublicIndexes();
  const presence = REQUIRED_TELEMETRY_INDEXES.map((spec) =>
    matchIndex(indexes, spec)
  );
  const missingIndexes = presence.filter((p) => !p.present);

  const probes: QueryProbeResult[] = [];
  if (runProbes) {
    // Parameter-free probes use impossible UUIDs so plans stay cheap on empty/hot tables.
    const nil = "00000000-0000-0000-0000-000000000000";
    probes.push(
      await probeQuery(
        "audit_workspace_timeline",
        `SELECT id FROM "TelemetryAuditLog" WHERE "workspaceId" = '${nil}' ORDER BY "createdAt" DESC LIMIT 50`,
        budgetMs
      ),
      await probeQuery(
        "audit_action_filter",
        `SELECT id FROM "TelemetryAuditLog" WHERE "workspaceId" = '${nil}' AND action = 'auth.login' ORDER BY "createdAt" DESC LIMIT 50`,
        budgetMs
      ),
      await probeQuery(
        "errors_unresolved",
        `SELECT id FROM "AppErrorLog" WHERE "workspaceId" = '${nil}' AND resolved = false ORDER BY "createdAt" DESC LIMIT 50`,
        budgetMs
      ),
      await probeQuery(
        "meter_workspace_roll",
        `SELECT COALESCE(SUM("feeUsd"), 0) FROM "WorkspaceMeterEvent" WHERE "workspaceId" = '${nil}' AND "createdAt" > NOW() - INTERVAL '1 hour'`,
        budgetMs
      )
    );
  }

  const slowProbes = probes.filter((p) => !p.withinBudget);
  // Missing indexes fail hard; probe failures on missing tables are soft until push.
  const tableMissing = missingIndexes.length > 0;
  const ok = !tableMissing && slowProbes.length === 0;

  return {
    ok,
    budgetMs,
    checkedAt: new Date().toISOString(),
    indexes: presence,
    missingIndexes,
    probes,
    slowProbes,
  };
}

/**
 * Startup-safe runner — logs warnings, never throws into the request path.
 */
export async function runStartupIndexVerification(): Promise<IndexVerificationReport | null> {
  if (process.env.SKIP_INDEX_VERIFY === "1") return null;
  if (!process.env.DATABASE_URL) {
    console.warn("[index-verify] skipped — DATABASE_URL unset");
    return null;
  }

  try {
    const report = await verifyTelemetryIndexes({ runProbes: true });
    if (report.ok) {
      console.info(
        `[index-verify] ok — ${report.indexes.length} indexes, ${report.probes.length} probes ≤${report.budgetMs}ms`
      );
    } else {
      console.warn(
        `[index-verify] degraded — missing=${report.missingIndexes.length} slow=${report.slowProbes.length}`,
        {
          missing: report.missingIndexes.map(
            (m) => `${m.table}${m.columnsHint}`
          ),
          slow: report.slowProbes.map((p) => `${p.name}: ${p.detail}`),
        }
      );
    }
    return report;
  } catch (err) {
    console.warn(
      "[index-verify] failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
