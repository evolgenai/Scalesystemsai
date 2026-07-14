import type { AgentStatus } from "@prisma/client";
import type { VisualizerStatus } from "@/lib/agents/streamProtocol";
import {
  extractUrlFromText,
  scrapeUrl,
  type WebScrapeResult,
} from "@/lib/tools/webScraper";
import {
  extractCodeFromText,
  runCodeInSandbox,
  synthesizeDemoSnippet,
  type CodeSandboxResult,
} from "@/lib/tools/codeSandbox";

export type WorkerToolKind = "webScraper" | "codeSandbox";

export type GeminiPlanStep = {
  agentId: string;
  agentName: string;
  message: string;
  status: VisualizerStatus;
  prismaStatus: AgentStatus;
  stage: string;
  delayMs: number;
  tool?: WorkerToolKind | null;
};

export type GeminiOrchestratorPlan = {
  summary: string;
  engine: "gemini" | "heuristic";
  steps: GeminiPlanStep[];
  detectedUrl: string | null;
  detectedCode: string | null;
  /** Workers selected by the fast router pass. */
  routedWorkers?: string[];
  /** True when independent tool steps should run concurrently. */
  parallelTools?: boolean;
};

export type ToolExecutionResult = {
  tool: WorkerToolKind;
  success: boolean;
  blocked?: boolean;
  logLines: string[];
  digestForGemini: string;
  scrape?: WebScrapeResult;
  sandbox?: CodeSandboxResult;
};

const KNOWN_WORKERS: Record<
  string,
  { agentId: string; agentName: string; roleHint: string }
> = {
  "web-scraper": {
    agentId: "web-scraper",
    agentName: "WebScraper Sub-Agent",
    roleHint: "site crawl / extraction",
  },
  webscraper: {
    agentId: "web-scraper",
    agentName: "WebScraper Sub-Agent",
    roleHint: "site crawl / extraction",
  },
  "code-architect": {
    agentId: "code-architect",
    agentName: "CodeArchitect Sub-Agent",
    roleHint: "architecture / codegen",
  },
  codearchitect: {
    agentId: "code-architect",
    agentName: "CodeArchitect Sub-Agent",
    roleHint: "architecture / codegen",
  },
  "lead-sentinel": {
    agentId: "lead-sentinel",
    agentName: "Lead Qualification Sentinel",
    roleHint: "lead scoring",
  },
  "support-specialist": {
    agentId: "support-specialist",
    agentName: "Support Specialist",
    roleHint: "support triage",
  },
  "ops-orchestrator": {
    agentId: "ops-orchestrator",
    agentName: "Systems Orchestrator",
    roleHint: "orchestration",
  },
};

function normalizeWorkerKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function resolveWorker(rawId: string, rawName?: string): {
  agentId: string;
  agentName: string;
} {
  const key = normalizeWorkerKey(rawId || rawName || "");
  const known =
    KNOWN_WORKERS[key] ?? KNOWN_WORKERS[key.replace(/-sub-agent$/, "")];
  if (known) {
    return { agentId: known.agentId, agentName: known.agentName };
  }

  const slug =
    key ||
    normalizeWorkerKey(rawName || "worker") ||
    `worker-${Math.random().toString(36).slice(2, 7)}`;

  return {
    agentId: slug,
    agentName: rawName?.trim() || `${slug} Sub-Agent`,
  };
}

function mapStatus(raw: unknown): {
  status: VisualizerStatus;
  prismaStatus: AgentStatus;
} {
  const value = String(raw ?? "EXECUTING").toUpperCase();
  if (value === "THINKING" || value === "PLANNING" || value === "REFLECTING") {
    return { status: "THINKING", prismaStatus: "PLANNING" };
  }
  if (value === "SUCCESS" || value === "IDLE") {
    return {
      status: value === "SUCCESS" ? "SUCCESS" : "IDLE",
      prismaStatus: "IDLE",
    };
  }
  if (value === "ERROR") {
    return { status: "ERROR", prismaStatus: "ERROR" };
  }
  return { status: "EXECUTING", prismaStatus: "EXECUTING" };
}

function inferToolForStep(
  agentId: string,
  stage: string,
  message: string,
  hasUrl: boolean,
  hasCodeIntent: boolean
): WorkerToolKind | null {
  const blob = `${stage} ${message}`.toLowerCase();
  if (
    agentId === "web-scraper" &&
    hasUrl &&
    /(extract|scrape|fetch|crawl|acquire|analyze)/.test(blob)
  ) {
    return "webScraper";
  }
  if (
    agentId === "code-architect" &&
    hasCodeIntent &&
    /(run|execut|sandbox|compute|script|implement|architect)/.test(blob)
  ) {
    return "codeSandbox";
  }
  return null;
}

function objectiveWantsCode(objective: string): boolean {
  return /code|architect|refactor|implement|script|typescript|python|function|compute|sandbox|run\s+/i.test(
    objective
  );
}

function buildHeuristicPlan(objective: string): GeminiOrchestratorPlan {
  const lower = objective.toLowerCase();
  const detectedUrl = extractUrlFromText(objective);
  const detectedCode = extractCodeFromText(objective);
  const wantsCode = objectiveWantsCode(objective) || Boolean(detectedCode);
  const wantsWeb =
    Boolean(detectedUrl) ||
    /web|site|scrape|crawl|url|http|analyze.*(page|site|domain)/i.test(lower);
  const wantsLeads = /lead|crm|sales|prospect|pipeline|qualify/i.test(lower);
  const wantsSupport = /support|ticket|helpdesk|customer|triage/i.test(lower);

  const steps: GeminiPlanStep[] = [
    {
      agentId: "ops-orchestrator",
      agentName: "Systems Orchestrator",
      message: `Capturing objective: "${objective.slice(0, 120)}${
        objective.length > 120 ? "…" : ""
      }"`,
      status: "THINKING",
      prismaStatus: "PLANNING",
      stage: "capture",
      delayMs: 500,
    },
    {
      agentId: "ops-orchestrator",
      agentName: "Systems Orchestrator",
      message: "Analyzing request and drafting multi-agent hand-off graph…",
      status: "THINKING",
      prismaStatus: "PLANNING",
      stage: "analyze",
      delayMs: 700,
    },
  ];

  if (wantsWeb || (!wantsCode && !wantsLeads && !wantsSupport)) {
    steps.push({
      agentId: "web-scraper",
      agentName: "WebScraper Sub-Agent",
      message: "Spawning Sub-Agent [WebScraper] for acquisition / analysis…",
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "spawn-web",
      delayMs: 400,
    });
  }

  if (wantsCode) {
    steps.push({
      agentId: "code-architect",
      agentName: "CodeArchitect Sub-Agent",
      message: "Spawning Sub-Agent [CodeArchitect] for system design…",
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "spawn-code",
      delayMs: 400,
    });
  }

  // Place tool channels adjacent so the stream runtime can Promise.all them.
  if (wantsWeb || (!wantsCode && !wantsLeads && !wantsSupport)) {
    steps.push({
      agentId: "web-scraper",
      agentName: "WebScraper Sub-Agent",
      message: detectedUrl
        ? `Fetching and sanitizing ${detectedUrl}…`
        : "Extracting target signals and pruning noisy branch nodes…",
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "extract",
      delayMs: 200,
      tool: detectedUrl ? "webScraper" : null,
    });
  }

  if (wantsCode) {
    steps.push({
      agentId: "code-architect",
      agentName: "CodeArchitect Sub-Agent",
      message: "Running computation through the secure code sandbox…",
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "sandbox-run",
      delayMs: 200,
      tool: "codeSandbox",
    });
  }

  if (wantsLeads) {
    steps.push({
      agentId: "lead-sentinel",
      agentName: "Lead Qualification Sentinel",
      message: "Scoring inbound intents and syncing CRM-ready payloads…",
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "leads",
      delayMs: 850,
    });
  }

  if (wantsSupport) {
    steps.push({
      agentId: "support-specialist",
      agentName: "Support Specialist",
      message: "Triaging support vectors and drafting resolution paths…",
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "support",
      delayMs: 850,
    });
  }

  steps.push({
    agentId: "ops-orchestrator",
    agentName: "Systems Orchestrator",
    message: "Consolidating schema output and preparing operator summary…",
    status: "THINKING",
    prismaStatus: "REFLECTING",
    stage: "consolidate",
    delayMs: 800,
  });

  steps.push({
    agentId: "ops-orchestrator",
    agentName: "Systems Orchestrator",
    message: "Completed successfully",
    status: "SUCCESS",
    prismaStatus: "IDLE",
    stage: "complete",
    delayMs: 400,
  });

  return {
    summary: `Heuristic plan for: ${objective.slice(0, 80)}`,
    engine: "heuristic",
    steps,
    detectedUrl,
    detectedCode,
    routedWorkers: [
      ...(wantsWeb || (!wantsCode && !wantsLeads && !wantsSupport)
        ? ["web-scraper"]
        : []),
      ...(wantsCode ? ["code-architect"] : []),
      ...(wantsLeads ? ["lead-sentinel"] : []),
      ...(wantsSupport ? ["support-specialist"] : []),
    ],
    parallelTools: Boolean(
      (wantsWeb || Boolean(detectedUrl)) && wantsCode
    ),
  };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini response did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

async function callGeminiGenerateContent(
  prompt: string,
  signal: AbortSignal,
  options?: { json?: boolean; maxOutputTokens?: number }
): Promise<string> {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model =
    process.env.GEMINI_MODEL?.trim() ||
    process.env.AGENT_STREAM_MODEL?.trim() ||
    "gemini-2.0-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: options?.maxOutputTokens ?? 1024,
        ...(options?.json === false
          ? {}
          : { responseMimeType: "application/json" }),
      },
    }),
  });

  const payload = (await response.json()) as GeminiGenerateResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Gemini HTTP ${response.status}`
    );
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty plan payload.");
  }

  return text;
}

function normalizeGeminiPlan(
  objective: string,
  parsed: unknown
): GeminiOrchestratorPlan {
  const detectedUrl = extractUrlFromText(objective);
  const detectedCode = extractCodeFromText(objective);
  const wantsCode = objectiveWantsCode(objective) || Boolean(detectedCode);

  const root = (parsed ?? {}) as {
    summary?: string;
    steps?: Array<{
      agentId?: string;
      agentName?: string;
      message?: string;
      status?: string;
      stage?: string;
      tool?: string | null;
    }>;
  };

  const steps: GeminiPlanStep[] = [
    {
      agentId: "ops-orchestrator",
      agentName: "Systems Orchestrator",
      message: `Objective locked: "${objective.slice(0, 140)}${
        objective.length > 140 ? "…" : ""
      }"`,
      status: "THINKING",
      prismaStatus: "PLANNING",
      stage: "capture",
      delayMs: 450,
    },
    {
      agentId: "ops-orchestrator",
      agentName: "Systems Orchestrator",
      message: "Gemini analysis complete — synthesizing worker delegation graph…",
      status: "THINKING",
      prismaStatus: "PLANNING",
      stage: "analyze",
      delayMs: 550,
    },
  ];

  const remoteSteps = Array.isArray(root.steps) ? root.steps : [];
  for (const [index, step] of remoteSteps.entries()) {
    const worker = resolveWorker(step.agentId ?? "", step.agentName);
    const statuses = mapStatus(step.status);
    const stage = step.stage?.trim() || `step-${index + 1}`;
    const message =
      step.message?.trim() ||
      `Executing delegated task ${index + 1} for ${worker.agentName}…`;

    const rawTool = String(step.tool ?? "").toLowerCase();
    let tool: WorkerToolKind | null = null;
    if (rawTool === "webscraper" || rawTool === "web_scraper") {
      tool = "webScraper";
    } else if (rawTool === "codesandbox" || rawTool === "code_sandbox") {
      tool = "codeSandbox";
    } else {
      tool = inferToolForStep(
        worker.agentId,
        stage,
        message,
        Boolean(detectedUrl),
        wantsCode
      );
    }

    steps.push({
      agentId: worker.agentId,
      agentName: worker.agentName,
      message,
      status: statuses.status,
      prismaStatus: statuses.prismaStatus,
      stage,
      delayMs: 750 + Math.min(index * 80, 400),
      tool,
    });
  }

  if (steps.length <= 2) {
    return buildHeuristicPlan(objective);
  }

  // Ensure at least one real tool invocation when URL/code intent is present.
  if (detectedUrl && !steps.some((s) => s.tool === "webScraper")) {
    steps.splice(steps.length - 2, 0, {
      agentId: "web-scraper",
      agentName: "WebScraper Sub-Agent",
      message: `Executing read-only scrape against ${detectedUrl}`,
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "extract",
      delayMs: 400,
      tool: "webScraper",
    });
  }
  if (wantsCode && !steps.some((s) => s.tool === "codeSandbox")) {
    steps.splice(steps.length - 2, 0, {
      agentId: "code-architect",
      agentName: "CodeArchitect Sub-Agent",
      message: "Dispatching payload to the secure code sandbox…",
      status: "EXECUTING",
      prismaStatus: "EXECUTING",
      stage: "sandbox-run",
      delayMs: 350,
      tool: "codeSandbox",
    });
  }

  steps.push({
    agentId: "ops-orchestrator",
    agentName: "Systems Orchestrator",
    message: "Consolidating schema output across worker nodes…",
    status: "THINKING",
    prismaStatus: "REFLECTING",
    stage: "consolidate",
    delayMs: 700,
  });

  steps.push({
    agentId: "ops-orchestrator",
    agentName: "Systems Orchestrator",
    message: "Completed successfully",
    status: "SUCCESS",
    prismaStatus: "IDLE",
    stage: "complete",
    delayMs: 400,
  });

  return {
    summary:
      root.summary?.trim() ||
      `Gemini plan for: ${objective.slice(0, 80)}`,
    engine: "gemini",
    steps,
    detectedUrl,
    detectedCode,
    routedWorkers: Array.from(
      new Set(
        steps
          .map((s) => s.agentId)
          .filter((id) => id !== "ops-orchestrator")
      )
    ),
    parallelTools:
      steps.filter((s) => s.tool).length >= 2,
  };
}

/**
 * Fast Router pass — classify the objective into specialized workers before
 * the full plan is expanded. Falls back to heuristic routing when Gemini is
 * unavailable.
 */
export async function routeObjectiveToWorkers(
  objective: string,
  signal: AbortSignal
): Promise<{
  workers: string[];
  rationale: string;
  engine: "gemini" | "heuristic";
}> {
  const trimmed = objective.trim();
  const heuristic = buildHeuristicPlan(trimmed);

  try {
    const text = await callGeminiGenerateContent(
      [
        "You are the ScaleSystems Swarm Router — a principal software engineer.",
        "Classify the operator objective into the minimal set of specialist workers.",
        "Return ONLY valid JSON:",
        '{"workers":["web-scraper"|"code-architect"|"lead-sentinel"|"support-specialist"],"rationale":"one terse sentence"}',
        "Rules:",
        "- Prefer web-scraper for URLs, crawl, scrape, page analysis.",
        "- Prefer code-architect for scripts, TypeScript/Python, sandbox execution, architecture.",
        "- Prefer lead-sentinel for CRM/lead qualification.",
        "- Prefer support-specialist for tickets/support triage.",
        "- Select 1–3 workers max. Never invent new worker ids.",
        "- Act like an expert SRE: be precise, no fluff.",
        "",
        `Objective: ${trimmed}`,
      ].join("\n"),
      signal,
      { maxOutputTokens: 220 }
    );
    const parsed = extractJsonObject(text) as {
      workers?: unknown;
      rationale?: unknown;
    };
    const workers = Array.isArray(parsed.workers)
      ? parsed.workers
          .map((w) => resolveWorker(String(w)).agentId)
          .filter(
            (id, index, all) =>
              id !== "ops-orchestrator" && all.indexOf(id) === index
          )
          .slice(0, 3)
      : [];

    if (workers.length === 0) {
      return {
        workers: heuristic.routedWorkers ?? [],
        rationale: heuristic.summary,
        engine: "heuristic",
      };
    }

    return {
      workers,
      rationale:
        typeof parsed.rationale === "string" && parsed.rationale.trim()
          ? parsed.rationale.trim()
          : `Routed to ${workers.join(", ")}`,
      engine: "gemini",
    };
  } catch {
    return {
      workers: heuristic.routedWorkers ?? [],
      rationale: heuristic.summary,
      engine: "heuristic",
    };
  }
}

/**
 * Build a Gemini-powered multi-agent execution plan for the given objective.
 * Uses a fast Router pass first, then expands a Worker graph. Falls back to a
 * deterministic heuristic plan when the key is missing or the API fails.
 */
export async function buildGeminiOrchestratorPlan(
  objective: string,
  signal: AbortSignal
): Promise<GeminiOrchestratorPlan> {
  const trimmed =
    objective.trim() || "Execute a general enterprise swarm cycle.";

  const route = await routeObjectiveToWorkers(trimmed, signal);

  try {
    const prompt = [
      "You are the ScaleSystems Systems Orchestrator — principal staff engineer.",
      "Expand the Router decision into a concrete Worker execution graph.",
      "Return ONLY valid JSON with this shape:",
      '{"summary":"string","steps":[{"agentId":"web-scraper|code-architect|lead-sentinel|support-specialist|ops-orchestrator","agentName":"string","message":"concise kernel telemetry","status":"THINKING|EXECUTING|SUCCESS","stage":"short-slug","tool":"webScraper|codeSandbox|null"}]}',
      "System guidelines:",
      "- Dual output discipline: console telemetry stays terse; human digests are produced by tools separately.",
      "- Prefer WebScraper for website/crawl/analysis; set tool=webScraper on scrape/extract steps.",
      "- Prefer CodeArchitect for code/architecture/implementation; set tool=codeSandbox on run/exec steps.",
      "- Prefer Lead Sentinel for CRM/lead qualification; Support Specialist for tickets.",
      "- When scrape + sandbox are both required, emit both tool steps so they can run in PARALLEL.",
      "- Include 3 to 6 worker steps (not counting orchestrator).",
      "- Messages: crisp operator telemetry only — no markdown, no prose essays.",
      "",
      `Router workers: ${route.workers.join(", ") || "auto"}`,
      `Router rationale: ${route.rationale}`,
      `Objective: ${trimmed}`,
    ].join("\n");

    const text = await callGeminiGenerateContent(prompt, signal);
    const parsed = extractJsonObject(text);
    const plan = normalizeGeminiPlan(trimmed, parsed);
    return {
      ...plan,
      routedWorkers: route.workers.length
        ? route.workers
        : plan.routedWorkers,
      parallelTools:
        plan.parallelTools ||
        (route.workers.includes("web-scraper") &&
          route.workers.includes("code-architect")),
      summary:
        `${route.engine === "gemini" ? "Routed" : "Heuristic"} · ${plan.summary}`,
    };
  } catch {
    const heuristic = buildHeuristicPlan(trimmed);
    return {
      ...heuristic,
      routedWorkers: route.workers.length
        ? route.workers
        : heuristic.routedWorkers,
      summary: `${route.rationale} · ${heuristic.summary}`,
    };
  }
}

export async function narrateStepWithGemini(
  objective: string,
  stepMessage: string,
  signal: AbortSignal
): Promise<string | null> {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) return null;

  try {
    const text = await callGeminiGenerateContent(
      [
        "You are ScaleSystems live kernel telemetry (expert software engineer).",
        "Reply with ONE concise system log line for the Verbose Kernel Feed (max 16 words).",
        "No markdown, no quotes, no emojis.",
        `Objective: ${objective}`,
        `Current step: ${stepMessage}`,
      ].join("\n"),
      signal,
      { json: false, maxOutputTokens: 64 }
    );
    const cleaned = text.replace(/^["']|["']$/g, "").trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

async function digestToolOutputWithGemini(
  objective: string,
  tool: WorkerToolKind,
  digest: string,
  signal: AbortSignal
): Promise<string | null> {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) return null;

  try {
    const text = await callGeminiGenerateContent(
      [
        "You are ScaleSystems Systems Orchestrator writing for the Actual Results Pane.",
        "Summarize the tool output for a human operator in 1-2 clear sentences.",
        "Use light markdown if helpful (bold key nouns only). No code fences.",
        `Objective: ${objective}`,
        `Tool: ${tool}`,
        `Output:\n${digest.slice(0, 3500)}`,
      ].join("\n"),
      signal,
      { json: false, maxOutputTokens: 180 }
    );
    return text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Execute the concrete sandbox tool attached to a plan step and return
 * streamable log lines plus a Gemini-digestible payload.
 */
export async function executePlanStepTool(
  step: GeminiPlanStep,
  plan: GeminiOrchestratorPlan,
  objective: string,
  signal: AbortSignal
): Promise<ToolExecutionResult | null> {
  if (!step.tool) return null;

  if (step.tool === "webScraper") {
    const target =
      plan.detectedUrl ||
      extractUrlFromText(objective) ||
      extractUrlFromText(step.message);

    if (!target) {
      return {
        tool: "webScraper",
        success: false,
        logLines: [
          "[webScraper] No http(s) URL found in objective — scrape skipped.",
        ],
        digestForGemini: "No URL provided.",
      };
    }

    const scrape = await scrapeUrl(target, { signal });
    const logLines = [
      `[webScraper] GET ${scrape.url}`,
      scrape.success
        ? `[webScraper] ok · ${scrape.bytesFetched}B · ${scrape.durationMs}ms · title=${scrape.title ?? "n/a"}`
        : `[webScraper] failed · ${scrape.error ?? "unknown error"}`,
    ];

    if (scrape.success && scrape.cleanedText) {
      const snippet = scrape.cleanedText
        .split("\n")
        .filter(Boolean)
        .slice(0, 6)
        .map((line) => `[webScraper:content] ${line.slice(0, 140)}`);
      logLines.push(...snippet);
    }

    const geminiDigest = scrape.success
      ? await digestToolOutputWithGemini(
          objective,
          "webScraper",
          scrape.summary,
          signal
        )
      : null;

    if (geminiDigest) {
      logLines.push(`[gemini:digest] ${geminiDigest}`);
    }

    return {
      tool: "webScraper",
      success: scrape.success,
      logLines,
      digestForGemini: scrape.summary,
      scrape,
    };
  }

  const code =
    plan.detectedCode ||
    extractCodeFromText(objective) ||
    synthesizeDemoSnippet(objective);

  const sandbox = await runCodeInSandbox(code, { signal });
  const logLines = [
    `[codeSandbox] language=${sandbox.language} loc=${sandbox.metrics.linesOfCode}`,
    ...sandbox.stdout.map((line) => `[codeSandbox:stdout] ${line}`),
    ...sandbox.stderr.map((line) => `[codeSandbox:stderr] ${line}`),
  ];

  if (sandbox.blocked && sandbox.securityWarning) {
    logLines.push(`[codeSandbox:security] ${sandbox.securityWarning}`);
  } else if (sandbox.success) {
    logLines.push(
      `[codeSandbox] metrics ops=${sandbox.metrics.simulatedOps} duration=${sandbox.metrics.durationMs}ms`
    );
  }

  const geminiDigest = await digestToolOutputWithGemini(
    objective,
    "codeSandbox",
    sandbox.preview,
    signal
  );
  if (geminiDigest) {
    logLines.push(`[gemini:digest] ${geminiDigest}`);
  }

  return {
    tool: "codeSandbox",
    success: sandbox.success,
    blocked: sandbox.blocked,
    logLines,
    digestForGemini: sandbox.preview,
    sandbox,
  };
}
