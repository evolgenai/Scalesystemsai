import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import type { AppErrorLog } from "@prisma/client";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PostBodySchema = z.object({
  route: z.string().trim().min(1).max(512),
  errorMessage: z.string().trim().min(1).max(16_000),
  stackTrace: z.string().trim().max(64_000).optional().nullable(),
  workspaceId: z.string().uuid().optional().nullable(),
});

type ErrorBody = { success: false; error: string; code: string };

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
  });
}

/**
 * POST /api/telemetry/errors — public ingest (optional workspace via key/id).
 */
export async function POST(
  request: Request
): Promise<NextResponse<{ success: true; error: AppErrorLog } | ErrorBody>> {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Invalid body.",
      "INVALID_BODY",
      400
    );
  }

  try {
    const workspaceId = await resolveWorkspaceId(
      request,
      parsed.data.workspaceId
    );

    const row = await getPrisma().appErrorLog.create({
      data: {
        route: parsed.data.route,
        errorMessage: parsed.data.errorMessage,
        stackTrace: parsed.data.stackTrace ?? null,
        workspaceId,
      },
    });

    return NextResponse.json({ success: true, error: row }, { status: 201 });
  } catch (err) {
    console.error("[telemetry/errors] create failed:", err);
    return jsonError("Unable to persist error log.", "TELEMETRY_WRITE_FAILED", 503);
  }
}

/**
 * GET /api/telemetry/errors — unresolved logs, newest first (optional workspace filter).
 */
export async function GET(
  request: Request
): Promise<
  NextResponse<
    { success: true; count: number; errors: AppErrorLog[] } | ErrorBody
  >
> {
  const url = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50)
  );

  try {
    const workspaceId = await resolveWorkspaceId(
      request,
      url.searchParams.get("workspaceId")
    );

    const errors = await getPrisma().appErrorLog.findMany({
      where: {
        resolved: false,
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      count: errors.length,
      errors,
    });
  } catch (err) {
    console.error("[telemetry/errors] list failed:", err);
    return jsonError("Unable to list error logs.", "TELEMETRY_LIST_FAILED", 503);
  }
}
