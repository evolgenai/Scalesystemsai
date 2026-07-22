/**
 * POST /api/terminal/e2b/stream
 * SSE execution stream for E2B-style isolated sandbox sessions.
 * Frames: boot → stdout/stderr chunks → metrics → exit.
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  executeCodeInSandbox,
  type SandboxLanguage,
} from "@/lib/agents/codeSandbox";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  code: z.string().trim().min(1).max(12_000),
  language: z.enum(["javascript", "python"]).default("javascript"),
  sessionLabel: z.string().trim().max(64).optional(),
});

const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export type E2BStreamFrame = {
  type:
    | "session_start"
    | "stdout"
    | "stderr"
    | "metrics"
    | "exit"
    | "error";
  sessionId: string;
  ts: string;
  line?: string;
  exitCode?: number;
  runtimeMs?: number;
  language?: SandboxLanguage;
  message?: string;
};

function encode(frame: E2BStreamFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

function stamp(): string {
  return new Date().toISOString();
}

function chunkText(text: string, size = 120): string[] {
  const trimmed = text.replace(/\r\n/g, "\n");
  if (!trimmed) return [];
  const lines = trimmed.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= size) {
      out.push(line);
      continue;
    }
    for (let i = 0; i < line.length; i += size) {
      out.push(line.slice(i, i + size));
    }
  }
  return out;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let workspaceId = "default";
  try {
    workspaceId = (await resolveWorkspaceId(request, null)) ?? "default";
  } catch {
    /* demo session */
  }

  const sessionId = `e2b_${randomBytes(8).toString("hex")}`;
  const language = parsed.data.language as SandboxLanguage;
  const code = parsed.data.code;
  const label = parsed.data.sessionLabel ?? "e2b-isolate";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (frame: E2BStreamFrame) => {
        try {
          controller.enqueue(encoder.encode(encode(frame)));
        } catch {
          /* closed */
        }
      };

      const started = Date.now();
      push({
        type: "session_start",
        sessionId,
        ts: stamp(),
        language,
        message: `E2B isolate boot · ${label} · workspace=${workspaceId}`,
      });

      push({
        type: "stdout",
        sessionId,
        ts: stamp(),
        line: `[e2b] provisioning container · lang=${language}`,
      });

      try {
        await new Promise((r) => setTimeout(r, 280));

        const result = await executeCodeInSandbox(code, language, {
          signal: request.signal,
        });

        for (const line of chunkText(result.stdout)) {
          push({
            type: "stdout",
            sessionId,
            ts: stamp(),
            line,
          });
          await new Promise((r) => setTimeout(r, 18));
        }

        for (const line of chunkText(result.stderr)) {
          push({
            type: "stderr",
            sessionId,
            ts: stamp(),
            line,
          });
          await new Promise((r) => setTimeout(r, 18));
        }

        const runtimeMs = Date.now() - started;
        push({
          type: "metrics",
          sessionId,
          ts: stamp(),
          runtimeMs,
          language,
          message: `cpu≈${(runtimeMs / 1000).toFixed(2)}s · mem isolate · exit pending`,
        });

        push({
          type: "exit",
          sessionId,
          ts: stamp(),
          exitCode: result.exitCode,
          runtimeMs,
          language,
          message:
            result.exitCode === 0
              ? "process exited cleanly"
              : `process exited with code ${result.exitCode}`,
        });
} catch (err) {
        const runtimeMs = Date.now() - started;
        const message =
          err instanceof Error ? err.message : "E2B sandbox execution failed.";
        try {
          const { captureStructuredError } = await import("@/lib/sentry");
          captureStructuredError(err, {
            tenantId: workspaceId,
            agentExecutionId: sessionId,
            route: "/api/terminal/e2b/stream",
            source: "sse",
            level: "error",
            extra: { stream: "e2b.stream", language },
          });
        } catch {
          /* optional */
        }
        push({
          type: "stderr",
          sessionId,
          ts: stamp(),
          line: message,
        });
        push({
          type: "error",
          sessionId,
          ts: stamp(),
          message,
          runtimeMs,
          exitCode: 1,
        });
        push({
          type: "exit",
          sessionId,
          ts: stamp(),
          exitCode: 1,
          runtimeMs,
          language,
          message: "process aborted",
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...SSE_HEADERS,
      "x-e2b-session": sessionId,
    },
  });
}
