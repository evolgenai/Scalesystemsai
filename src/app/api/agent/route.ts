import { NextRequest, NextResponse } from "next/server";

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentType =
  | "lead-sentinel"
  | "systems-orchestrator"
  | "support-specialist";

type AgentRunRequest = {
  clientApiKey?: string;
  agentType?: string;
  payloadData?: Record<string, unknown>;
};

type ExecutionLog = {
  step: number;
  node: string;
  action: string;
  durationMs: number;
};

type AgentRunResponse = {
  success: true;
  runId: string;
  agentType: AgentType;
  status: "RESOLVED_AND_SYNCED";
  computeTokensSpent: number;
  completedAt: string;
  executionPath: ExecutionLog[];
  workflow: {
    summary: string;
    stepsCompleted: number;
    recordsProcessed: number;
    downstreamSyncTargets: string[];
  };
  payloadEcho: Record<string, unknown> | null;
};

type ErrorResponse = {
  success: false;
  error: string;
  code: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_AGENT_TYPES = new Set<string>([
  "lead-sentinel",
  "systems-orchestrator",
  "support-specialist",
]);

function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 10);
  return `ss-run-${timestamp}-${entropy}`;
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

// ─── Agent Pipeline Simulators ───────────────────────────────────────────────

function simulateLeadSentinelRun(
  payloadData: Record<string, unknown> | undefined
): Omit<AgentRunResponse, "runId" | "completedAt" | "payloadEcho"> & {
  computeTokensSpent: number;
} {
  const leadCount =
    typeof payloadData?.leadCount === "number" ? payloadData.leadCount : 1;

  return {
    success: true,
    agentType: "lead-sentinel",
    status: "RESOLVED_AND_SYNCED",
    computeTokensSpent: 1240 + leadCount * 180,
    executionPath: [
      {
        step: 1,
        node: "INGEST_GATEWAY",
        action: "Validated inbound webhook payload and authenticated client scope",
        durationMs: 42,
      },
      {
        step: 2,
        node: "LANGGRAPH_CLUSTER",
        action: "Initialized multi-agent lead qualification graph",
        durationMs: 118,
      },
      {
        step: 3,
        node: "ENRICHMENT_ENGINE",
        action: `Scraped and enriched ${leadCount} inbound profile(s) via Clearbit + LinkedIn vectors`,
        durationMs: 890,
      },
      {
        step: 4,
        node: "INTENT_SCORER",
        action: "Computed semantic intent scores — avg confidence: 91.4%",
        durationMs: 312,
      },
      {
        step: 5,
        node: "CRM_SYNC",
        action: "Injected qualified records into HubSpot pipeline — 0 conflicts",
        durationMs: 205,
      },
    ],
    workflow: {
      summary:
        "Lead Qualification Sentinel completed inbound capture, enrichment, scoring, and CRM synchronization.",
      stepsCompleted: 5,
      recordsProcessed: leadCount,
      downstreamSyncTargets: ["HubSpot", "Salesforce Webhook", "Slack Alert Channel"],
    },
  };
}

function simulateSystemsOrchestratorRun(
  payloadData: Record<string, unknown> | undefined
): Omit<AgentRunResponse, "runId" | "completedAt" | "payloadEcho"> & {
  computeTokensSpent: number;
} {
  const recordCount =
    typeof payloadData?.recordCount === "number" ? payloadData.recordCount : 847;

  return {
    success: true,
    agentType: "systems-orchestrator",
    status: "RESOLVED_AND_SYNCED",
    computeTokensSpent: 2180 + Math.floor(recordCount / 10),
    executionPath: [
      {
        step: 1,
        node: "EVENT_ROUTER",
        action: "Received cross-platform trigger from organizational webhook",
        durationMs: 38,
      },
      {
        step: 2,
        node: "CREWAI_ORCHESTRATOR",
        action: "Spawned autonomic execution crew with safety validation protocols",
        durationMs: 156,
      },
      {
        step: 3,
        node: "DATA_MIGRATION_LAYER",
        action: `Synchronized ${recordCount} records across Salesforce → HubSpot → PostgreSQL`,
        durationMs: 1420,
      },
      {
        step: 4,
        node: "RECONCILIATION_ENGINE",
        action: "Validated financial reconciliation integrity — 0 anomalies detected",
        durationMs: 540,
      },
      {
        step: 5,
        node: "NOTIFICATION_TRIAGE",
        action: "Dispatched Slack escalation summary to #ops-alerts channel",
        durationMs: 88,
      },
    ],
    workflow: {
      summary:
        "Enterprise Systems Orchestrator completed cross-platform sync, validation, and notification dispatch.",
      stepsCompleted: 5,
      recordsProcessed: recordCount,
      downstreamSyncTargets: ["Salesforce", "HubSpot", "PostgreSQL", "Slack"],
    },
  };
}

function simulateSupportSpecialistRun(
  payloadData: Record<string, unknown> | undefined
): Omit<AgentRunResponse, "runId" | "completedAt" | "payloadEcho"> & {
  computeTokensSpent: number;
} {
  const ticketId =
    typeof payloadData?.ticketId === "string" ? payloadData.ticketId : "#4821";

  return {
    success: true,
    agentType: "support-specialist",
    status: "RESOLVED_AND_SYNCED",
    computeTokensSpent: 980,
    executionPath: [
      {
        step: 1,
        node: "TICKET_INGEST",
        action: `Ingested support ticket ${ticketId} from webhook queue`,
        durationMs: 31,
      },
      {
        step: 2,
        node: "QDRANT_RETRIEVAL",
        action: "Queried hybrid vector knowledge base — 14 relevant docs retrieved",
        durationMs: 220,
      },
      {
        step: 3,
        node: "ROOT_CAUSE_ANALYZER",
        action: "Identified API timeout root cause via log file semantic scan",
        durationMs: 670,
      },
      {
        step: 4,
        node: "RESOLUTION_ENGINE",
        action: "Generated autonomic L2 resolution with reproduction map",
        durationMs: 410,
      },
      {
        step: 5,
        node: "HANDOFF_SYNC",
        action: "Synced resolution to Zendesk — customer notified via email",
        durationMs: 95,
      },
    ],
    workflow: {
      summary:
        "24/7 Technical Support Specialist autonomously resolved ticket and synced outcome to downstream systems.",
      stepsCompleted: 5,
      recordsProcessed: 1,
      downstreamSyncTargets: ["Zendesk", "Internal Knowledge Base", "SendGrid"],
    },
  };
}

function routeAgentPipeline(
  agentType: AgentType,
  payloadData: Record<string, unknown> | undefined
): Omit<AgentRunResponse, "runId" | "completedAt" | "payloadEcho"> & {
  computeTokensSpent: number;
} {
  switch (agentType) {
    case "lead-sentinel":
      return simulateLeadSentinelRun(payloadData);
    case "systems-orchestrator":
      return simulateSystemsOrchestratorRun(payloadData);
    case "support-specialist":
      return simulateSupportSpecialistRun(payloadData);
    default: {
      const _exhaustive: never = agentType;
      throw new Error(`Unhandled agent type: ${_exhaustive}`);
    }
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest
): Promise<NextResponse<AgentRunResponse | ErrorResponse>> {
  try {
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

    const { clientApiKey, agentType, payloadData } = body;

    if (!clientApiKey || clientApiKey.trim() === "") {
      return jsonError(
        "Unauthorized. A valid clientApiKey is required to initialize an agent run.",
        "UNAUTHORIZED",
        401
      );
    }

    if (!agentType || !VALID_AGENT_TYPES.has(agentType)) {
      return jsonError(
        `Invalid agentType. Accepted values: ${[...VALID_AGENT_TYPES].join(", ")}.`,
        "INVALID_AGENT_TYPE",
        400
      );
    }

    const pipelineResult = routeAgentPipeline(
      agentType as AgentType,
      payloadData
    );

    const response: AgentRunResponse = {
      ...pipelineResult,
      runId: generateRunId(),
      completedAt: new Date().toISOString(),
      payloadEcho: payloadData ?? null,
    };

    return NextResponse.json(response, { status: 200 });
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
