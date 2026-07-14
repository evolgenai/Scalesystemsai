import {
  createStreamEvent,
  encodeSseData,
  type AgentStreamEvent,
} from "@/lib/agents/streamProtocol";
import {
  buildGeminiOrchestratorPlan,
  executePlanStepTool,
  narrateStepWithGemini,
  type GeminiPlanStep,
  type GeminiOrchestratorPlan,
  type ToolExecutionResult,
} from "@/lib/agents/geminiOrchestrator";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { evaluateStreamAccess } from "@/lib/auth/subscriptionGating";
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

type Push = (
  event: AgentStreamEvent
) => void;

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

  if (toolResult.digestForGemini) {
    push(
      createStreamEvent({
        type: "result",
        message: toolResult.digestForGemini,
        resultMarkdown: toolResult.digestForGemini,
        agentId: step.agentId,
        agentName: step.agentName,
        status: toolResult.success ? "SUCCESS" : "ERROR",
        progress: Math.max(progress, 18),
        stage: `${step.stage}:result`,
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
  isClosed: () => boolean
): Promise<void> {
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
    signal
  );
  if (isClosed() || !toolResult) return;
  emitToolOutcome(push, step, toolResult, progress);
}

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  const { searchParams } = new URL(request.url);
  const forceExceeded =
    searchParams.get("quotaExceeded") === "1" ||
    searchParams.get("simulateQuotaExceeded") === "1";

  const gate = evaluateStreamAccess(profile, {
    consume: true,
    forceExceeded,
  });

  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "Payment Required",
        code: gate.code,
        message: gate.message,
        plan: gate.plan,
        used: gate.used,
        limit: gate.limit,
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

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Return Response immediately; drive the async Gemini + tool loop in a background IIFE
      // so Vercel does not buffer the entire payload before flushing.
      void (async () => {
        try {
          pushEvent(
            controller,
            encoder,
            isClosed,
            createStreamEvent({
              type: "command",
              message: "$ export SCALE_SWARM_SESSION=$(uuidgen)",
              command: "export SCALE_SWARM_SESSION=$(uuidgen)",
              agentId: "system",
              agentName: "SYSTEM_NODE",
              status: "IDLE",
              progress: 0,
              stage: "connect",
              prismaStatus: "IDLE",
            })
          );

          pushEvent(
            controller,
            encoder,
            isClosed,
            createStreamEvent({
              type: "log",
              message:
                "SSE channel open — Systems Orchestrator online (Gemini + sandbox tools).",
              agentId: "system",
              agentName: "SYSTEM_NODE",
              status: "IDLE",
              progress: 1,
              stage: "connect",
              prismaStatus: "IDLE",
            })
          );

          const greeting = /^(hi|hello|hey|yo)\b[\s!?.]*$/i.test(objective);
          if (greeting) {
            pushEvent(
              controller,
              encoder,
              isClosed,
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
            pushEvent(
              controller,
              encoder,
              isClosed,
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
            pushEvent(
              controller,
              encoder,
              isClosed,
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
            return;
          }

          do {
            if (isClosed()) break;

            pushEvent(
              controller,
              encoder,
              isClosed,
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

            pushEvent(
              controller,
              encoder,
              isClosed,
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
              request.signal
            );
            if (isClosed()) break;

            pushEvent(
              controller,
              encoder,
              isClosed,
              createStreamEvent({
                type: "log",
                message: `Plan ready via ${plan.engine.toUpperCase()} — ${plan.summary}`,
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                progress: 12,
                stage: "plan",
                prismaStatus: "PLANNING",
              })
            );

            pushEvent(
              controller,
              encoder,
              isClosed,
              createStreamEvent({
                type: "summary",
                message: plan.summary,
                resultMarkdown: `## Swarm Plan\n\n${plan.summary}\n\n_Engine: ${plan.engine}_`,
                agentId: "ops-orchestrator",
                agentName: "Systems Orchestrator",
                status: "THINKING",
                progress: 12,
                stage: "plan",
                prismaStatus: "PLANNING",
              })
            );

            if (plan.routedWorkers?.length) {
              pushEvent(
                controller,
                encoder,
                isClosed,
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
              pushEvent(
                controller,
                encoder,
                isClosed,
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

            const push: Push = (event) =>
              pushEvent(controller, encoder, isClosed, event);

            const total = Math.max(plan.steps.length, 1);
            let index = 0;

            while (index < plan.steps.length) {
              if (isClosed()) break;

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
                  batch.map((batched) =>
                    runToolStep(
                      push,
                      batched,
                      plan,
                      objective,
                      Math.max(progress, 18),
                      request.signal,
                      isClosed
                    )
                  )
                );
                continue;
              }

              await sleep(step.delayMs, request.signal);
              if (isClosed()) break;

              push(
                createStreamEvent({
                  type:
                    step.stage === "complete"
                      ? "workflow_complete"
                      : "agent_update",
                  message: step.message,
                  agentId: step.agentId,
                  agentName: step.agentName,
                  status: step.status,
                  progress:
                    step.stage === "complete" ? 100 : Math.max(progress, 8),
                  stage: step.stage,
                  prismaStatus: step.prismaStatus,
                })
              );

              if (step.tool) {
                await runToolStep(
                  push,
                  step,
                  plan,
                  objective,
                  progress,
                  request.signal,
                  isClosed
                );
              } else {
                const narration = await narrateStepWithGemini(
                  objective,
                  step.message,
                  request.signal
                );
                if (isClosed()) break;

                if (narration) {
                  push(
                    createStreamEvent({
                      type: "log",
                      message: narration,
                      agentId: step.agentId,
                      agentName: step.agentName,
                      status: step.status,
                      progress: Math.max(progress, 8),
                      stage: step.stage,
                      prismaStatus: step.prismaStatus,
                    })
                  );
                  push(
                    createStreamEvent({
                      type: "result",
                      message: narration,
                      resultMarkdown: narration,
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

            pushEvent(
              controller,
              encoder,
              isClosed,
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

            if (loop) {
              await sleep(2200, request.signal);
            }
          } while (loop && !isClosed());
        } catch (error) {
          if (isAbortError(error)) return;

          pushEvent(
            controller,
            encoder,
            isClosed,
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
        } finally {
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
