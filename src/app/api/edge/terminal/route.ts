/**
 * GET/POST /api/edge/terminal
 * Edge Node CLI gateway — status, rotate-keys, ping, update-header, reboot.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import {
  EDGE_COMMAND_HELP,
  EdgeTerminalRequestSchema,
  executeEdgeCommand,
} from "@/lib/edge/edgeTerminal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const command = url.searchParams.get("command")?.trim();

  if (!command) {
    return apiSuccess({
      endpoint: "/api/edge/terminal",
      commands: EDGE_COMMAND_HELP,
      hint: "POST { workspaceId, sessionId, command } or GET ?command=&workspaceId=&sessionId=",
    });
  }

  const parsed = EdgeTerminalRequestSchema.safeParse({
    command,
    workspaceId:
      url.searchParams.get("workspaceId") ??
      request.headers.get("x-workspace-id") ??
      undefined,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    terminalId: url.searchParams.get("terminalId") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    header: url.searchParams.get("header") ?? undefined,
    target: url.searchParams.get("target") ?? undefined,
    dryRun: url.searchParams.get("dryRun") === "true",
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid edge terminal query.",
      "INVALID_QUERY",
      400
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/edge/terminal",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await executeEdgeCommand({
        ...parsed.data,
        userId: profile.id,
      });
      return apiSuccess(
        {
          terminal: result,
          stdout: result.stdout,
          stderr: result.stderr,
          lines: result.lines,
        },
        200,
        {
          "x-workspace-bound": parsed.data.workspaceId,
          "x-edge-exit": String(result.exitCode),
          "x-edge-exec": result.executionId,
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Edge command failed.",
      "EDGE_TERMINAL_FAILED",
      500
    );
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const headerWorkspace =
    request.headers.get("x-workspace-id")?.trim() || undefined;
  const merged =
    raw && typeof raw === "object"
      ? {
          ...(raw as Record<string, unknown>),
          workspaceId:
            (raw as { workspaceId?: string }).workspaceId ?? headerWorkspace,
        }
      : raw;

  const parsed = EdgeTerminalRequestSchema.safeParse(merged);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid edge terminal payload.",
      "INVALID_BODY",
      400
    );
  }

  const profile = await resolveRequestUser(request);
  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/edge/terminal",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await executeEdgeCommand({
        ...parsed.data,
        userId: parsed.data.userId ?? profile.id,
      });
      return apiSuccess(
        {
          terminal: result,
          stdout: result.stdout,
          stderr: result.stderr,
          lines: result.lines,
          auth: { userId: profile.id },
        },
        200,
        {
          "x-workspace-bound": parsed.data.workspaceId,
          "x-edge-exit": String(result.exitCode),
          "x-edge-exec": result.executionId,
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Edge command failed.",
      "EDGE_TERMINAL_FAILED",
      500
    );
  }
}
