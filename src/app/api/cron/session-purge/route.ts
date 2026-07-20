import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { purgeExpiredRuntimeCredentialsAsync } from "@/lib/crypto/runtimeConnect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG = "[cron/session-purge]";

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
 * GET|POST /api/cron/session-purge
 * Clear expired single-use healer runtime tokens (`ss_rt_…`).
 * Enforces TTL only — never touches persistent database fields / Prisma.
 */
async function runSessionPurge(request: Request) {
  if (!authorizeCron(request)) {
    console.warn(`${LOG} unauthorized`);
    return apiError("Unauthorized cron invocation.", "CRON_UNAUTHORIZED", 401);
  }

  const url = new URL(request.url);
  const q = QuerySchema.safeParse({
    dryRun: url.searchParams.get("dryRun") ?? undefined,
  });
  const dryRun = q.success ? Boolean(q.data.dryRun) : false;
  const nowSec = Math.floor(Date.now() / 1000);

  console.info(`${LOG} start`, { dryRun, nowSec, tokenPrefix: "ss_rt_" });

  try {
    const result = await purgeExpiredRuntimeCredentialsAsync({
      dryRun,
      nowSec,
    });

    console.info(`${LOG} complete`, result);

    return apiSuccess({
      job: "session-purge",
      tokenPrefix: "ss_rt_",
      ttlEnforced: true,
      persistentDbUntouched: true,
      ...result,
    });
  } catch (err) {
    console.error(`${LOG} failed`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      err instanceof Error ? err.message : "Session purge job failed.",
      "CRON_SESSION_PURGE_FAILED",
      503
    );
  }
}

export async function GET(request: Request) {
  return runSessionPurge(request);
}

export async function POST(request: Request) {
  return runSessionPurge(request);
}
