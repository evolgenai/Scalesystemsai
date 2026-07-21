/**
 * POST /api/sandbox/execute
 * Spawn an ephemeral E2B microVM and run Python / TypeScript / JavaScript / bash.
 *
 * Auth: x-workspace-key + RBAC `terminal.execute`
 * Body: { code, language?, timeoutMs?, workspaceId? }
 */

import { enforcePermission } from "@/lib/auth/rbacMiddleware";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  E2bExecuteInputSchema,
  executeInE2bSandbox,
  isE2bConfigured,
  normalizeE2bLanguage,
} from "@/lib/sandbox/e2bExecutor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = E2bExecuteInputSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const language = normalizeE2bLanguage(parsed.data.language);
  if (!language) {
    return apiError(
      'language must be python, typescript, javascript, or bash (aliases: py, ts, js, sh, shell).',
      "UNSUPPORTED_LANGUAGE",
      400
    );
  }

  const rbac = await enforcePermission(
    request,
    "terminal.execute",
    parsed.data.workspaceId ?? null
  );
  if (!rbac.ok) return rbac.response;

  if (!isE2bConfigured()) {
    return apiError(
      "E2B_API_KEY is not configured on the server.",
      "E2B_NOT_CONFIGURED",
      503
    );
  }

  const result = await executeInE2bSandbox({
    ...parsed.data,
    language,
  });

  return apiSuccess(
    {
      execution: result,
      workspaceId: rbac.ctx.workspaceId,
    },
    result.ok ? 200 : 422,
    {
      "x-workspace-bound": rbac.ctx.workspaceId,
      "x-e2b-sandbox": result.sandboxId ?? "",
    }
  );
}

export async function GET() {
  return apiSuccess({
    provider: "e2b",
    configured: isE2bConfigured(),
    languages: ["python", "typescript", "javascript", "bash"],
    aliases: ["py", "ts", "js", "node", "sh", "shell"],
    protocol: "scalesystems.sandbox.e2b/v1",
  });
}
