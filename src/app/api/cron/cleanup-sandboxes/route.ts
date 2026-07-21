import { z } from "zod";
import { withPrisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { cleanupExpiredDemoSandboxes } from "@/lib/demo/sandboxProvision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG = "[cron/cleanup-sandboxes]";
const RETENTION_HOURS = 24 as const;

const QuerySchema = z.object({
  dryRun: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
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
 * GET|POST /api/cron/cleanup-sandboxes
 * Remove expired Instant Sandbox workspaces (isDemo, >24h / past demoExpiresAt).
 * Cascades tenant rows; also deletes orphaned DEMO guest users.
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

  console.info(`${LOG} start`, { dryRun, retentionHours: RETENTION_HOURS });

  try {
    const result = await withPrisma(
      (db) => cleanupExpiredDemoSandboxes(db, { dryRun }),
      "cron.cleanup-sandboxes"
    );

    console.info(`${LOG} complete`, result);

    return apiSuccess({
      job: "cleanup-sandboxes",
      retentionHours: RETENTION_HOURS,
      ...result,
    });
  } catch (err) {
    console.error(`${LOG} failed`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      err instanceof Error ? err.message : "Sandbox cleanup job failed.",
      "CRON_CLEANUP_SANDBOXES_FAILED",
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
