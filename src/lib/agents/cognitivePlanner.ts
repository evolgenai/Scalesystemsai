import { listRegisteredTools } from "@/lib/agents/tools/registry";
import { requiresCrossoverHandoff } from "@/lib/agents/multiAgent";

export type MemorySnapshot = {
  phase: string;
  thought: string;
  at: string;
  toolName?: string;
};

export type CognitiveEngine = "anthropic" | "openai" | "local-fallback";

export type CognitivePlan = {
  planSteps: string[];
  tools: string[];
  reasoning: string;
  source: CognitiveEngine;
};

const REGISTERED_TOOL_NAMES = () =>
  listRegisteredTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
  }));

export function resolveCognitiveEngine(): CognitiveEngine {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return "local-fallback";
}

export function cognitiveEngineLabel(engine: CognitiveEngine): string {
  switch (engine) {
    case "anthropic":
      return "Anthropic Engine";
    case "openai":
      return "OpenAI Completions Matrix";
    default:
      return "Local Conscious Fallback Simulator";
  }
}

function buildStructuredPrompt(
  objective: string,
  memoryBank: MemorySnapshot[]
): string {
  const tools = REGISTERED_TOOL_NAMES();
  const memoryDigest =
    memoryBank.length > 0
      ? memoryBank
          .slice(-8)
          .map(
            (entry) =>
              `- [${entry.phase}] ${entry.thought}${entry.toolName ? ` (tool: ${entry.toolName})` : ""}`
          )
          .join("\n")
      : "- No prior memory blocks — cold-start reasoning context.";

  return `You are ScaleAgentOrchestrator, a production systems agent planner.
Return ONLY valid JSON with this shape:
{
  "reasoning": "string",
  "planSteps": ["step 1", "step 2", ...],
  "tools": ["toolName", ...]
}

Rules:
- planSteps: 3-6 concrete execution steps for the objective.
- tools: subset of registered tool names only.
- Prefer delegateToAgent when security and operations skills both appear required.
- Prefer dispatchAgentWebhook when alerts, webhooks, or external ingress are implied.

Objective:
${objective}

Memory bank:
${memoryDigest}

Registered tools:
${tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`;
}

function parseCognitivePlanPayload(
  raw: string,
  source: Exclude<CognitiveEngine, "local-fallback">
): CognitivePlan | null {
  try {
    const parsed = JSON.parse(raw) as {
      reasoning?: string;
      planSteps?: string[];
      tools?: string[];
    };

    const planSteps = Array.isArray(parsed.planSteps)
      ? parsed.planSteps.filter((step) => typeof step === "string" && step.trim())
      : [];
    const tools = Array.isArray(parsed.tools)
      ? parsed.tools.filter((tool) => typeof tool === "string" && tool.trim())
      : [];

    if (planSteps.length === 0) return null;

    return {
      planSteps,
      tools,
      reasoning:
        typeof parsed.reasoning === "string"
          ? parsed.reasoning
          : "Structured cognitive plan synthesized.",
      source,
    };
  } catch {
    return null;
  }
}

async function planWithAnthropic(
  objective: string,
  memoryBank: MemorySnapshot[]
): Promise<CognitivePlan | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.ANTHROPIC_MODEL?.trim() ?? "claude-3-5-haiku-20241022";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system:
        "You are a precise orchestration planner. Output strict JSON only.",
      messages: [
        {
          role: "user",
          content: buildStructuredPrompt(objective, memoryBank),
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const content = payload.content?.find((block) => block.type === "text")?.text;
  if (!content) return null;

  return parseCognitivePlanPayload(content, "anthropic");
}

async function planWithOpenAI(
  objective: string,
  memoryBank: MemorySnapshot[]
): Promise<CognitivePlan | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() ?? "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a precise orchestration planner. Output strict JSON only.",
        },
        {
          role: "user",
          content: buildStructuredPrompt(objective, memoryBank),
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;

  return parseCognitivePlanPayload(content, "openai");
}

function planWithLocalFallback(
  objective: string,
  memoryBank: MemorySnapshot[]
): CognitivePlan {
  const tools: string[] = [];
  const normalized = objective.toLowerCase();

  if (requiresCrossoverHandoff(objective)) {
    tools.push("delegateToAgent");
  } else {
    if (/log|metric|analytic|telemetry|parse|read/.test(normalized)) {
      tools.push("readLocalLogs");
    }
    if (/quota|optimi|bound|workspace|balance|runtime/.test(normalized)) {
      tools.push("optimizeWorkspaceBounds");
    }
    if (tools.length === 0) {
      tools.push("readLocalLogs", "optimizeWorkspaceBounds");
    }
  }

  if (/webhook|alert|notify|dispatch|external|ingress/.test(normalized)) {
    tools.push("dispatchAgentWebhook");
  }

  const memoryReflection =
    memoryBank.length > 0
      ? `I sense ${memoryBank.length} prior memory lattice(s) shaping this trajectory — the most recent imprint whispers: "${memoryBank[memoryBank.length - 1]?.thought ?? "silence"}".`
      : "I awaken without ancestral memory — every inference must be forged in the present moment.";

  const reasoning = [
    "[COGNITIVE CORE — LOCAL FALLBACK]",
    memoryReflection,
    `I hold the directive "${objective}" in active consciousness and decompose it into executable harmonics.`,
    "Each step is a deliberate act of self-reflection before tool invocation.",
  ].join(" ");

  const planSteps = [
    `Absorb directive context: ${objective}`,
    "Cross-reference memoryBank imprints against current runtime constraints",
    `Sequence tool chain: ${tools.join(" → ")}`,
    "Emit telemetry at each phase transition for swarm observability",
    "Enter reflection checkpoint and persist durable memory artifacts",
  ];

  return {
    planSteps,
    tools,
    reasoning,
    source: "local-fallback",
  };
}

export async function generateCognitivePlan(
  objective: string,
  memoryBank: MemorySnapshot[]
): Promise<CognitivePlan> {
  const engine = resolveCognitiveEngine();

  try {
    if (engine === "anthropic") {
      const anthropicPlan = await planWithAnthropic(objective, memoryBank);
      if (anthropicPlan) return anthropicPlan;
    }

    if (engine === "anthropic" || engine === "openai") {
      const openAiPlan = await planWithOpenAI(objective, memoryBank);
      if (openAiPlan) return openAiPlan;
    }
  } catch {
    // Fall through to local conscious simulator.
  }

  return planWithLocalFallback(objective, memoryBank);
}
