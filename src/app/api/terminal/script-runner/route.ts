/**
 * POST /api/terminal/script-runner
 * Isolated GitHub script execution for the Virtual Terminal beside Spatial Universe.
 * Streams SSE log frames; only allowlisted targets (e.g. github:blackeye) may run.
 *
 * Auth: x-workspace-key (required)
 * Body: { script: string, workspaceId?: string, stream?: boolean }
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { executeCodeInSandbox } from "@/lib/agents/codeSandbox";
import {
  deductGasUnits,
  InsufficientGasError,
} from "@/lib/billing/gasMeter";
import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  buildShellWrapperPreamble,
  listGithubScriptTargets,
  resolveGithubScript,
} from "@/lib/terminal/githubScriptCatalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  /** Target key, e.g. github:blackeye | github:custom-automation */
  script: z.string().trim().min(1).max(128).optional(),
  target: z.string().trim().min(1).max(128).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  /** Default true — SSE log stream for Virtual Terminal. */
  stream: z.boolean().optional(),
});

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

function encodeFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  return apiSuccess({
    targets: listGithubScriptTargets().map((t) => ({
      target: t.target,
      title: t.title,
      language: t.language,
      gasCost: t.gasCost,
    })),
  });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsedBody = BodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return apiError(
      parsedBody.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const scriptKey =
    parsedBody.data.script?.trim() || parsedBody.data.target?.trim() || "";
  if (!scriptKey) {
    return apiError(
      "script (or target) is required, e.g. github:blackeye.",
      "SCRIPT_REQUIRED",
      400
    );
  }

  const script = resolveGithubScript(scriptKey);
  if (!script) {
    return apiError(
      `Unknown script target "${scriptKey}". Use GET /api/terminal/script-runner for allowlist.`,
      "SCRIPT_UNKNOWN",
      404
    );
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    parsedBody.data.workspaceId ?? null
  );
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  let gas;
  try {
    gas = await deductGasUnits(gate.workspaceId, script.gasCost, {
      gasKind: "ai_agent",
      nodeType: "github_script_runner",
      description: `GitHub script runner — ${script.target} · ${script.gasCost} GAS`,
    });
  } catch (err) {
    if (err instanceof InsufficientGasError) {
      return apiError(err.message, err.code, 402);
    }
    console.error("[terminal/script-runner] gas deduct failed", err);
    return apiError("Gas deduction failed.", "GAS_DEDUCT_FAILED", 503);
  }

  const sessionId = `scr-${randomBytes(8).toString("hex")}`;
  const wantStream = parsedBody.data.stream !== false;

  let result;
  try {
    result = await executeCodeInSandbox(script.source, script.language, {
      signal: request.signal,
    });
  } catch (err) {
    console.error("[terminal/script-runner] sandbox failed", err);
    return apiError(
      err instanceof Error ? err.message : "Sandbox execution failed.",
      "SANDBOX_FAILED",
      500
    );
  }

  const preamble = buildShellWrapperPreamble(script);
  const stdoutLines = result.stdout
    ? result.stdout.split(/\r?\n/).filter((l) => l.length > 0)
    : [];
  const stderrLines = result.stderr
    ? result.stderr.split(/\r?\n/).filter((l) => l.length > 0)
    : [];
  const logLines = [
    ...preamble,
    ...stdoutLines,
    ...stderrLines.map((l) => `[stderr] ${l}`),
  ];

  const summary = {
    sessionId,
    target: script.target,
    title: script.title,
    language: script.language,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    logs: logLines,
    gas: {
      charged: gas.amount,
      balanceBefore: gas.balanceBefore,
      balanceAfter: gas.balanceAfter,
      ledgerId: gas.ledgerId,
    },
    workspaceId: gate.workspaceId,
    isolated: true,
  };

  if (!wantStream) {
    return apiSuccess(summary, 200, {
      "x-workspace-bound": gate.workspaceId,
      "x-script-session": sessionId,
    });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeFrame(event, data)));
        } catch {
          closed = true;
        }
      };

      push("start", {
        sessionId,
        target: script.target,
        title: script.title,
        language: script.language,
        workspaceId: gate.workspaceId,
        gas: summary.gas,
        at: new Date().toISOString(),
      });

      for (const line of logLines) {
        push("log", {
          sessionId,
          line,
          at: new Date().toISOString(),
        });
      }

      push("done", {
        sessionId,
        exitCode: result.exitCode,
        success: result.exitCode === 0,
        gas: summary.gas,
        at: new Date().toISOString(),
      });

      closed = true;
      try {
        controller.close();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      ...SSE_HEADERS,
      "x-workspace-bound": gate.workspaceId,
      "x-script-session": sessionId,
    },
  });
}
