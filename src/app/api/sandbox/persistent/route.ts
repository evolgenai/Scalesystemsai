/**
 * POST /api/sandbox/persistent
 * Stateful sandbox lifecycle for long-running developer environments.
 *
 * Actions:
 *   create — spawn persistent sandbox, return sandboxId
 *   exec   — run command/code inside the same sandboxId
 *   kill   — terminate sandbox and clear state
 *
 * Auth: x-workspace-key + RBAC `terminal.execute`
 */

import { enforcePermission } from "@/lib/auth/rbacMiddleware";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { isE2bConfigured } from "@/lib/sandbox/e2bExecutor";
import {
  createPersistentSandbox,
  execPersistentSandbox,
  killPersistentSandbox,
  PersistentSandboxBodySchema,
} from "@/lib/sandbox/persistentSandbox";
import { getPrisma } from "@/lib/prisma";
import { getPersistentSandboxView } from "@/lib/sandbox/persistentSandboxStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PersistentSandboxBodySchema.safeParse(raw);
  if (!parsed.success) {
    const message =
      parsed.error?.issues?.[0]?.message ??
      "Invalid body. Use action create | exec | kill.";
    return apiError(message, "INVALID_BODY", 400);
  }

  const body = parsed.data;
  const rbac = await enforcePermission(
    request,
    "terminal.execute",
    body.workspaceId ?? null
  );
  if (!rbac.ok) return rbac.response;

  const workspaceId = rbac.ctx.workspaceId;
  const bound = { "x-workspace-bound": workspaceId };

  if (body.action === "create") {
    const result = await createPersistentSandbox({
      workspaceId,
      timeoutMs: body.timeoutMs,
      cwd: body.cwd,
      label: body.label,
    });

    if (!result.ok) {
      return apiError(result.error, result.code, 502, bound);
    }

    return apiSuccess(
      {
        action: "create" as const,
        sandboxId: result.record.sandboxId,
        sandbox: result.record,
      },
      201,
      { ...bound, "x-e2b-sandbox": result.record.sandboxId }
    );
  }

  if (body.action === "exec") {
    const result = await execPersistentSandbox({
      workspaceId,
      sandboxId: body.sandboxId,
      command: body.command,
      code: body.code,
      language: body.language,
      cwd: body.cwd,
      timeoutMs: body.timeoutMs,
    });

    if (!result.ok) {
      return apiError(result.error, result.code, result.status ?? 502, bound);
    }

    return apiSuccess(
      {
        action: "exec" as const,
        sandboxId: result.record.sandboxId,
        sandbox: result.record,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        cwd: result.cwd,
        durationMs: result.durationMs,
        uptimeMs: result.record.uptimeMs ?? null,
      },
      result.exitCode === 0 ? 200 : 422,
      { ...bound, "x-e2b-sandbox": result.record.sandboxId }
    );
  }

  // action === "kill"
  const result = await killPersistentSandbox({
    workspaceId,
    sandboxId: body.sandboxId,
  });

  if (!result.ok) {
    return apiError(result.error, result.code, result.status ?? 502, bound);
  }

  return apiSuccess(
    {
      action: "kill" as const,
      sandboxId: result.record.sandboxId,
      sandbox: result.record,
      killed: result.killed,
    },
    200,
    { ...bound, "x-e2b-sandbox": result.record.sandboxId }
  );
}

/** List ACTIVE persistent sandboxes for the bound workspace. */
export async function GET(request: Request) {
  const rbac = await enforcePermission(request, "terminal.execute");
  if (!rbac.ok) return rbac.response;

  const sandboxId = new URL(request.url).searchParams.get("sandboxId")?.trim();
  if (sandboxId?.startsWith("psb_")) {
    const view = getPersistentSandboxView(sandboxId);
    if (!view) {
      return apiError("Sandbox not found or terminated.", "SANDBOX_NOT_FOUND", 404);
    }
    return apiSuccess(
      {
        configured: isE2bConfigured(),
        protocol: "scalesystems.sandbox.persistent/v1",
        sandbox: view,
      },
      200,
      { "x-workspace-bound": rbac.ctx.workspaceId }
    );
  }

  try {
    const rows = await getPrisma().persistentSandbox.findMany({
      where: {
        workspaceId: rbac.ctx.workspaceId,
        status: "ACTIVE",
      },
      orderBy: { lastActiveAt: "desc" },
      take: 50,
    });

    return apiSuccess(
      {
        configured: isE2bConfigured(),
        protocol: "scalesystems.sandbox.persistent/v1",
        sandboxes: rows.map((row) => ({
          id: row.id,
          sandboxId: row.sandboxId,
          workspaceId: row.workspaceId,
          status: row.status,
          cwd: row.cwd,
          timeoutMs: row.timeoutMs,
          label: row.label,
          lastActiveAt: row.lastActiveAt.toISOString(),
          terminatedAt: row.terminatedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
      },
      200,
      { "x-workspace-bound": rbac.ctx.workspaceId }
    );
  } catch {
    return apiSuccess(
      {
        configured: isE2bConfigured(),
        protocol: "scalesystems.sandbox.persistent/v1",
        sandboxes: [],
      },
      200,
      { "x-workspace-bound": rbac.ctx.workspaceId }
    );
  }
}
