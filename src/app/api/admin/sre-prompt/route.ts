/**
 * POST /api/admin/sre-prompt
 * Super-Admin Meta-SRE prompt bridge — SSE progress + Discord mobile alert.
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { dispatchDiscordSreAlert } from "@/lib/notifications/discordNotifier";
import {
  executeMetaEvolutionRun,
  META_EVOLUTION_LIMITS,
  MetaEvolutionFileSchema,
} from "@/lib/sre/metaEvolutionEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SrePromptBodySchema = z.object({
  directive: z.string().trim().min(8).max(8_000),
  title: z.string().trim().min(8).max(META_EVOLUTION_LIMITS.maxTitleChars).optional(),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(META_EVOLUTION_LIMITS.maxSummaryChars)
    .optional(),
  workspaceId: z.string().uuid().optional().nullable(),
  severity: z.enum(["critical", "high", "medium", "low"]).default("high"),
  dryRun: z.boolean().default(true),
  forceSandboxFail: z.boolean().default(false),
  targetFiles: z
    .array(MetaEvolutionFileSchema)
    .min(1)
    .max(META_EVOLUTION_LIMITS.maxFiles)
    .optional(),
  branch: z.string().trim().max(200).optional().nullable(),
  prUrl: z.string().url().max(512).optional().nullable(),
  /** When true (default), respond with text/event-stream progress frames. */
  stream: z.boolean().default(true),
});

type SrePromptBody = z.infer<typeof SrePromptBodySchema>;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function scaffoldFilesFromDirective(directive: string) {
  const stamp = new Date().toISOString();
  const escaped = directive.trim().replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  return [
    {
      path: "src/lib/sre/prompts/superAdminDirective.ts",
      content: [
        `/** Super-Admin Meta-SRE directive scaffold — issued ${stamp} */`,
        `export const SUPER_ADMIN_DIRECTIVE = \`${escaped.slice(0, 6_000)}\` as const;`,
        `export const ISSUED_AT = "${stamp}" as const;`,
        ``,
      ].join("\n"),
      encoding: "utf-8" as const,
    },
  ];
}

async function requireSuperAdmin(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.isSuperAdmin || profile.role !== "SUPER_ADMIN") {
    return {
      ok: false as const,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Forbidden. SUPER_ADMIN session required.",
          code: "SUPER_ADMIN_REQUIRED",
          timestamp: new Date().toISOString(),
          data: null,
        }),
        {
          status: 403,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-sre-gate": "denied",
          },
        }
      ),
    };
  }
  return { ok: true as const, profile };
}

function buildLogs(
  body: SrePromptBody,
  result: Awaited<ReturnType<typeof executeMetaEvolutionRun>>
): string[] {
  const logs: string[] = [
    `directive: ${body.directive.slice(0, 200)}`,
    `phases: ${result.phases.join(" → ")}`,
  ];
  if (result.isolation) {
    logs.push(
      `branch: ${result.isolation.isolationBranch}`,
      `sandboxRoot: ${result.isolation.sandboxRoot}`,
      `configHash: ${result.isolation.configHash}`
    );
  }
  if (result.sandbox) {
    logs.push(
      `sandbox: exit=${result.sandbox.exitCode} duration=${result.sandbox.durationMs}ms`,
      ...result.sandbox.stdout.split("\n").filter(Boolean).slice(0, 12)
    );
    if (result.sandbox.stderr) {
      logs.push(
        ...result.sandbox.stderr.split("\n").filter(Boolean).slice(0, 8)
      );
    }
  }
  if (!result.ok) {
    logs.push(`error: ${result.code} — ${result.error}`);
  } else if (result.commitGate.pendingCommit) {
    logs.push(
      `pendingCommit: ${result.commitGate.pendingCommit.message}`,
      `files: ${result.commitGate.pendingCommit.filesChanged.join(", ")}`
    );
  }
  return logs;
}

async function runPipeline(
  request: Request,
  body: SrePromptBody,
  emit?: (event: string, data: unknown) => void
) {
  const workspaceId =
    body.workspaceId?.trim() ||
    "00000000-0000-4000-8000-000000000001";
  const runId = `sre-${new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .slice(0, 15)}-${randomBytes(3).toString("hex")}`;

  const title =
    body.title?.trim() ||
    `SRE: ${body.directive.trim().slice(0, 80)}`;
  const summary = body.summary?.trim() || body.directive.trim();
  const targetFiles = body.targetFiles ?? scaffoldFilesFromDirective(body.directive);

  emit?.("progress", {
    stage: "received",
    progress: 5,
    message: "Super-Admin directive accepted.",
    runId,
    workspaceId,
  });

  emit?.("progress", {
    stage: "isolate_repo",
    progress: 20,
    message: "Isolating platform repo sandbox…",
    runId,
  });

  emit?.("progress", {
    stage: "sandbox_build",
    progress: 45,
    message: "Dispatching Meta-SRE sandbox validator…",
    runId,
  });

  const result = await executeMetaEvolutionRun({
    workspaceId,
    signal: request.signal,
    request: {
      workspaceId,
      runId,
      trigger: "manual_hook",
      severity: body.severity,
      title,
      summary,
      targetFiles,
      dryRun: body.dryRun,
      forceSandboxFail: body.forceSandboxFail,
    },
  });

  emit?.("progress", {
    stage: result.ok ? "complete" : "discard",
    progress: result.ok ? 90 : 85,
    message: result.ok
      ? "Commit gate passed (push deferred)."
      : `Pipeline discarded: ${result.code}`,
    runId,
    ok: result.ok,
  });

  const branch =
    body.branch ??
    result.isolation?.isolationBranch ??
    result.commitGate.pendingCommit?.branch ??
    null;
  const logs = buildLogs(body, result);
  const discordStatus = result.ok
    ? ("success" as const)
    : result.code === "META_SANDBOX_BUILD_FAILED" ||
        result.code === "META_SAFETY_REJECTED"
      ? ("discarded" as const)
      : ("failure" as const);

  emit?.("progress", {
    stage: "discord_notify",
    progress: 95,
    message: "Dispatching Discord mobile alert…",
    runId,
  });

  const discord = await dispatchDiscordSreAlert({
    title,
    status: discordStatus,
    executionLogs: logs,
    branch,
    prUrl: body.prUrl ?? null,
    runId: result.runId,
    workspaceId: result.workspaceId,
    severity: body.severity,
    directive: body.directive,
  });

  const payload = {
    ok: result.ok,
    runId: result.runId,
    workspaceId: result.workspaceId,
    evolution: result,
    discord,
    branch,
    prUrl: body.prUrl ?? null,
  };

  emit?.("complete", {
    progress: 100,
    message: result.ok
      ? "Meta-SRE pipeline completed."
      : "Meta-SRE pipeline failed / discarded.",
    ...payload,
  });

  return payload;
}

/**
 * GET — Super-Admin probe (auth only, no mutation).
 */
export async function GET(request: Request) {
  const gate = await requireSuperAdmin(request);
  if (!gate.ok) return gate.response;

  return Response.json(
    {
      success: true,
      data: {
        protocol: "scalesystems.admin.sre-prompt/v1",
        metaProtocol: META_EVOLUTION_LIMITS.protocol,
        admin: {
          id: gate.profile.id,
          email: gate.profile.email,
          role: gate.profile.role,
        },
        stream: true,
        discordConfigured: Boolean(
          process.env.DISCORD_SRE_WEBHOOK_URL?.trim() ||
            process.env.DISCORD_SUPPORT_WEBHOOK_URL?.trim()
        ),
      },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-sre-gate": "super-admin",
      },
    }
  );
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin(request);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return Response.json(
      {
        success: false,
        error: "Invalid JSON body.",
        code: "INVALID_JSON",
        timestamp: new Date().toISOString(),
        data: null,
      },
      { status: 400 }
    );
  }

  const parsed = SrePromptBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request body.",
        code: "INVALID_BODY",
        timestamp: new Date().toISOString(),
        data: null,
      },
      { status: 400 }
    );
  }

  const body = parsed.data;

  if (!body.stream) {
    try {
      const payload = await runPipeline(request, body);
      return Response.json(
        {
          success: payload.ok,
          data: payload,
          timestamp: new Date().toISOString(),
        },
        {
          status: payload.ok ? 202 : 422,
          headers: {
            "cache-control": "no-store",
            "x-sre-gate": "super-admin",
            "x-sre-run-id": payload.runId,
          },
        }
      );
    } catch (err) {
      console.error("[admin/sre-prompt] failed:", err);
      await dispatchDiscordSreAlert({
        title: body.title ?? "SRE prompt failure",
        status: "failure",
        executionLogs: [
          err instanceof Error ? err.message : "Unhandled pipeline error.",
        ],
        directive: body.directive,
        prUrl: body.prUrl ?? null,
        branch: body.branch ?? null,
        severity: body.severity,
      });
      return Response.json(
        {
          success: false,
          error:
            err instanceof Error ? err.message : "SRE prompt pipeline failed.",
          code: "SRE_PROMPT_FAILED",
          timestamp: new Date().toISOString(),
          data: null,
        },
        { status: 503 }
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseFrame(event, data)));
      };

      try {
        emit("progress", {
          stage: "auth",
          progress: 1,
          message: `SUPER_ADMIN verified (${gate.profile.email ?? gate.profile.id ?? "session"}).`,
        });
        await runPipeline(request, body, emit);
      } catch (err) {
        console.error("[admin/sre-prompt] stream failed:", err);
        const message =
          err instanceof Error ? err.message : "SRE prompt pipeline failed.";
        await dispatchDiscordSreAlert({
          title: body.title ?? "SRE prompt failure",
          status: "failure",
          executionLogs: [message],
          directive: body.directive,
          prUrl: body.prUrl ?? null,
          branch: body.branch ?? null,
          severity: body.severity,
        });
        emit("error", {
          success: false,
          error: message,
          code: "SRE_PROMPT_FAILED",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-cache",
      connection: "keep-alive",
      "x-sre-gate": "super-admin",
      "x-accel-buffering": "no",
    },
  });
}
