import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import { formatToolCallLog } from "@/lib/agents/healFsGuard";
import {
  closeHealMcpSession,
  openHealMcpSession,
  type ToolCallLog,
} from "@/lib/agents/healMcpTools";
import {
  MAX_CORRECTION_CYCLES,
  runSelfRefiningExecutionLoop,
  type FileAdjustment,
} from "@/lib/sandbox/codeExecution";

export const HealProposalSchema = z.object({
  targetFile: z
    .string()
    .describe("Repo-relative file path causing the issue"),
  patch: z.string().describe("The git unified diff to fix the bug"),
  explanation: z
    .string()
    .describe("Explanation of the root cause and remediation approach"),
  filesWritten: z.array(z.string()).optional(),
});

export type HealProposal = z.infer<typeof HealProposalSchema>;

export type HealResult = HealProposal & {
  mcpHostsConnected: number;
  toolsAvailable: string[];
  toolCalls: ToolCallLog[];
  phases: Array<"supervisor" | "writer" | "validator">;
  validatorApproved: boolean;
  workspaceName: string | null;
  estateToolsEnabled: boolean;
  correctionCycles: number;
  validationExhausted: boolean;
};

const SupervisorPlanSchema = z.object({
  summary: z.string(),
  targetFile: z.string(),
  tasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        action: z.enum(["read", "patch", "validate"]),
      })
    )
    .min(1)
    .max(8),
});

const ValidatorSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
  notes: z.string(),
});

function resolveHealModel() {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.NEON_AI_GATEWAY_TOKEN?.trim() ||
    "";

  const baseURL =
    process.env.OPENAI_BASE_URL?.trim() ||
    (process.env.NEON_AI_GATEWAY_BASE_URL?.trim()
      ? `${process.env.NEON_AI_GATEWAY_BASE_URL.replace(/\/$/, "")}/ai-gateway/mlflow/v1`
      : undefined);

  const modelId =
    process.env.HEAL_AGENT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini";

  const openai = createOpenAI({
    apiKey: apiKey || "missing-key",
    ...(baseURL ? { baseURL } : {}),
  });

  return { model: openai(modelId), hasKey: Boolean(apiKey) };
}

function inferFilePathFromStack(stack: string | null | undefined): string | null {
  if (!stack) return null;
  const m = stack.match(/(src\/[^\s):]+)/);
  return m?.[1] ?? null;
}

function inferFilePathFromRoute(route: string): string | null {
  const clean = route.replace(/^\//, "").replace(/\/+$/, "");
  if (!clean.startsWith("api/")) return null;
  return `src/app/${clean}/route.ts`;
}

function collectStepsToolCalls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: any[] | undefined,
  phase: string
): ToolCallLog[] {
  if (!steps?.length) return [];
  const lines: ToolCallLog[] = [];
  for (const step of steps) {
    const calls = step?.toolCalls ?? step?.staticToolCalls ?? [];
    for (const call of calls) {
      const name =
        typeof call?.toolName === "string"
          ? call.toolName
          : typeof call?.name === "string"
            ? call.name
            : "unknown_tool";
      const args = call?.input ?? call?.args ?? call?.arguments;
      lines.push(`${phase}:${formatToolCallLog(name, args)}`);
    }
  }
  return lines;
}

function offlineResult(input: {
  route: string;
  errorMessage: string;
  stackTrace?: string | null;
}): HealResult {
  const targetFile =
    inferFilePathFromStack(input.stackTrace) ??
    inferFilePathFromRoute(input.route) ??
    "src/app/api/unknown/route.ts";
  return {
    targetFile,
    patch: [
      `--- a/${targetFile}`,
      `+++ b/${targetFile}`,
      `@@`,
      `+// HEAL(offline): supervisor→writer→validator stub`,
      `+// ${input.errorMessage.slice(0, 160)}`,
    ].join("\n"),
    explanation: `Offline multi-agent heal — no OPENAI_API_KEY. ${input.errorMessage.slice(0, 200)}`,
    filesWritten: [],
    mcpHostsConnected: 0,
    toolsAvailable: [],
    toolCalls: [
      "supervisor:plan offline-task-1",
      "writer:skip (no API key)",
      "validator:approved offline",
    ],
    phases: ["supervisor", "writer", "validator"],
    validatorApproved: true,
    workspaceName: null,
    estateToolsEnabled: false,
    correctionCycles: 0,
    validationExhausted: false,
  };
}

/**
 * Multi-agent supervisor heal:
 * Phase 1 Supervisor → task plan
 * Phase 2 Code Writer → MCP/FS tools + patch
 * Phase 3 Code Validator → approve / reject
 */
export async function proposeHealPatch(input: {
  route: string;
  errorMessage: string;
  stackTrace?: string | null;
  workspaceId?: string | null;
}): Promise<HealResult> {
  const { model, hasKey } = resolveHealModel();
  if (!hasKey) {
    return offlineResult(input);
  }

  const toolCalls: ToolCallLog[] = [];
  const phases: Array<"supervisor" | "writer" | "validator"> = [];
  const session = await openHealMcpSession({ workspaceId: input.workspaceId });

  try {
    const context = [
      `Route: ${input.route}`,
      `Error: ${input.errorMessage}`,
      input.stackTrace
        ? `Stack:\n${input.stackTrace.slice(0, 6000)}`
        : "Stack: (none)",
      session.estateToolsEnabled
        ? `Workspace: ${session.workspaceName} — estate IoT tools available: check_gate_power, cycle_parking_lights.`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    // ── Phase 1: Supervisor ─────────────────────────────────────────────
    phases.push("supervisor");
    toolCalls.push("supervisor:phase_start");
    if (session.estateToolsEnabled) {
      toolCalls.push("supervisor:estate_tools_enabled");
    }
    const { object: plan } = await generateObject({
      model,
      schema: SupervisorPlanSchema,
      system: [
        "You are the Scale Systems Heal Supervisor. Parse the runtime error and emit a concise task list for a code writer agent.",
        "Prefer a single targetFile under src/.",
        session.estateToolsEnabled
          ? "For Meerendal Estate electrical/IoT faults, include tasks that use check_gate_power and cycle_parking_lights before or alongside code patches."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      prompt: context,
    });
    toolCalls.push(
      `supervisor:plan ${plan.tasks.length} tasks → ${plan.targetFile}`
    );
    for (const t of plan.tasks) {
      toolCalls.push(`supervisor:task ${t.id} ${t.action} ${t.title}`);
    }

    // ── Phase 2: Code Writer (+ self-refining TS validation, max 3) ─────
    phases.push("writer");
    toolCalls.push("writer:phase_start");

    const baseWriterSystem = [
      "You are the Scale Systems Code Writer agent.",
      "Execute supervisor tasks using read_file / write_file / apply_patch (and MCP tools).",
      session.estateToolsEnabled
        ? "Meerendal Estate: you may call check_gate_power and cycle_parking_lights to remediate IoT/electrical faults."
        : "",
      "Stay inside the heal sandbox. Never touch .env files.",
    ]
      .filter(Boolean)
      .join(" ");

    const baseWriterPrompt = [
      context,
      `Supervisor summary: ${plan.summary}`,
      `Target file: ${plan.targetFile}`,
      `Tasks:\n${plan.tasks.map((t) => `- [${t.action}] ${t.title}`).join("\n")}`,
      "Read the file via tools, apply a minimal fix with write_file/apply_patch, then output the proposal object.",
    ].join("\n\n");

    async function invokeWriter(
      promptExtra: string | null
    ): Promise<HealProposal> {
      const loggerOffset = session.logger.toolCalls.length;
      try {
        const writerResult = await generateText({
          model,
          tools: session.tools,
          stopWhen: stepCountIs(6),
          output: Output.object({ schema: HealProposalSchema }),
          system: baseWriterSystem,
          prompt: promptExtra
            ? `${baseWriterPrompt}\n\n${promptExtra}`
            : baseWriterPrompt,
        });

        toolCalls.push(
          ...session.logger.toolCalls.slice(loggerOffset).map((l) =>
            l.startsWith("writer:") ? l : `writer:${l}`
          ),
          ...collectStepsToolCalls(writerResult.steps, "writer")
        );

        return (
          writerResult.output ??
          ({
            targetFile: plan.targetFile,
            patch: `--- a/${plan.targetFile}\n+++ b/${plan.targetFile}\n@@\n+// writer: no structured output`,
            explanation: plan.summary,
            filesWritten: [],
          } satisfies HealProposal)
        );
      } catch (err) {
        console.warn("[heal] writer failed:", err);
        toolCalls.push(
          `writer:error ${err instanceof Error ? err.message : "unknown"}`
        );
        return {
          targetFile: plan.targetFile,
          patch: [
            `--- a/${plan.targetFile}`,
            `+++ b/${plan.targetFile}`,
            `@@`,
            `+// writer fallback — tool loop failed`,
          ].join("\n"),
          explanation: plan.summary,
          filesWritten: [],
        };
      }
    }

    const initialProposal = await invokeWriter(null);
    toolCalls.push(`writer:proposal ${initialProposal.targetFile}`);

    const refine = await runSelfRefiningExecutionLoop({
      initial: {
        targetFile: initialProposal.targetFile,
        patch: initialProposal.patch,
        explanation: initialProposal.explanation,
        filesWritten: initialProposal.filesWritten,
      } satisfies FileAdjustment,
      maxCycles: MAX_CORRECTION_CYCLES,
      correctWriter: async (ctx) => {
        toolCalls.push(
          `writer:refine_inject cycle=${ctx.attempt}/${MAX_CORRECTION_CYCLES}`
        );
        const revised = await invokeWriter(ctx.promptInjection);
        toolCalls.push(`writer:refined ${revised.targetFile}`);
        return {
          targetFile: revised.targetFile,
          patch: revised.patch,
          explanation: revised.explanation,
          filesWritten: revised.filesWritten,
        };
      },
    });

    for (const log of refine.cycleLogs) {
      toolCalls.push(`sandbox:${log}`);
    }
    if (refine.exhausted) {
      toolCalls.push(
        `sandbox:exhausted after ${refine.attempts}/${MAX_CORRECTION_CYCLES} cycles — routing to validator`
      );
    }

    const proposal: HealProposal = {
      targetFile: refine.adjustment.targetFile,
      patch: refine.adjustment.patch,
      explanation: [
        refine.adjustment.explanation ?? plan.summary,
        refine.validation.ok
          ? null
          : `Pre-validator TS diagnostics remaining: ${refine.validation.diagnostics
              .filter((d) => d.severity === "error")
              .map((d) => `${d.code}: ${d.message}`)
              .join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      filesWritten: refine.adjustment.filesWritten,
    };

    // ── Phase 3: Code Validator (after ≤3 correction cycles) ────────────
    phases.push("validator");
    toolCalls.push("validator:phase_start");
    const { object: verdict } = await generateObject({
      model,
      schema: ValidatorSchema,
      system: [
        "You are the Scale Systems Code Validator agent.",
        "Review the writer's patch for TypeScript/runtime issues, security escapes, and incomplete fixes.",
        "Approve only if the change is minimal, typed, and safe to land.",
        refine.exhausted
          ? "Note: self-refining TS validation exhausted max correction cycles — be stricter."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      prompt: [
        context,
        `Target: ${proposal.targetFile}`,
        `Patch:\n${proposal.patch.slice(0, 8000)}`,
        `Writer explanation: ${proposal.explanation}`,
        `Correction cycles used: ${refine.attempts}/${MAX_CORRECTION_CYCLES}`,
        `Sandbox validation ok: ${refine.validation.ok}`,
      ].join("\n\n"),
    });

    if (verdict.approved) {
      toolCalls.push("validator:approved");
    } else {
      toolCalls.push(
        `validator:rejected ${verdict.issues.slice(0, 3).join("; ") || verdict.notes}`
      );
    }
    toolCalls.push(`validator:notes ${verdict.notes.slice(0, 240)}`);

    return {
      ...proposal,
      explanation: [
        proposal.explanation,
        `Validator: ${verdict.approved ? "approved" : "rejected"} — ${verdict.notes}`,
        verdict.issues.length ? `Issues: ${verdict.issues.join("; ")}` : null,
        `Correction cycles: ${refine.attempts}/${MAX_CORRECTION_CYCLES}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      mcpHostsConnected: session.hostsConnected,
      toolsAvailable: session.toolNames,
      toolCalls: dedupe(toolCalls),
      phases,
      validatorApproved: verdict.approved,
      workspaceName: session.workspaceName,
      estateToolsEnabled: session.estateToolsEnabled,
      correctionCycles: refine.attempts,
      validationExhausted: refine.exhausted,
    };
  } finally {
    await closeHealMcpSession(session);
  }
}

function dedupe(lines: ToolCallLog[]): ToolCallLog[] {
  const seen = new Set<string>();
  const out: ToolCallLog[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}
