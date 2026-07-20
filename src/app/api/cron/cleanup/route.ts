import { z } from "zod";
import { withPrisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RETENTION_DAYS = 7 as const;
const LOG = "[cron/cleanup]";

const QuerySchema = z.object({
  /** Dry-run counts only — no deletes. */
  dryRun: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Allow in non-production when unset (local/dev).
    return process.env.NODE_ENV !== "production";
  }

  const bearer = request.headers.get("authorization")?.trim();
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    if (bearer.slice(7).trim() === secret) return true;
  }

  const header = request.headers.get("x-cron-secret")?.trim();
  if (header && header === secret) return true;

  const url = new URL(request.url);
  const q = url.searchParams.get("secret")?.trim();
  if (q && q === secret) return true;

  return false;
}

/**
 * GET|POST /api/cron/cleanup
 * Prune chaos / obsolete AppErrorLog rows older than 7 days.
 * NEVER deletes WorkspaceMeterEvent or other fiscal metering history.
 */
async function runCleanup(request: Request) {
  if (!authorizeCron(request)) {
    console.warn(`${LOG} unauthorized`);
    return apiError("Unauthorized cron invocation.", "CRON_UNAUTHORIZED", 401);
  }

  const url = new URL(request.url);
  const q = QuerySchema.safeParse({
    dryRun: url.searchParams.get("dryRun") ?? undefined,
  });
  const dryRun = q.success ? Boolean(q.data.dryRun) : false;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  console.info(`${LOG} start`, {
    cutoff: cutoff.toISOString(),
    dryRun,
    retentionDays: RETENTION_DAYS,
  });

  try {
    const result = await withPrisma(async (db) => {
      const chaosWhere = {
        createdAt: { lt: cutoff },
        OR: [
          { errorMessage: { startsWith: "CHAOS[" } },
          { explanation: { startsWith: "chaos:" } },
        ],
      };

      const resolvedWhere = {
        createdAt: { lt: cutoff },
        resolved: true,
        NOT: {
          OR: [
            { errorMessage: { startsWith: "CHAOS[" } },
            { explanation: { startsWith: "chaos:" } },
          ],
        },
      };

      const [chaosCount, resolvedCount, meterPreserved] = await Promise.all([
        db.appErrorLog.count({ where: chaosWhere }),
        db.appErrorLog.count({ where: resolvedWhere }),
        db.workspaceMeterEvent.count({
          where: { createdAt: { lt: cutoff } },
        }),
      ]);

      if (dryRun) {
        return {
          dryRun: true as const,
          cutoff: cutoff.toISOString(),
          wouldDeleteChaos: chaosCount,
          wouldDeleteResolvedTelemetry: resolvedCount,
          meterEventsPreserved: meterPreserved,
          deletedChaos: 0,
          deletedResolvedTelemetry: 0,
        };
      }

      const [chaosDel, resolvedDel] = await db.$transaction([
        db.appErrorLog.deleteMany({ where: chaosWhere }),
        db.appErrorLog.deleteMany({ where: resolvedWhere }),
      ]);

      return {
        dryRun: false as const,
        cutoff: cutoff.toISOString(),
        wouldDeleteChaos: chaosCount,
        wouldDeleteResolvedTelemetry: resolvedCount,
        meterEventsPreserved: meterPreserved,
        deletedChaos: chaosDel.count,
        deletedResolvedTelemetry: resolvedDel.count,
      };
    }, "cron.cleanup");

    // Fiscal integrity probe — meter table untouched by this job.
    const meterStillThere = await withPrisma(
      (db) =>
        db.workspaceMeterEvent.count({
          where: { createdAt: { lt: cutoff } },
        }),
      "cron.cleanup.meterProbe"
    );

    console.info(`${LOG} complete`, {
      ...result,
      meterEventsStillPresent: meterStillThere,
    });

    return apiSuccess({
      job: "telemetry-cleanup",
      retentionDays: RETENTION_DAYS,
      ...result,
      fiscal: {
        workspaceMeterEventsUntouched: true,
        historicalMeterRowsOlderThanCutoff: meterStillThere,
      },
    });
  } catch (err) {
    console.error(`${LOG} failed`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      err instanceof Error ? err.message : "Cleanup job failed.",
      "CRON_CLEANUP_FAILED",
      503
    );
  }
}

export async function GET(request: Request) {
  return runCleanup(request);
}

export async function POST(request: Request) {
  return runCleanup(request);
}
