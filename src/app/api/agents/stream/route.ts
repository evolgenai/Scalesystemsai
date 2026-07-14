import {
  createStreamEvent,
  encodeSseData,
  type AgentStreamEvent,
} from "@/lib/agents/streamProtocol";
import {
  buildGeminiOrchestratorPlan,
  executePlanStepTool,
  narrateStepWithGemini,
  synthesizeObjectiveAnswer,
  type GeminiPlanStep,
  type GeminiOrchestratorPlan,
  type ToolExecutionResult,
} from "@/lib/agents/geminiOrchestrator";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { evaluateStreamAccess } from "@/lib/auth/subscriptionGating";
import { persistSwarmSession } from "@/lib/agents/persistSwarmSession";
import {
  getPersonaDisplayName,
  getSystemInstructionForPersona,
} from "@/lib/agents/presets";
import {
  consumeConsensusVote,
  consumeInterventionDirective,
  formatInterventionOverride,
  getSwarmSessionLoopState,
  markPendingConsensus,
  resolveLiveSwarmSessionId,
} from "@/lib/agents/swarmSessionControl";
import {
  runDebateTurns,
  synthesizeWinningConsensus,
  type DebateRole,
  type DebateTurn,
} from "@/lib/agents/debateEngine";
import {
  formatRecalledContext,
  recallMemories,
  storeMemory,
  summarizeRunTakeaway,
} from "@/lib/agents/memoryBank";
import { resolveBillingProfileForRequest } from "@/lib/org/orgScope";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Content-Encoding": "none",
} as const;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function pushEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  closed: () => boolean,
  event: AgentStreamEvent
): void {
  if (closed()) return;
  try {
    controller.enqueue(encoder.encode(encodeSseData(event)));
  } catch {
    // Client disconnected mid-write.
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Poll SwarmSession for PAUSED → ACTIVE. Yields SSE paused/heartbeat/resumed
 * frames and returns any freshly consumed intervention override.
 */
async function awaitHitlGate(input: {
  sessionId: string | null;
  push: (event: AgentStreamEvent) => void;
  signal: AbortSignal;
  isClosed: () => boolean;
  pollMs?: number;
}): Promise<{ override: string | null; hitlTouched: boolean }> {
  const { sessionId, push, signal, isClosed } = input;
  if (!sessionId) return { override: null, hitlTouched: false };

  const pollMs = input.pollMs ?? 900;
  let announcedPause = false;

  while (!isClosed() && !signal.aborted) {
    const state = await getSwarmSessionLoopState(sessionId);
    if (!state) return { override: null, hitlTouched: announcedPause };

    // Debate consensus wait is handled by awaitConsensusGate — do not proceed here.
    if (state.status === "PENDING_CONSENSUS") {
      try {
        await sleep(pollMs, signal);
      } catch {
        return { override: null, hitlTouched: announcedPause };
      }
      continue;
    }

    if (state.status !== "PAUSED") {
      if (announcedPause) {
        push(
          createStreamEvent({
            type: "resumed",
            message: "[SYSTEM] HITL resume — swarm loop re-armed.",
            agentId: "ops-orchestrator",
            agentName: "Systems Orchestrator",
            status: "EXECUTING",
            stage: "hitl-resume",
            prismaStatus: "ACTIVE",
            sessionId,
          })
        );
      }

      const directive = await consumeInterventionDirective(sessionId);
      return {
        override: directive ? formatInterventionOverride(directive) : null,
        hitlTouched: announcedPause || Boolean(directive),
      };
    }

    if (!announcedPause) {
      announcedPause = true;
      push(
        createStreamEvent({
          type: "paused",
          message:
            "[SYSTEM] HITL pause — awaiting operator intervention directive.",
          agentId: "ops-orchestrator",
          agentName: "Systems Orchestrator",
          status: "IDLE",
          stage: "hitl-pause",
          prismaStatus: "PAUSED",
          sessionId,
        })
      );
    } else {
      push(
        createStreamEvent({
          type: "heartbeat",
          message: "[SYSTEM] HITL idle ping — still PAUSED.",
          agentId: "system",
          agentName: "SYSTEM_NODE",
          status: "IDLE",
          stage: "hitl-wait",
          prismaStatus: "PAUSED",
          sessionId,
        })
      );
    }

    try {
      await sleep(pollMs, signal);
    } catch {
      return { override: null, hitlTouched: announcedPause };
    }
  }

  return { override: null, hitlTouched: announcedPause };
}

/**
 * After Creator/Critic turns: park on PENDING_CONSENSUS until a human vote.
 */
async function awaitConsensusGate(input: {
  sessionId: string | null;
  push: (event: AgentStreamEvent) => void;
  signal: AbortSignal;
  isClosed: () => boolean;
  pollMs?: number;
}): Promise<DebateRole | null> {
  const { sessionId, push, signal, isClosed } = input;
  if (!sessionId) return null;

  const pollMs = input.pollMs ?? 900;
  await markPendingConsensus(sessionId);

  push(
    createStreamEvent({
      type: "consensus_pending",
      message:
        "[SYSTEM] Debate complete — awaiting human consensus vote (creator | critic).",
      agentId: "ops-orchestrator",
      agentName: "Systems Orchestrator",
      status: "IDLE",
      stage: "consensus",
      prismaStatus: "PAUSED",
      sessionId,
    })
  );

  while (!isClosed() && !signal.aborted) {
    const vote = await consumeConsensusVote(sessionId);
    if (vote) {
      push(
        createStreamEvent({
          type: "log",
          message: `[SYSTEM] Consensus vote accepted — winning path: ${vote}.`,
          agentId: "ops-orchestrator",
          agentName: "Systems Orchestrator",
          status: "EXECUTING",
          stage: "consensus-resume",
          prismaStatus: "ACTIVE",
          sessionId,
        })
      );
      return vote;
    }

    push(
      createStreamEvent({
        type: "heartbeat",
        message: "[SYSTEM] Consensus idle ping — PENDING_CONSENSUS.",
        agentId: "system",
        agentName: "SYSTEM_NODE",
        status: "IDLE",
        stage: "consensus-wait",
        prismaStatus: "PAUSED",
        sessionId,
      })
    );

    try {
      await sleep(pollMs, signal);
    } catch {
      return null;
    }
  }

  return null;
}

type Push = (event: AgentStreamEvent) => void;

function emitToolOutcome(
  push: Push,
  step: GeminiPlanStep,
  toolResult: ToolExecutionResult,
  progress: number
): void {
  for (const line of toolResult.logLines) {
    push(
      createStreamEvent({
        type: toolResult.blocked
          ? "error"
          : toolResult.success
            ? "log"
            : "error",
        message: line,
        agentId: step.agentId,
        agentName: step.agentName,
        status: toolResult.blocked
          ? "ERROR"
          : toolResult.success
            ? "EXECUTING"
            : "ERROR",
        progress: Math.max(progress, 12),
        stage: `${step.stage}:tool-output`,
        prismaStatus: toolResult.success ? "EXECUTING" : "ERROR",
      })
    );
  }

  // Tool digests stay in the Verbose Kernel Feed. User-facing answers are
  // emitted once at the end via synthesizeObjectiveAnswer → type:"result".
  const geminiDigest = toolResult.logLines
    .find((line) => line.startsWith("[SYSTEM:tool-digest]"))
    ?.replace(/^\[SYSTEM:tool-digest\]\s*/, "")
    .trim();

  if (geminiDigest) {
    push(
      createStreamEvent({
        type: "log",
        message: `[SYSTEM] Tool digest ready (${step.tool}) — deferred to final results synthesis.`,
        agentId: step.agentId,
        agentName: step.agentName,
        status: toolResult.success ? "SUCCESS" : "ERROR",
        progress: Math.max(progress, 18),
        stage: `${step.stage}:digest`,
        prismaStatus: toolResult.success ? "ACTIVE" : "ERROR",
      })
    );
  }

  push(
    createStreamEvent({
      type: "agent_update",
      message: toolResult.blocked
        ? "Sandbox blocked unsafe payload — worker aborted safely."
        : toolResult.success
          ? `Tool [${toolResult.tool}] completed — results streamed to terminal.`
          : `Tool [${toolResult.tool}] finished with errors.`,
      agentId: step.agentId,
      agentName: step.agentName,
      status: toolResult.blocked
        ? "ERROR"
        : toolResult.success
          ? "SUCCESS"
          : "ERROR",
      progress: Math.max(progress, 20),
      stage: `${step.stage}:tool-done`,
      prismaStatus: toolResult.success ? "ACTIVE" : "ERROR",
    })
  );
}

async function runToolStep(
  push: Push,
  step: GeminiPlanStep,
  plan: GeminiOrchestratorPlan,
  objective: string,
  progress: number,
  signal: AbortSignal,
  isClosed: () => boolean,
  systemInstruction?: string
): Promise<string | null> {
  const command =
    step.tool === "webScraper"
      ? `curl -sSL ${plan.detectedUrl ?? "https://scalesystemsai.vercel.app"} | scalesystems-sanitize`
      : `node --eval "runSandbox({ agent: '${step.agentId}' })"`;

  push(
    createStreamEvent({
      type: "command",
      message: `$ ${command}`,
      command,
      agentId: step.agentId,
      agentName: step.agentName,
      status: "EXECUTING",
      progress: Math.max(progress, 10),
      stage: `${step.stage}:tool`,
      prismaStatus: "EXECUTING",
    })
  );

  push(
    createStreamEvent({
      type: "log",
      message: `Invoking sandbox tool [${step.tool}]…`,
      agentId: step.agentId,
      agentName: step.agentName,
      status: "EXECUTING",
      progress: Math.max(progress, 10),
      stage: `${step.stage}:tool`,
      prismaStatus: "EXECUTING",
    })
  );

  const toolResult = await executePlanStepTool(
    step,
    plan,
    objective,
    signal,
    systemInstruction
  );
  if (isClosed() || !toolResult) return null;
  emitToolOutcome(push, step, toolResult, progress);

  const geminiDigest = toolResult.logLines
    .find((line) => line.startsWith("[SYSTEM:tool-digest]"))
    ?.replace(/^\[SYSTEM:tool-digest\]\s*/, "")
    .trim();
  return geminiDigest || toolResult.digestForGemini || null;
}

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  const billingResolution = await resolveBillingProfileForRequest(
    request,
    profile
  );

  if (!billingResolution.ok) {
    return NextResponse.json(
      {
        error: "Forbidden",
        code: billingResolution.code,
        message: billingResolution.message,
        orgId: billingResolution.orgId,
      },
      { status: 403 }
    );
  }

  const { billing, orgId, billingMode } = billingResolution;
  const { searchParams } = new URL(request.url);
  const forceExceeded =
    searchParams.get("quotaExceeded") === "1" ||
    searchParams.get("simulateQuotaExceeded") === "1";

  // Consume credits from OWNER pool when billingMode === "org_owner".
  const gate = evaluateStreamAccess(billing, {
    consume: true,
    forceExceeded,
  });

  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "Payment Required",
        code: gate.code,
        message:
          billingMode === "org_owner"
            ? `${gate.message} (team credit pool — organization owner plan).`
            : gate.message,
        plan: gate.plan,
        used: gate.used,
        limit: gate.limit,
        orgId,
        billingMode,
        upgrade: {
          stripe: "/api/checkout/stripe",
          bvnk: "/api/checkout/bvnk",
        },
      },
      { status: 402 }
    );
  }

  const encoder = new TextEncoder();
  let closed = false;
  const isClosed = () => closed || request.signal.aborted;

  const objective =
    searchParams.get("objective")?.trim() ||
    "Qualify inbound B2B leads, sync CRM vectors, and consolidate schema output.";
  const loop = searchParams.get("loop") === "1";

  // Persona payload — query string (SSE GET) with safe length caps.
  const personaId =
    searchParams.get("personaId")?.trim() ||
    searchParams.get("persona")?.trim() ||
    undefined;
  const customSystemPromptRaw =
    searchParams.get("customSystemPrompt") ??
    searchParams.get("customPrompt") ??
    searchParams.get("systemInstruction");
  const customSystemPrompt = customSystemPromptRaw?.trim()
    ? customSystemPromptRaw.trim().slice(0, 8000)
    : undefined;
  const systemInstruction = getSystemInstructionForPersona(
    personaId,
    customSystemPrompt
  );
  const personaName = getPersonaDisplayName(personaId, customSystemPrompt);

  const clientSessionId = searchParams.get("sessionId")?.trim() || null;
  const liveSessionId = profile.id
    ? await resolveLiveSwarmSessionId({
        userId: profile.id,
        orgId,
        objective,
        sessionId: clientSessionId,
      })
    : null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Return Response immediately; drive the async Gemini + tool loop in a background IIFE
      // so Vercel does not buffer the entire payload before flushing.
      void (async () => {
        const recordedEvents: AgentStreamEvent[] = [];
        let sessionStatus: "COMPLETED" | "FAILED" | "TIMEOUT" = "COMPLETED";
        let persisted = false;
        let activeSystemInstruction = systemInstruction;
        let lastFinalAnswer = "";
        let hitlUsed = false;
        const runStartedAt = Date.now();

        const emit = (event: AgentStreamEvent) => {
          recordedEvents.push(event);
          pushEvent(controller, encoder, isClosed, event);
        };

        const flushSession = async () => {
          if (persisted || !profile.id || recordedEvents.length === 0) return;
          persisted = true;
          await persistSwarmSession({
            userId: profile.id,
            orgId,
            sessionId: liveSessionId,
            objective,
            events: recordedEvents,
            status: sessionStatus,
            durationMs: Date.now() - runStartedAt,
            creditsUsed: 1,
            persona: personaName,
            hitlUsed,
          });

          if (
            sessionStatus === "COMPLETED" &&
            lastFinalAnswer.trim() &&
            profile.id
          ) {
            try {
              const takeaway = await summarizeRunTakeaway(
                objective,
                lastFinalAnswer,
                request.signal
              );
              await storeMemory(profile.id, orgId, takeaway);
            } catch (error) {
              console.error("[memory-bank] auto-store failed", error);
            }
          }
        };

        const applyHitlGate = async (): Promise<boolean> => {
          const gate = await awaitHitlGate({
            sessionId: liveSessionId,
            push: emit,
            signal: request.signal,
            isClosed,
          });
          if (isClosed()) return false;
          if (gate.hitlTouched) hitlUsed = true;
          if (gate.override) {
            hitlUsed = true;
            activeSystemInstruction = `${activeSystemInstruction}\n\n${gate.override}`;
            emit(
              createStreamEvent({
                type: "log",
                message: `[SYSTEM] ${gate.override}`,
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                stage: "hitl-directive",
                prismaStatus: "PLANNING",
                sessionId: liveSessionId ?? undefined,
              })
            );
          }
          return true;
        };

        try {
          emit(
            createStreamEvent({
              type: "command",
              message: liveSessionId
                ? `$ export SCALE_SWARM_SESSION=${liveSessionId}`
                : "$ export SCALE_SWARM_SESSION=$(uuidgen)",
              command: liveSessionId
                ? `export SCALE_SWARM_SESSION=${liveSessionId}`
                : "export SCALE_SWARM_SESSION=$(uuidgen)",
              agentId: "system",
              agentName: "SYSTEM_NODE",
              status: "IDLE",
              progress: 0,
              stage: "connect",
              prismaStatus: "IDLE",
              sessionId: liveSessionId ?? undefined,
            })
          );

          emit(
            createStreamEvent({
              type: "log",
              message: liveSessionId
                ? `SSE channel open — live SwarmSession ${liveSessionId} (HITL enabled).`
                : "SSE channel open — Systems Orchestrator online (Gemini + sandbox tools).",
              agentId: "system",
              agentName: "SYSTEM_NODE",
              status: "IDLE",
              progress: 1,
              stage: "connect",
              prismaStatus: "IDLE",
              sessionId: liveSessionId ?? undefined,
            })
          );

          if (profile.id) {
            const recalled = await recallMemories(profile.id, orgId, objective, 3);
            emit(
              createStreamEvent({
                type: "memory_recalled",
                message:
                  recalled.length > 0
                    ? `[SYSTEM] Recalled ${recalled.length} workspace memory fragment(s).`
                    : "[SYSTEM] No prior workspace memories matched this objective.",
                memories: recalled.map((m) => ({
                  id: m.id,
                  text: m.fragment,
                  score: m.score,
                })),
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                progress: 2,
                stage: "memory",
                prismaStatus: "PLANNING",
                sessionId: liveSessionId ?? undefined,
              })
            );

            const memoryBlock = formatRecalledContext(recalled);
            if (memoryBlock) {
              activeSystemInstruction = `${systemInstruction}\n\n${memoryBlock}`;
            }
          }

          emit(
            createStreamEvent({
              type: "log",
              message: `⚙️ [SYSTEM ARCHITECT]: Spawning specialized ${personaName} sub-agents…`,
              agentId: "ops-orchestrator",
              agentName: "Systems Orchestrator",
              status: "THINKING",
              progress: 2,
              stage: "persona",
              prismaStatus: "PLANNING",
            })
          );

          const greeting = /^(hi|hello|hey|yo)\b[\s!?.]*$/i.test(objective);
          if (greeting) {
            emit(
              createStreamEvent({
                type: "command",
                message: '$ echo "operator_greeting"',
                command: 'echo "operator_greeting"',
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                progress: 25,
                stage: "greeting",
                prismaStatus: "PLANNING",
              })
            );
            emit(
              createStreamEvent({
                type: "result",
                message:
                  "Systems Orchestrator: Hello Operator. Ready to coordinate our next sequence. State your objective.",
                resultMarkdown:
                  "Systems Orchestrator: Hello Operator. Ready to coordinate our next sequence. State your objective.",
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "SUCCESS",
                progress: 100,
                stage: "greeting",
                prismaStatus: "IDLE",
              })
            );
            emit(
              createStreamEvent({
                type: "workflow_complete",
                message: "Completed successfully",
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "SUCCESS",
                progress: 100,
                stage: "complete",
                prismaStatus: "IDLE",
              })
            );
            sessionStatus = "COMPLETED";
            await flushSession();
            return;
          }

          do {
            if (isClosed()) {
              sessionStatus = "TIMEOUT";
              break;
            }

            if (!(await applyHitlGate())) {
              sessionStatus = "TIMEOUT";
              break;
            }

            emit(
              createStreamEvent({
                type: "command",
                message: `$ cat <<'OBJ'\n${objective.slice(0, 240)}\nOBJ`,
                command: `printf '%s' ${JSON.stringify(objective.slice(0, 120))}`,
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                progress: 4,
                stage: "capture",
                prismaStatus: "PLANNING",
              })
            );

            emit(
              createStreamEvent({
                type: "agent_update",
                message: "Systems Orchestrator capturing operator prompt…",
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                progress: 4,
                stage: "capture",
                prismaStatus: "PLANNING",
              })
            );

            const plan = await buildGeminiOrchestratorPlan(
              objective,
              request.signal,
              activeSystemInstruction
            );
            if (isClosed()) {
              sessionStatus = "TIMEOUT";
              break;
            }

            emit(
              createStreamEvent({
                type: "log",
                message: `[SYSTEM] Plan ready via ${plan.engine.toUpperCase()} — ${plan.summary}`,
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                progress: 12,
                stage: "plan",
                prismaStatus: "PLANNING",
              })
            );

            if (plan.routedWorkers?.length) {
              emit(
                createStreamEvent({
                  type: "log",
                  message: `Router → Worker dispatch: [${plan.routedWorkers.join(", ")}]${
                    plan.parallelTools ? " · parallel tool channels armed" : ""
                  }`,
                  agentId: "ops-orchestrator",
                  agentName: "Systems Orchestrator",
                  status: "THINKING",
                  progress: 13,
                  stage: "route",
                  prismaStatus: "PLANNING",
                })
              );
            }

            if (plan.detectedUrl) {
              emit(
                createStreamEvent({
                  type: "log",
                  message: `Detected scrape target: ${plan.detectedUrl}`,
                  agentId: "ops-orchestrator",
                  agentName: "Systems Orchestrator",
                  status: "THINKING",
                  progress: 14,
                  stage: "plan",
                  prismaStatus: "PLANNING",
                })
              );
            }

            const push: Push = emit;
            const toolDigests: string[] = [];

            const total = Math.max(plan.steps.length, 1);
            let index = 0;

            while (index < plan.steps.length) {
              if (isClosed()) {
                sessionStatus = "TIMEOUT";
                break;
              }

              if (!(await applyHitlGate())) {
                sessionStatus = "TIMEOUT";
                break;
              }

              const step = plan.steps[index]!;
              const progress = Math.min(
                99,
                Math.round(((index + 1) / total) * 100)
              );

              // Batch consecutive independent tool steps for parallel channels.
              if (
                plan.parallelTools &&
                step.tool &&
                Boolean(plan.steps[index + 1]?.tool)
              ) {
                const batch: GeminiPlanStep[] = [];
                while (
                  index < plan.steps.length &&
                  plan.steps[index]?.tool
                ) {
                  batch.push(plan.steps[index]!);
                  index += 1;
                }

                push(
                  createStreamEvent({
                    type: "log",
                    message: `Opening ${batch.length} parallel execution channels…`,
                    agentId: "ops-orchestrator",
                    agentName: "Systems Orchestrator",
                    status: "EXECUTING",
                    progress: Math.max(progress, 15),
                    stage: "parallel",
                    prismaStatus: "EXECUTING",
                  })
                );

                for (const batched of batch) {
                  push(
                    createStreamEvent({
                      type: "agent_update",
                      message: batched.message,
                      agentId: batched.agentId,
                      agentName: batched.agentName,
                      status: "EXECUTING",
                      progress: Math.max(progress, 16),
                      stage: batched.stage,
                      prismaStatus: "EXECUTING",
                    })
                  );
                }

                await Promise.all(
                  batch.map(async (batched) => {
                    const digest = await runToolStep(
                      push,
                      batched,
                      plan,
                      objective,
                      Math.max(progress, 18),
                      request.signal,
                      isClosed,
                      activeSystemInstruction
                    );
                    if (digest) toolDigests.push(digest);
                  })
                );
                continue;
              }

              await sleep(step.delayMs, request.signal);
              if (isClosed()) {
                sessionStatus = "TIMEOUT";
                break;
              }

              push(
                createStreamEvent({
                  type: "agent_update",
                  message: step.message,
                  agentId: step.agentId,
                  agentName: step.agentName,
                  status: step.status,
                  progress:
                    step.stage === "complete" ? 92 : Math.max(progress, 8),
                  stage: step.stage,
                  prismaStatus: step.prismaStatus,
                })
              );

              if (step.tool) {
                const digest = await runToolStep(
                  push,
                  step,
                  plan,
                  objective,
                  progress,
                  request.signal,
                  isClosed,
                  activeSystemInstruction
                );
                if (digest) toolDigests.push(digest);
              } else {
                const narration = await narrateStepWithGemini(
                  objective,
                  step.message,
                  request.signal,
                  activeSystemInstruction
                );
                if (isClosed()) {
                  sessionStatus = "TIMEOUT";
                  break;
                }

                // Kernel Feed only — never mirrored into Actual Results Pane.
                if (narration) {
                  push(
                    createStreamEvent({
                      type: "log",
                      message: `[SYSTEM] ${narration}`,
                      agentId: step.agentId,
                      agentName: step.agentName,
                      status: step.status,
                      progress: Math.max(progress, 8),
                      stage: step.stage,
                      prismaStatus: step.prismaStatus,
                    })
                  );
                }
              }

              index += 1;
            }

            if (isClosed()) break;

            emit(
              createStreamEvent({
                type: "log",
                message:
                  "[SYSTEM] Opening Creator vs Critic debate panel before final synthesis…",
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                stage: "debate",
                prismaStatus: "PLANNING",
                sessionId: liveSessionId ?? undefined,
              })
            );

            let debateTurns: DebateTurn[] = [];
            try {
              debateTurns = await runDebateTurns(
                objective,
                request.signal,
                activeSystemInstruction
              );
            } catch (error) {
              emit(
                createStreamEvent({
                  type: "log",
                  message: `[SYSTEM] Debate panel failed — ${
                    error instanceof Error ? error.message : "unknown error"
                  }`,
                  agentId: "ops-orchestrator",
                  agentName: "Systems Orchestrator",
                  status: "ERROR",
                  stage: "debate",
                  prismaStatus: "ERROR",
                  sessionId: liveSessionId ?? undefined,
                })
              );
            }

            for (const turn of debateTurns) {
              if (isClosed()) break;
              emit(
                createStreamEvent({
                  type: "debate_turn",
                  role: turn.role,
                  text: turn.text,
                  message: turn.text,
                  agentId: `debate-${turn.role}`,
                  agentName:
                    turn.role === "creator"
                      ? "Debate Creator"
                      : "Debate Critic",
                  status: "THINKING",
                  stage: `debate-${turn.role}`,
                  prismaStatus: "REFLECTING",
                  sessionId: liveSessionId ?? undefined,
                })
              );
            }

            if (isClosed()) {
              sessionStatus = "TIMEOUT";
              break;
            }

            let winningVote: DebateRole | null = null;
            if (liveSessionId && debateTurns.length >= 2) {
              winningVote = await awaitConsensusGate({
                sessionId: liveSessionId,
                push: emit,
                signal: request.signal,
                isClosed,
              });
              if (winningVote) hitlUsed = true;
            } else if (debateTurns.length >= 1) {
              winningVote = "creator";
            }

            if (isClosed()) {
              sessionStatus = "TIMEOUT";
              break;
            }

            let finalAnswer: string;
            if (winningVote && debateTurns.length > 0) {
              finalAnswer = await synthesizeWinningConsensus({
                objective,
                vote: winningVote,
                turns: debateTurns,
                signal: request.signal,
                personaInstruction: activeSystemInstruction,
              });
            } else {
              finalAnswer = await synthesizeObjectiveAnswer(
                objective,
                request.signal,
                { systemInstruction: activeSystemInstruction, toolDigests }
              );
            }
            if (isClosed()) {
              sessionStatus = "TIMEOUT";
              break;
            }

            lastFinalAnswer = finalAnswer;

            emit(
              createStreamEvent({
                type: "result",
                message: finalAnswer,
                resultMarkdown: finalAnswer,
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "SUCCESS",
                progress: 96,
                stage: "answer",
                prismaStatus: "ACTIVE",
              })
            );

            emit(
              createStreamEvent({
                type: "workflow_complete",
                message: "Completed successfully",
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "SUCCESS",
                progress: 100,
                stage: "complete",
                prismaStatus: "IDLE",
              })
            );

            sessionStatus = "COMPLETED";
            await flushSession();
            persisted = false;
            recordedEvents.length = 0;

            if (loop) {
              await sleep(2200, request.signal);
            }
          } while (loop && !isClosed());
        } catch (error) {
          if (isAbortError(error)) {
            sessionStatus = "TIMEOUT";
            await flushSession();
            return;
          }

          sessionStatus = "FAILED";
          emit(
            createStreamEvent({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Gemini orchestrator stream failed.",
              status: "ERROR",
              prismaStatus: "ERROR",
            })
          );
          await flushSession();
        } finally {
          if (!persisted && recordedEvents.length > 0 && profile.id) {
            await flushSession();
          }
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          }
        }
      })();

      const onAbort = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Stream may already be closed by cancel().
        }
      };

      request.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
