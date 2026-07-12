import { NextRequest, NextResponse } from "next/server";

// ─── Types ───────────────────────────────────────────────────────────────────

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

type TerminateAgentResponse = {
  success: true;
  agentId: string;
  status: "terminated";
  terminatedAt: string;
  message: string;
};

type ErrorResponse = {
  success: false;
  error: string;
  code: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function jsonError(
  error: string,
  code: string,
  status: number
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { success: false, error, code },
    { status, headers: JSON_HEADERS }
  );
}

// ─── Route Handlers ────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse<TerminateAgentResponse | ErrorResponse>> {
  const { agentId } = await context.params;

  if (!agentId || typeof agentId !== "string") {
    return jsonError(
      "agentId path parameter is required.",
      "MISSING_AGENT_ID",
      400
    );
  }

  return NextResponse.json(
    {
      success: true,
      agentId,
      status: "terminated",
      terminatedAt: new Date().toISOString(),
      message: `Agent instance ${agentId} has been forcefully shut down.`,
    } satisfies TerminateAgentResponse,
    { status: 200, headers: JSON_HEADERS }
  );
}
