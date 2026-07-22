/**
 * POST /api/sentry-test
 * Temporary verification route — throws a real server error for Sentry.
 * Disabled unless SENTRY_VERIFY=1. Delete after confirming the issue lands.
 */

import * as Sentry from "@sentry/nextjs";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (process.env.SENTRY_VERIFY !== "1") {
    return apiError(
      "Set SENTRY_VERIFY=1 to enable this temporary Sentry probe.",
      "SENTRY_VERIFY_DISABLED",
      403
    );
  }

  const err = new Error("Sentry test error — delete /api/sentry-test after verify");
  Sentry.captureException(err);
  throw err;
}

export async function GET() {
  return apiSuccess({
    probe: "/api/sentry-test",
    enabled: process.env.SENTRY_VERIFY === "1",
    hint: "POST with SENTRY_VERIFY=1 to emit a real server error.",
  });
}
