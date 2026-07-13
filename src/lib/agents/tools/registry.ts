import { dispatchAgentWebhook } from "@/lib/agents/tools/webhooks";
import type { AgentArchetype } from "@/lib/agents/multiAgent";

export type SystemTool = {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<string>;
};

const API_REQUEST_LIMIT = 10_000;
const API_REQUESTS_USED = 9_984;

async function readLocalLogs(
  params: Record<string, unknown>
): Promise<string> {
  const window =
    typeof params.window === "string" ? params.window : "24h";
  const metricsRaw =
    typeof params.metricsRaw === "string"
      ? params.metricsRaw
      : `sse_events=${params.sseEventCount ?? 0}; agent_cycles=${params.cycleCount ?? 1}; runtime=us-east-1`;

  const segments = metricsRaw
    .split(/[;,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const parsed = segments.map((segment) => {
    const [key, value] = segment.split("=").map((part) => part.trim());
    return { key: key ?? "unknown", value: value ?? "n/a" };
  });

  const archetype =
    typeof params.archetype === "string" ? params.archetype : undefined;

  const report = {
    tool: "readLocalLogs",
    archetype,
    window,
    parsedMetrics: parsed,
    operationalSummary: `Ingested ${parsed.length} metric key(s) across ${window} operational window.`,
    healthSignal:
      parsed.length >= 2 ? "nominal" : "degraded — sparse telemetry",
  };

  return JSON.stringify(report, null, 2);
}

async function optimizeWorkspaceBounds(
  params: Record<string, unknown>
): Promise<string> {
  const used =
    typeof params.requestsUsed === "number"
      ? params.requestsUsed
      : API_REQUESTS_USED;
  const limit =
    typeof params.requestLimit === "number"
      ? params.requestLimit
      : API_REQUEST_LIMIT;

  const remaining = Math.max(limit - used, 0);
  const utilizationPct = Number(((used / limit) * 100).toFixed(2));
  const throttleRecommended = utilizationPct >= 95;

  const actions: string[] = [
    `Reclaim ${remaining.toLocaleString("en-US")} remaining API request units before hard cap.`,
    throttleRecommended
      ? "Enable quota-aware throttling on orchestrator tool dispatch."
      : "Maintain current dispatch cadence — headroom within safe bounds.",
    "Shard long-running agent cycles across off-peak execution windows.",
  ];

  const report = {
    tool: "optimizeWorkspaceBounds",
    quota: {
      used,
      limit,
      remaining,
      utilizationPct,
    },
    throttleRecommended,
    recommendedActions: actions,
    objective:
      typeof params.objective === "string" ? params.objective : undefined,
  };

  return JSON.stringify(report, null, 2);
}

async function dispatchAgentWebhookTool(
  params: Record<string, unknown>
): Promise<string> {
  const targetUrl =
    typeof params.targetUrl === "string" && params.targetUrl.trim()
      ? params.targetUrl.trim()
      : process.env.AGENT_WEBHOOK_URL?.trim() ?? "";

  if (!targetUrl) {
    throw new Error(
      "dispatchAgentWebhook requires targetUrl (or AGENT_WEBHOOK_URL env)."
    );
  }

  const payload =
    typeof params.payload === "object" && params.payload !== null
      ? (params.payload as Record<string, unknown>)
      : {
          event: params.event ?? "agent.execution.update",
          objective: params.objective,
          agent: params.agent,
          phase: params.phase,
          taskContext: params.taskContext,
        };

  return dispatchAgentWebhook(targetUrl, payload);
}

async function delegateToAgent(
  params: Record<string, unknown>
): Promise<string> {
  const sourceAgentId =
    typeof params.sourceAgentId === "string" ? params.sourceAgentId : "";
  const sourceAgentName =
    typeof params.sourceAgentName === "string"
      ? params.sourceAgentName
      : "Systems Orchestrator";
  const targetAgent = params.targetAgent as AgentArchetype;
  const taskContext =
    typeof params.taskContext === "string"
      ? params.taskContext
      : typeof params.objective === "string"
        ? params.objective
        : "Cross-domain supervisory task";

  if (!sourceAgentId) {
    throw new Error("delegateToAgent requires sourceAgentId.");
  }

  if (targetAgent !== "OpsAgent" && targetAgent !== "SecurityAgent") {
    throw new Error(
      `Invalid targetAgent "${String(params.targetAgent)}". Use OpsAgent or SecurityAgent.`
    );
  }

  const { executeAgentHandoff } = await import("@/lib/agents/multiAgent");

  return executeAgentHandoff({
    sourceAgentId,
    sourceAgentName,
    targetAgent,
    taskContext,
  });
}

const TOOL_REGISTRY: Record<string, SystemTool> = {
  readLocalLogs: {
    name: "readLocalLogs",
    description:
      "Parses operational analytics and local metrics strings from the runtime plane.",
    execute: readLocalLogs,
  },
  optimizeWorkspaceBounds: {
    name: "optimizeWorkspaceBounds",
    description:
      "Evaluates systemic quota balances and yields an actionable optimization report.",
    execute: optimizeWorkspaceBounds,
  },
  dispatchAgentWebhook: {
    name: "dispatchAgentWebhook",
    description:
      "Forwards execution updates, system alerts, or transaction payloads to an external webhook URL.",
    execute: dispatchAgentWebhookTool,
  },
  delegateToAgent: {
    name: "delegateToAgent",
    description:
      "Supervisor hand-off — pauses the active agent and spins up a target archetype lifecycle matrix.",
    execute: delegateToAgent,
  },
};

export function listRegisteredTools(): SystemTool[] {
  return Object.values(TOOL_REGISTRY);
}

export async function executeToolByName(
  name: string,
  params: Record<string, unknown> = {}
): Promise<string> {
  const tool = TOOL_REGISTRY[name];

  if (!tool) {
    throw new Error(
      `Unknown system tool "${name}". Registered: ${Object.keys(TOOL_REGISTRY).join(", ")}`
    );
  }

  return tool.execute(params);
}
