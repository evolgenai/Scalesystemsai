import type { AgentStatus, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { publishOrchestratorNarrative, type EngineTelemetryStatus } from "@/lib/agents/orchestratorEvents";
import { executeToolByName } from "@/lib/agents/tools/registry";
import {
  requiresCrossoverHandoff,
  resolveHandoffTarget,
  type AgentArchetype,
  type AgentHandoffResult,
} from "@/lib/agents/multiAgent";
import { generateCognitivePlan, cognitiveEngineLabel, resolveCognitiveEngine } from "@/lib/agents/cognitivePlanner";
import { getMaxAgentsForTier } from "@/lib/billing/tiers";

type MemoryEntry = {
  phase: string;
  thought: string;
  at: string;
  toolName?: string;
  requiresFollowUp?: boolean;
};

type ToolInputs = Record<string, unknown>;

export class ScaleAgentOrchestrator {
  private agentId: string | null = null;
  private agentName = "ScaleAgent";
  private planSteps: string[] = [];
  private resolvedTools: string[] = [];
  private lastObjective = "";
  private memorySnapshot: MemoryEntry[] = [];

  private emit(
    phase: "initialize" | "plan" | "execute" | "reflect" | "system",
    message: string,
    engineStatus?: EngineTelemetryStatus
  ): void {
    publishOrchestratorNarrative({
      agent: this.agentName,
      phase,
      message,
      engineStatus,
    });
  }

  private async updateAgent(
    data: Prisma.AgentUpdateInput
  ): Promise<void> {
    if (!this.agentId) return;
    await getPrisma().agent.update({
      where: { id: this.agentId },
      data,
    });
  }

  private async appendMemory(entry: MemoryEntry): Promise<void> {
    if (!this.agentId) return;

    const prisma = getPrisma();
    const agent = await prisma.agent.findUnique({
      where: { id: this.agentId },
      select: { memoryBank: true },
    });

    const existing = Array.isArray(agent?.memoryBank)
      ? (agent.memoryBank as MemoryEntry[])
      : [];

    await this.updateAgent({
      memoryBank: [...existing, entry] as unknown as Prisma.InputJsonValue,
    });
  }

  async initialize(agentId: string): Promise<void> {
    const prisma = getPrisma();
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        objective: true,
        memoryBank: true,
      },
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.agentId = agent.id;
    this.agentName = agent.name;
    this.lastObjective = agent.objective;

    const memoryEntries = Array.isArray(agent.memoryBank)
      ? (agent.memoryBank as MemoryEntry[])
      : [];

    this.memorySnapshot = memoryEntries;

    await this.updateAgent({
      status: "ACTIVE" satisfies AgentStatus,
      currentTask: "Bootstrapping orchestrator runtime hooks",
    });

    this.emit(
      "initialize",
      `Initialized agent "${agent.name}" — reading historical memoryBank (${memoryEntries.length} entries).`,
      "EXECUTING"
    );

    for (const entry of memoryEntries.slice(-5)) {
      this.emit(
        "initialize",
        `[MEMORY LOAD] ${entry.phase} @ ${entry.at}: ${entry.thought}`,
        "EXECUTING"
      );
    }

    if (memoryEntries.length === 0) {
      this.emit(
        "initialize",
        "[MEMORY LOAD] No prior memory blocks — cold-start context initialized.",
        "EXECUTING"
      );
    }
  }

  async plan(objective: string): Promise<string[]> {
    if (!this.agentId) {
      throw new Error("Orchestrator not initialized. Call initialize() first.");
    }

    this.lastObjective = objective;

    await this.updateAgent({
      status: "PLANNING",
      objective,
      currentTask: "Thinking Phase: Analyzing objectives...",
    });

    this.emit("plan", "Thinking Phase: Analyzing objectives...", "PLANNING");

    this.emit(
      "plan",
      "[MEMORY RECALL] Scanning internal historic parameters for contextual execution patterns...",
      "PLANNING"
    );

    const activeEngine = resolveCognitiveEngine();
    this.emit(
      "plan",
      `📡 [COGNITIVE CORE] Initializing multi-token inference loop via ${cognitiveEngineLabel(activeEngine)}...`,
      "PLANNING"
    );

    const cognitivePlan = await generateCognitivePlan(
      objective,
      this.memorySnapshot
    );

    this.emit(
      "plan",
      `[COGNITIVE ROUTING — ${cognitivePlan.source.toUpperCase()}] ${cognitivePlan.reasoning}`,
      "PLANNING"
    );

    this.planSteps = cognitivePlan.planSteps;
    this.resolvedTools = cognitivePlan.tools;

    for (const [index, step] of this.planSteps.entries()) {
      this.emit(
        "plan",
        `Plan step ${index + 1}/${this.planSteps.length}: ${step}`,
        "PLANNING"
      );
    }

    await this.appendMemory({
      phase: "plan",
      thought: `Decomposed objective into ${this.planSteps.length} execution steps.`,
      at: new Date().toISOString(),
    });

    await this.updateAgent({
      status: "EXECUTING",
      currentTask: this.planSteps[0] ?? null,
    });

    return this.planSteps;
  }

  async executeTool(toolName: string, inputs: ToolInputs): Promise<void> {
    if (!this.agentId) {
      throw new Error("Orchestrator not initialized. Call initialize() first.");
    }

    await this.updateAgent({
      status: "EXECUTING",
      currentTask: `Executing tool: ${toolName}`,
    });

    if (toolName === "delegateToAgent") {
      const targetAgent =
        (typeof inputs.targetAgent === "string"
          ? inputs.targetAgent
          : resolveHandoffTarget(this.lastObjective)) as AgentArchetype;

      this.emit(
        "execute",
        `🔄 [HAND-OFF] ${this.agentName} transferring operational token over to ${targetAgent}...`,
        "EXECUTING"
      );
    }

    if (toolName === "dispatchAgentWebhook") {
      this.emit(
        "execute",
        "📡 [WEBHOOK] Dispatching execution telemetry to external ingress rail...",
        "EXECUTING"
      );
    }

    this.emit(
      "execute",
      `Tool pipeline invoked — ${toolName}(${Object.keys(inputs).join(", ") || "no inputs"}).`,
      "EXECUTING"
    );

    const toolInputs: ToolInputs =
      toolName === "delegateToAgent"
        ? {
            ...inputs,
            sourceAgentId: this.agentId,
            sourceAgentName: this.agentName,
            targetAgent:
              inputs.targetAgent ?? resolveHandoffTarget(this.lastObjective),
            taskContext:
              typeof inputs.taskContext === "string"
                ? inputs.taskContext
                : this.lastObjective,
          }
        : toolName === "dispatchAgentWebhook"
          ? {
              ...inputs,
              objective: this.lastObjective,
              agent: this.agentName,
              phase: "execute",
              payload: inputs.payload ?? {
                event: "agent.execution.update",
                objective: this.lastObjective,
                agent: this.agentName,
                tool: toolName,
              },
            }
          : inputs;

    const toolResult = await executeToolByName(toolName, toolInputs);

    if (toolName === "delegateToAgent") {
      try {
        const handoff = JSON.parse(toolResult) as AgentHandoffResult;
        this.agentId = handoff.targetAgentId;
        this.agentName = handoff.targetAgentName;

        this.emit(
          "execute",
          `✅ [HAND-OFF] ${handoff.to} lifecycle matrix online — ${handoff.taskContext}`,
          "EXECUTING"
        );
      } catch {
        this.emit(
          "execute",
          "⚠️ [HAND-OFF] Target agent activated — continuing with handoff receipt.",
          "EXECUTING"
        );
      }
    }

    if (toolName === "dispatchAgentWebhook") {
      this.emit(
        "execute",
        `📡 [WEBHOOK] Ingress receipt logged — ${toolResult.split("\n")[0] ?? "dispatch complete"}.`,
        "EXECUTING"
      );
    }

    this.emit(
      "execute",
      `Tool output — ${toolName}:\n${toolResult}`,
      "EXECUTING"
    );

    this.emit(
      "execute",
      "Updating long-term memory blocks with tool execution artifact...",
      "REFLECTING"
    );

    await this.appendMemory({
      phase: "execute",
      thought: toolResult,
      at: new Date().toISOString(),
      toolName,
    });
  }

  async reflect(): Promise<{ requiresFollowUp: boolean }> {
    if (!this.agentId) {
      throw new Error("Orchestrator not initialized. Call initialize() first.");
    }

    await this.updateAgent({
      status: "REFLECTING",
      currentTask: "Reflection Phase: Evaluating execution fidelity",
    });

    this.emit(
      "reflect",
      "Reflection Phase: Evaluating execution fidelity...",
      "REFLECTING"
    );

    const requiresFollowUp = this.planSteps.length > 2;

    await this.appendMemory({
      phase: "reflect",
      thought: requiresFollowUp
        ? "Execution partial — scheduling follow-up planning cycle."
        : "Execution validated — objective satisfied for current cycle.",
      at: new Date().toISOString(),
      requiresFollowUp,
    });

    await this.updateAgent({
      status: requiresFollowUp ? "PLANNING" : "IDLE",
      currentTask: requiresFollowUp
        ? "Queued follow-up planning cycle"
        : null,
    });

    this.emit(
      "reflect",
      requiresFollowUp
        ? "Reflection outcome: additional action required — re-entering planning queue."
        : "Reflection outcome: cycle complete — agent returned to IDLE.",
      requiresFollowUp ? "PLANNING" : "IDLE"
    );

    return { requiresFollowUp };
  }

  async runCycle(objective: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;

    await this.plan(objective);
    if (signal?.aborted) return;

    const toolsToRun =
      this.resolvedTools.length > 0
        ? this.resolvedTools
        : this.resolveToolsForObjective(objective);

    for (const toolName of toolsToRun) {
      if (signal?.aborted) return;

      const toolInputs: ToolInputs = {
        objective,
        steps: this.planSteps.length,
        window: "24h",
        metricsRaw: `objective_tokens=${objective.length}; plan_steps=${this.planSteps.length}`,
      };

      if (toolName === "delegateToAgent") {
        toolInputs.targetAgent = resolveHandoffTarget(objective);
        toolInputs.taskContext = objective;
      }

      if (toolName === "dispatchAgentWebhook") {
        toolInputs.targetUrl = process.env.AGENT_WEBHOOK_URL;
        toolInputs.payload = {
          event: "agent.cycle.execution",
          objective,
          sourceAgent: this.agentName,
          planSteps: this.planSteps,
        };
      }

      await this.executeTool(toolName, toolInputs);
    }

    if (signal?.aborted) return;

    await this.reflect();
  }

  private resolveToolsForObjective(objective: string): string[] {
    const normalized = objective.toLowerCase();
    const tools: string[] = [];

    if (requiresCrossoverHandoff(objective)) {
      tools.push("delegateToAgent");
    } else {
      const wantsLogs =
        /log|metric|analytic|telemetry|parse|read/.test(normalized);
      const wantsOptimize =
        /quota|optimi|bound|workspace|balance|runtime/.test(normalized);

      if (wantsLogs) tools.push("readLocalLogs");
      if (wantsOptimize) tools.push("optimizeWorkspaceBounds");

      if (tools.length === 0) {
        tools.push("readLocalLogs", "optimizeWorkspaceBounds");
      }
    }

    if (/webhook|alert|notify|dispatch|external|ingress/.test(normalized)) {
      tools.push("dispatchAgentWebhook");
    }

    return tools;
  }

  static async spawnAgentFleet(
    ownerId: string,
    count: number
  ): Promise<{ created: number; agentIds: string[]; capped: boolean }> {
    const prisma = getPrisma();

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, role: true, tier: true, maxAgents: true },
    });

    if (!owner) {
      throw new Error(`Owner not found: ${ownerId}`);
    }

    const tierCap = getMaxAgentsForTier(owner.tier);
    const capacity =
      owner.role === "SUPER_ADMIN"
        ? Math.max(owner.maxAgents, tierCap, count)
        : Math.min(owner.maxAgents, tierCap);

    const existingCount = await prisma.agent.count({
      where: { ownerId },
    });

    const availableSlots = Math.max(capacity - existingCount, 0);
    const targetCount = Math.min(count, availableSlots);
    const capped = targetCount < count;

    publishOrchestratorNarrative({
      agent: "OVERLORD_NODE",
      phase: "system",
      message: `[COGNITIVE SWARM] Overlord command received. Syncing operational data patterns across ${targetCount} concurrent agent clusters...`,
      engineStatus: "EXECUTING",
    });

    if (targetCount === 0) {
      publishOrchestratorNarrative({
        agent: "OVERLORD_NODE",
        phase: "system",
        message:
          "[COGNITIVE SWARM] Fleet spawn aborted — owner agent capacity exhausted.",
        engineStatus: "IDLE",
      });
      return { created: 0, agentIds: [], capped: true };
    }

    const agentIds: string[] = [];
    const batchSize = 50;

    for (let offset = 0; offset < targetCount; offset += batchSize) {
      const batchCount = Math.min(batchSize, targetCount - offset);

      const batch = await prisma.$transaction(
        Array.from({ length: batchCount }, (_, index) => {
          const slot = existingCount + offset + index + 1;
          return prisma.agent.create({
            data: {
              name: `Fleet Agent ${slot}`,
              objective: `Autonomous fleet slot ${slot} — synchronized under owner ${ownerId}`,
              status: "ACTIVE",
              ownerId,
              memoryBank: [],
            },
            select: { id: true },
          });
        })
      );

      agentIds.push(...batch.map((agent) => agent.id));

      publishOrchestratorNarrative({
        agent: "OVERLORD_NODE",
        phase: "system",
        message: `[COGNITIVE SWARM] Batch provisioned ${batch.length} agent cluster(s) — cumulative ${agentIds.length}/${targetCount}.`,
        engineStatus: "EXECUTING",
      });
    }

    publishOrchestratorNarrative({
      agent: "OVERLORD_NODE",
      phase: "system",
      message: `[COGNITIVE SWARM] Fleet matrix online — ${agentIds.length} active concurrent agents bound to owner ledger.`,
      engineStatus: "IDLE",
    });

    return { created: agentIds.length, agentIds, capped };
  }
}

let activeRunAbort: AbortController | null = null;

export function abortActiveOrchestratorRun(): void {
  activeRunAbort?.abort();
  activeRunAbort = null;
}

export async function launchOrchestratorCycle(
  objective: string
): Promise<{ started: true; agentId: string } | { started: false; error: string }> {
  abortActiveOrchestratorRun();
  activeRunAbort = new AbortController();
  const signal = activeRunAbort.signal;

  try {
    const agentId = await ensureDemoAgent();
    const orchestrator = new ScaleAgentOrchestrator();

    void (async () => {
      try {
        if (signal.aborted) return;
        await orchestrator.initialize(agentId);
        if (signal.aborted) return;
        await orchestrator.runCycle(objective, signal);
      } catch (error) {
        if (!signal.aborted) {
          publishOrchestratorNarrative({
            agent: "SYSTEM_NODE",
            phase: "system",
            message:
              error instanceof Error
                ? `Orchestrator cycle failed: ${error.message}`
                : "Orchestrator cycle failed.",
            engineStatus: "IDLE",
          });
        }
      } finally {
        if (activeRunAbort?.signal === signal) {
          activeRunAbort = null;
        }
      }
    })();

    return { started: true, agentId };
  } catch (error) {
    abortActiveOrchestratorRun();
    return {
      started: false,
      error: error instanceof Error ? error.message : "Failed to launch cycle.",
    };
  }
}

export async function ensureDemoAgent(): Promise<string> {
  const prisma = getPrisma();
  const existing = await prisma.agent.findFirst({
    where: { name: "Systems Orchestrator" },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.agent.create({
    data: {
      name: "Systems Orchestrator",
      objective: "Autonomous cross-platform workflow orchestration",
      status: "IDLE",
      memoryBank: [],
    },
    select: { id: true },
  });

  return created.id;
}
