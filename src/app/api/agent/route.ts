import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  executeAgent,
  estimateAgentTokens,
  VALID_AGENT_TYPES,
  type AgentType,
} from "@/lib/agentRuntime";
import {
  checkAgentAccess,
  isQuotaViolation,
  recordAgentRun,
} from "@/lib/quotaGuard";

type AgentRunRequest = {
  agentType?: string;
  payloadData?: Record<string, unknown>;
};

type AgentRunResponse = {
  success: true;
  runId: string;
  agentType: AgentType;
  status: "QUEUED";
  computeTokensSpent: number;
  completedAt: string;
  workflow: {
    summary: string;
    stepsCompleted: number;
    recordsProcessed: number;
    downstreamSyncTargets: string[];
  };
};

type ErrorResponse = {
  success: false;
  error: string;
  code: string;
};

function generateRunId(): string {
  return `ss-run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function jsonError(
  error: string,
  code: string,
  status: number
): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

function methodNotAllowed(): NextResponse<ErrorResponse> {
  return jsonError(
    "Method not allowed. This endpoint only accepts POST requests.",
    "METHOD_NOT_ALLOWED",
    405
  );
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<AgentRunResponse | ErrorResponse>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return jsonError(
        "Authentication required. Sign in to execute agent runs.",
        "UNAUTHENTICATED",
        401
      );
    }

    let body: AgentRunRequest;

    try {
      body = await request.json();
    } catch {
      return jsonError(
        "Invalid JSON payload. Ensure the request body is valid JSON.",
        "INVALID_JSON",
        400
      );
    }

    const { agentType, payloadData } = body;
    const userId = session.user.id;

    if (!agentType || !VALID_AGENT_TYPES.has(agentType)) {
      return jsonError(
        `Invalid agentType. Accepted values: ${[...VALID_AGENT_TYPES].join(", ")}.`,
        "INVALID_AGENT_TYPE",
        400
      );
    }

    const typedAgent = agentType as AgentType;
    const estimatedTokens = estimateAgentTokens(typedAgent, payloadData);

    const quotaCheck = await checkAgentAccess(userId, {
      agentType,
      tokensRequired: estimatedTokens,
    });

    if (!quotaCheck.allowed) {
      return jsonError(
        quotaCheck.error,
        quotaCheck.code,
        isQuotaViolation(quotaCheck.code) ? 423 : 403
      );
    }

    const result = await executeAgent(userId, typedAgent, payloadData);

    if ("error" in result) {
      return jsonError(result.error, result.code, 412);
    }

    await recordAgentRun(userId, agentType, result.computeTokensSpent);

    return NextResponse.json(
      {
        success: true,
        runId: generateRunId(),
        agentType: typedAgent,
        status: "QUEUED",
        computeTokensSpent: result.computeTokensSpent,
        completedAt: new Date().toISOString(),
        workflow: result.workflow,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Agent Runtime Router] Unhandled error:", error);
    return jsonError(
      "Internal server error. The agent runtime router encountered an unexpected failure.",
      "INTERNAL_SERVER_ERROR",
      500
    );
  }
}

export async function GET(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}

export async function PUT(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}

export async function PATCH(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}
