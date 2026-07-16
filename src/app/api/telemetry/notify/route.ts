import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  dispatchHealNotifications,
  type NotifyDispatchResult,
} from "@/lib/telemetry/healNotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  route: z.string().trim().min(1).max(512),
  errorMessage: z.string().trim().min(1).max(16_000),
  patch: z.string().trim().min(1).max(64_000),
  validatorStatus: z.enum(["APPROVED", "REJECTED"]).default("APPROVED"),
  targetFile: z.string().trim().max(512).optional(),
  workspaceName: z.string().trim().max(120).optional().nullable(),
});

type ErrorBody = { success: false; error: string; code: string };

/**
 * POST /api/telemetry/notify — dispatch heal incident notifications.
 * Estate / ops surface (public ingest-style); does not mutate core agent routes.
 */
export async function POST(
  request: Request
): Promise<NextResponse<{ success: true; notify: NotifyDispatchResult } | ErrorBody>> {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body.",
        code: "INVALID_BODY",
      },
      { status: 400 }
    );
  }

  try {
    const notify = await dispatchHealNotifications(parsed.data);
    return NextResponse.json({ success: true, notify });
  } catch (err) {
    console.error("[telemetry/notify] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Notify failed.",
        code: "NOTIFY_FAILED",
      },
      { status: 502 }
    );
  }
}
