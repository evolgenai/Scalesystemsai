import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateDenied,
} from "@/lib/auth/workspaceGate";
import { apiFail, apiOk } from "@/lib/http/apiEnvelope";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  executeMetaEvolutionRun,
  META_EVOLUTION_LIMITS,
  MetaEvolutionRequestSchema,
} from "@/lib/sre/metaEvolutionEngine";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gateFail(denied: WorkspaceGateDenied) {
  return apiFail(denied.message, denied.code, denied.status, {
    "x-workspace-bound": "denied",
    "x-meta-evolution": "denied",
  });
}

/**
 * Dual gate: workspace API key (tenant boundary) + agent edge token
 * (autonomous remediation hook authenticity).
 */
async function requireMetaEvolutionAuth(
  request: Request
): Promise<ReturnType<typeof apiFail> | null> {
  const verified = request.headers.get("x-agent-auth")?.trim() === "verified";
  if (verified) return null;

  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
    return apiFail(verdict.reason, "AGENT_TOKEN_INVALID", 401, {
      "x-meta-evolution": "denied",
    });
  }

  return apiFail(
    "Unauthorized. /api/sre/meta-evolution requires a verified agent token.",
    "META_EVOLUTION_UNAUTHORIZED",
    401,
    { "x-meta-evolution": "denied" }
  );
}

/**
 * GET /api/sre/meta-evolution — protocol probe (no secrets, no mutation).
 */
export async function GET(request: Request) {
  const denied = await requireMetaEvolutionAuth(request);
  if (denied) return denied;

  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) return gateFail(gate);

  return apiOk(
    {
      protocol: META_EVOLUTION_LIMITS.protocol,
      workspaceId: gate.workspaceId,
      authMode: gate.authMode,
      limits: {
        maxFiles: META_EVOLUTION_LIMITS.maxFiles,
        maxPatchChars: META_EVOLUTION_LIMITS.maxPatchChars,
        maxFileChars: META_EVOLUTION_LIMITS.maxFileChars,
        sandboxTimeoutMs: META_EVOLUTION_LIMITS.sandboxTimeoutMs,
      },
      requires: [
        "x-workspace-key",
        "agent token or x-agent-auth: verified",
        "sandbox build pass before commit gate",
      ],
      commitPolicy: {
        pushOnFail: false,
        pushOnScaffold: false,
        discardOnSandboxFail: true,
      },
    },
    {
      headers: {
        "x-workspace-bound": gate.workspaceId,
        "x-meta-evolution": "probe",
      },
    }
  );
}

/**
 * POST /api/sre/meta-evolution
 * Workspace-gated self-remediation hook:
 * isolate platform repo → sandbox validator build → discard on fail.
 */
export async function POST(request: Request) {
  const denied = await requireMetaEvolutionAuth(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiFail("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = MetaEvolutionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  const gate = await requireWorkspaceApiKeyGate(
    request,
    body.workspaceId ?? null
  );
  if (!gate.ok) return gateFail(gate);

  try {
    const result = await executeMetaEvolutionRun({
      workspaceId: gate.workspaceId,
      request: body,
      signal: request.signal,
    });

    if (!result.ok) {
      // Surface sandbox diagnostics while keeping success=false (discarded).
      return apiFail(result.error, result.code, 422, {
        "x-workspace-bound": gate.workspaceId,
        "x-meta-evolution": "discarded",
        "x-meta-run-id": result.runId,
        "x-meta-discard-code": result.discarded.code,
      });
    }

    return apiOk(
      {
        authMode: gate.authMode,
        evolution: result,
      },
      {
        status: 202,
        headers: {
          "x-workspace-bound": gate.workspaceId,
          "x-meta-evolution": "accepted",
          "x-meta-run-id": result.runId,
          "x-meta-commit-gate": "pass",
        },
      }
    );
  } catch (err) {
    console.error("[sre/meta-evolution] uncontained failure:", err);
    return apiFail(
      err instanceof Error ? err.message : "Meta-evolution pipeline failed.",
      "META_EVOLUTION_PIPELINE_FAILED",
      503,
      {
        "x-workspace-bound": gate.workspaceId,
        "x-meta-evolution": "error",
      }
    );
  }
}
