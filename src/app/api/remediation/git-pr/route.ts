import {
  issueGitPrRuntimeCredential,
  redeemRuntimeCredential,
  terminateHealerLoop,
} from "@/lib/crypto/runtimeConnect";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  executeGitPrRemediation,
  GitPrRemediationSchema,
} from "@/lib/remediation/gitPr";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RequestSchema = GitPrRemediationSchema.extend({
  /** Optional single-use runtime credential (ss_rt_…). */
  runtimeToken: z.string().min(16).optional(),
  /** When true, revoke all loop credentials after PR open (default). */
  terminateLoop: z.boolean().default(true),
});

async function requireRemediationAuth(
  request: Request
): Promise<NextResponse | null> {
  const gate = request.headers.get("x-agent-auth")?.trim();
  if (gate === "verified") return null;

  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
    return apiError(verdict.reason, "AGENT_TOKEN_INVALID", 401);
  }

  return apiError(
    "Unauthorized. /api/remediation/git-pr requires a verified agent token.",
    "REMEDIATION_UNAUTHORIZED",
    401
  );
}

/**
 * POST /api/remediation/git-pr
 * Validator-approved production hotfix → branch + commit + structured GitHub PR.
 */
export async function POST(request: Request) {
  const denied = await requireRemediationAuth(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;

  if (body.runtimeToken) {
    const redeemed = redeemRuntimeCredential(
      body.runtimeToken,
      ["github:pr"],
      { consume: true }
    );
    if (!redeemed.ok) {
      return apiError(redeemed.reason, redeemed.code, 401);
    }
    const bindOwner = redeemed.claims.bind?.owner;
    const bindRepo = redeemed.claims.bind?.repo;
    if (bindOwner && bindOwner !== body.owner) {
      return apiError(
        "Runtime token is bound to a different repository owner.",
        "RUNTIME_REPO_MISMATCH",
        403
      );
    }
    if (bindRepo && bindRepo !== body.repo) {
      return apiError(
        "Runtime token is bound to a different repository.",
        "RUNTIME_REPO_MISMATCH",
        403
      );
    }
    if (redeemed.claims.loopId !== body.loopId) {
      return apiError(
        "Runtime token loopId mismatch.",
        "RUNTIME_LOOP_MISMATCH",
        403
      );
    }
  } else {
    // Mint + immediately consume a loop-scoped credential so tokenomics stay enforced
    // even when the caller authenticates via long-lived agent gate only.
    const minted = issueGitPrRuntimeCredential({
      loopId: body.loopId,
      subject: "remediation-git-pr",
      owner: body.owner,
      repo: body.repo,
      ttlSeconds: 300,
    });
    const consumed = redeemRuntimeCredential(minted.rawToken, ["github:pr"], {
      consume: true,
    });
    if (!consumed.ok) {
      return apiError(
        "Failed to establish runtime-scoped GitHub credential.",
        "RUNTIME_ISSUE_FAILED",
        500
      );
    }
  }

  const result = await executeGitPrRemediation({
    owner: body.owner,
    repo: body.repo,
    baseBranch: body.baseBranch,
    branchName: body.branchName,
    title: body.title,
    body: body.body,
    files: body.files,
    commitMessage: body.commitMessage,
    draft: body.draft,
    loopId: body.loopId,
    validatorApproved: body.validatorApproved,
    severity: body.severity,
    errorSummary: body.errorSummary,
  });

  if (body.terminateLoop) {
    terminateHealerLoop(body.loopId);
  }

  if (!result.ok) {
    return apiError(result.error, result.code, result.status ?? 502);
  }

  return apiSuccess(
    {
      remediation: {
        owner: result.owner,
        repo: result.repo,
        baseBranch: result.baseBranch,
        headBranch: result.headBranch,
        commitSha: result.commitSha,
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        filesChanged: result.filesChanged,
        loopId: result.loopId,
      },
    },
    201
  );
}

/**
 * GET /api/remediation/git-pr — protocol probe (no secrets).
 */
export async function GET(request: Request) {
  const denied = await requireRemediationAuth(request);
  if (denied) return denied;

  return apiSuccess({
    protocol: "scalesystems.remediation.git-pr/v1",
    requires: [
      "validatorApproved=true",
      "agent token or x-agent-auth",
      "GITHUB_TOKEN server env",
    ],
    scopes: ["github:pr"],
  });
}
