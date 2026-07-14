import { NextRequest, NextResponse } from "next/server";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateAgentRequest = {
  templateType?: string;
  workspaceId?: string;
};

type AgentInstance = {
  id: string;
  templateType: string;
  workspaceId: string;
  status: "pending" | "running" | "terminated";
  createdAt: string;
};

type CreateAgentResponse = {
  success: true;
  agent: AgentInstance;
};

type ListAgentsResponse = {
  success: true;
  workspaceId: string;
  agents: AgentInstance[];
  total: number;
};

type ErrorResponse = {
  success: false;
  error: string;
  code: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function generateAgentId(): string {
  const timestamp = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 10);
  return `agent-${timestamp}-${entropy}`;
}

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

function mockAgentInstances(workspaceId: string): AgentInstance[] {
  const now = new Date().toISOString();

  return [
    {
      id: "agent-mock-001",
      templateType: "lead-sentinel",
      workspaceId,
      status: "running",
      createdAt: now,
    },
    {
      id: "agent-mock-002",
      templateType: "systems-orchestrator",
      workspaceId,
      status: "pending",
      createdAt: now,
    },
  ];
}

// ─── Route Handlers ────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateAgentResponse | ErrorResponse>> {
  let body: CreateAgentRequest;

  try {
    body = (await request.json()) as CreateAgentRequest;
  } catch {
    return jsonError("Invalid JSON payload.", "INVALID_JSON", 400);
  }

  const { templateType, workspaceId } = body;

  if (!templateType || typeof templateType !== "string") {
    return jsonError(
      "templateType is required and must be a string.",
      "MISSING_TEMPLATE_TYPE",
      400
    );
  }

  if (!workspaceId || typeof workspaceId !== "string") {
    return jsonError(
      "workspaceId is required and must be a string.",
      "MISSING_WORKSPACE_ID",
      400
    );
  }

  const agent: AgentInstance = {
    id: generateAgentId(),
    templateType,
    workspaceId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json(
    { success: true, agent } satisfies CreateAgentResponse,
    { status: 201, headers: JSON_HEADERS }
  );
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<ListAgentsResponse | ErrorResponse>> {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");

  if (!workspaceId) {
    return jsonError(
      "workspaceId query parameter is required.",
      "MISSING_WORKSPACE_ID",
      400
    );
  }

  const agents = mockAgentInstances(workspaceId);

  return NextResponse.json(
    {
      success: true,
      workspaceId,
      agents,
      total: agents.length,
    } satisfies ListAgentsResponse,
    { status: 200, headers: JSON_HEADERS }
  );
}
