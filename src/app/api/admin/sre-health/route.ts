/**
 * GET  /api/admin/sre-health
 * Super-Admin SRE telemetry endpoint.
 *
 * Collects:
 *  - Server uptime
 *  - Database reachability + active connection count (pg_stat_activity)
 *  - Error rate over the last 5-minute window from AppErrorLog
 *  - Recent SreSystemLog summary
 *
 * Auto-dispatches a Discord critical alert when:
 *   - Unresolved error rate > 2% of recent entries, OR
 *   - The DB probe itself fails (critical pipeline failure)
 *
 * POST /api/admin/sre-health
 * Manually record a SreSystemLog entry (SRE pipeline probe write).
 */

import { z } from "zod";
import { withPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { dispatchDiscordSreAlert } from "@/lib/notifications/discordNotifier";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Module-level uptime anchor — persists across requests in the same Node.js isolate.
const SERVER_START_MS = Date.now();

const ERROR_RATE_THRESHOLD_PCT = 2;
const WINDOW_MINUTES = 5;

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireSuperAdmin(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.isSuperAdmin || profile.role !== "SUPER_ADMIN") {
    return {
      ok: false as const,
      response: apiError(
        "Forbidden. SUPER_ADMIN session required.",
        "SUPER_ADMIN_REQUIRED",
        403
      ),
    };
  }
  return { ok: true as const, profile };
}

// ─── Database probe ───────────────────────────────────────────────────────────

async function probeDatabaseHealth(): Promise<{
  reachable: boolean;
  activeConnections: number;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const result = await withPrisma(async (db) => {
      // Raw query to get active connection count for this database.
      const rows = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND state IS NOT NULL
      `;
      return { activeConnections: Number(rows[0]?.count ?? 0) };
    }, "sre-health.db-probe");

    return {
      reachable: true,
      activeConnections: result.activeConnections,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      reachable: false,
      activeConnections: 0,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "DB probe failed.",
    };
  }
}

// ─── Error-rate aggregation ───────────────────────────────────────────────────

async function aggregateErrorWindow(windowMinutes: number) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1_000);
  try {
    const [total, unresolved] = await withPrisma(
      (db) =>
        Promise.all([
          db.appErrorLog.count({ where: { createdAt: { gte: since } } }),
          db.appErrorLog.count({
            where: { createdAt: { gte: since }, resolved: false },
          }),
        ]),
      "sre-health.error-agg"
    );
    return { total, unresolved, since, ok: true as const };
  } catch (err) {
    return {
      total: 0,
      unresolved: 0,
      since,
      ok: false as const,
      error: err instanceof Error ? err.message : "Error aggregation failed.",
    };
  }
}

// ─── Recent SRE log summary ───────────────────────────────────────────────────

async function recentSreSummary(limit = 10) {
  try {
    const logs = await withPrisma(
      (db) =>
        db.sreSystemLog.findMany({
          orderBy: { timestamp: "desc" },
          take: limit,
          select: {
            id: true,
            serviceName: true,
            status: true,
            latencyMs: true,
            fixedBySre: true,
            timestamp: true,
          },
        }),
      "sre-health.recent-logs"
    );
    return { logs, ok: true as const };
  } catch {
    return { logs: [], ok: false as const };
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const checkedAt = new Date().toISOString();
  const uptimeMs = Date.now() - SERVER_START_MS;

  // Run DB probe + error aggregation concurrently.
  const [db, errors, sreLogs] = await Promise.all([
    probeDatabaseHealth(),
    aggregateErrorWindow(WINDOW_MINUTES),
    recentSreSummary(10),
  ]);

  const errorRatePct =
    errors.total > 0
      ? Math.round((errors.unresolved / errors.total) * 10_000) / 100
      : 0;

  const aboveThreshold = errorRatePct > ERROR_RATE_THRESHOLD_PCT;
  const dbCritical = !db.reachable;
  const shouldAlert = aboveThreshold || dbCritical;

  let discordResult: Awaited<ReturnType<typeof dispatchDiscordSreAlert>> | null = null;

  if (shouldAlert) {
    const alertTitle = dbCritical
      ? "SRE CRITICAL: Database unreachable"
      : `SRE WARNING: Error rate ${errorRatePct}% exceeds ${ERROR_RATE_THRESHOLD_PCT}% threshold`;

    const logs: string[] = [
      `checked_at: ${checkedAt}`,
      `uptime_ms: ${uptimeMs}`,
      `db_reachable: ${db.reachable}`,
      `db_latency_ms: ${db.latencyMs}`,
      `active_connections: ${db.activeConnections}`,
      `error_window_min: ${WINDOW_MINUTES}`,
      `errors_total: ${errors.total}`,
      `errors_unresolved: ${errors.unresolved}`,
      `error_rate_pct: ${errorRatePct}%`,
      `threshold_pct: ${ERROR_RATE_THRESHOLD_PCT}%`,
    ];

    if (db.error) logs.push(`db_error: ${db.error}`);

    discordResult = await dispatchDiscordSreAlert({
      title: alertTitle,
      status: dbCritical ? "failure" : "partial",
      severity: dbCritical ? "critical" : "high",
      executionLogs: logs,
      workspaceId: null,
      runId: `sre-health-${Date.now()}`,
    });
  }

  // Persist this health-check tick to SreSystemLog.
  const serviceStatus = dbCritical
    ? "critical"
    : aboveThreshold
      ? "degraded"
      : "healthy";

  withPrisma(
    (db_) =>
      db_.sreSystemLog.create({
        data: {
          serviceName: "api-health-check",
          status: serviceStatus,
          latencyMs: db.latencyMs,
          errorStack: db.error ?? null,
          fixedBySre: false,
        },
      }),
    "sre-health.log-write"
  ).catch((err) => {
    console.warn("[sre-health] log write skipped:", err instanceof Error ? err.message : err);
  });

  return apiSuccess({
    data: {
      checkedAt,
      uptimeMs,
      database: {
        reachable: db.reachable,
        activeConnections: db.activeConnections,
        latencyMs: db.latencyMs,
        ...(db.error ? { error: db.error } : {}),
      },
      errors: {
        windowMinutes: WINDOW_MINUTES,
        totalInWindow: errors.total,
        unresolvedInWindow: errors.unresolved,
        errorRatePct,
        thresholdPct: ERROR_RATE_THRESHOLD_PCT,
        aboveThreshold,
        since: errors.since.toISOString(),
      },
      systemStatus: serviceStatus,
      alertDispatched: shouldAlert,
      ...(discordResult ? { discord: discordResult } : {}),
      recentSreLogs: sreLogs.logs,
      admin: {
        id: guard.profile.id,
        email: guard.profile.email,
      },
    },
  });
}

// ─── POST — manual SRE log probe write ───────────────────────────────────────

const SreLogWriteSchema = z.object({
  serviceName: z.string().trim().min(1).max(100),
  status: z.enum(["healthy", "degraded", "critical", "unknown"]),
  latencyMs: z.number().int().nonnegative(),
  errorStack: z.string().max(10_000).optional().nullable(),
  fixedBySre: z.boolean().default(false),
});

/**
 * POST /api/admin/sre-health
 * Manually record a SreSystemLog row (used by SRE pipeline probes).
 */
export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = SreLogWriteSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;

  try {
    const entry = await withPrisma(
      (db) =>
        db.sreSystemLog.create({
          data: {
            serviceName: body.serviceName,
            status: body.status,
            latencyMs: body.latencyMs,
            errorStack: body.errorStack ?? null,
            fixedBySre: body.fixedBySre,
          },
        }),
      "sre-health.manual-write"
    );

    // Auto-alert on critical manual probe entries.
    if (body.status === "critical") {
      dispatchDiscordSreAlert({
        title: `SRE CRITICAL: ${body.serviceName} reported critical status`,
        status: "failure",
        severity: "critical",
        executionLogs: [
          `service: ${body.serviceName}`,
          `status: ${body.status}`,
          `latency_ms: ${body.latencyMs}`,
          ...(body.errorStack ? [`error: ${body.errorStack.slice(0, 500)}`] : []),
        ],
        workspaceId: null,
        runId: entry.id,
      }).catch((err) =>
        console.warn("[sre-health] POST discord alert failed:", err)
      );
    }

    return apiSuccess({ data: entry }, 201);
  } catch (err) {
    console.error("[api/admin/sre-health] POST failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to write SRE log.",
      "SRE_LOG_WRITE_FAILED",
      503
    );
  }
}
