/**
 * POST /api/terminal/python
 * Virtual Terminal Python runner — sandboxed exec + ScaleAgent alias parsing + gas.
 *
 * Auth: x-workspace-key (required)
 * Body: { code: string, agentId?: string, enforceSkills?: boolean }
 */

import { z } from "zod";
import { executeCodeInSandbox } from "@/lib/agents/codeSandbox";
import {
  deductGasUnits,
  InsufficientGasError,
} from "@/lib/billing/gasMeter";
import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  extractSkillEventsFromStdout,
  injectScaleAgentPythonStub,
  parseScaleAgentScript,
  planSkillInvocations,
} from "@/lib/skills/scaleAgentSdk";
import { calculateTerminalGas } from "@/lib/skills/skillRegistry";
import { getEquippedSkillIds } from "@/lib/skills/skillInstall";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  code: z.string().min(1).max(12_000),
  agentId: z.string().trim().min(1).max(128).optional(),
  /** When true and agentId is set, only installed skills may be learned. */
  enforceSkills: z.boolean().optional(),
  workspaceId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsedBody = BodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return apiError(
      parsedBody.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    parsedBody.data.workspaceId ?? null
  );
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const code = parsedBody.data.code;
  const agentParsed = parseScaleAgentScript(code);
  const { plans, unknownSkills } = planSkillInvocations(agentParsed);

  if (unknownSkills.length > 0) {
    return apiError(
      `Unknown skill(s): ${unknownSkills.join(", ")}`,
      "UNKNOWN_SKILL",
      400
    );
  }

  let equippedSkills: string[] = [];
  if (parsedBody.data.agentId) {
    try {
      equippedSkills = await getEquippedSkillIds(
        gate.workspaceId,
        parsedBody.data.agentId
      );
    } catch (err) {
      console.error("[terminal/python] equipped skills lookup failed", err);
      return apiError(
        "Failed to resolve agent skills.",
        "SKILL_LOOKUP_FAILED",
        503
      );
    }
  }

  const enforceSkills =
    parsedBody.data.enforceSkills === true &&
    Boolean(parsedBody.data.agentId) &&
    equippedSkills.length > 0;

  if (enforceSkills) {
    const missing = agentParsed.skillsLearned.filter(
      (id) => !equippedSkills.includes(id)
    );
    if (missing.length > 0) {
      return apiError(
        `Skill(s) not installed on agent: ${missing.join(", ")}. POST /api/skills/install first.`,
        "SKILL_NOT_INSTALLED",
        403
      );
    }
  }

  const gasPlan = calculateTerminalGas({
    hasScaleAgent: agentParsed.hasScaleAgent,
    skillsInvoked: agentParsed.skillsInvoked,
  });

  let gas;
  try {
    gas = await deductGasUnits(gate.workspaceId, gasPlan.total, {
      gasKind: "ai_agent",
      nodeType: "python_terminal",
      description: `Python virtual terminal — ${gasPlan.total} GAS (${gasPlan.breakdown
        .map((b) => `${b.kind}:${b.amount}`)
        .join(", ")})`,
    });
  } catch (err) {
    if (err instanceof InsufficientGasError) {
      return apiError(err.message, err.code, 402);
    }
    console.error("[terminal/python] gas deduct failed", err);
    return apiError("Gas deduction failed.", "GAS_DEDUCT_FAILED", 503);
  }

  const executable = agentParsed.hasScaleAgent
    ? injectScaleAgentPythonStub(code, {
        equippedSkills,
        allowedSkills: equippedSkills,
        enforceEquip: enforceSkills,
      })
    : code;

  try {
    const result = await executeCodeInSandbox(executable, "python", {
      signal: request.signal,
    });

    const { events, cleanStdout } = extractSkillEventsFromStdout(result.stdout);

    return apiSuccess({
      language: "python" as const,
      stdout: cleanStdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      agent: {
        hasScaleAgent: agentParsed.hasScaleAgent,
        aliases: agentParsed.aliases,
        skillsLearned: agentParsed.skillsLearned,
        skillsInvoked: agentParsed.skillsInvoked,
        plans: plans.map((p) => ({
          skillId: p.skillId,
          alias: p.alias,
          variable: p.variable,
          capabilities: p.definition.capabilities,
          methods: p.definition.pythonMethods,
        })),
        events,
      },
      gas: {
        charged: gas.amount,
        balanceBefore: gas.balanceBefore,
        balanceAfter: gas.balanceAfter,
        ledgerId: gas.ledgerId,
        breakdown: gasPlan.breakdown,
      },
      workspaceId: gate.workspaceId,
    });
  } catch (err) {
    console.error("[terminal/python] sandbox failed", err);
    return apiError(
      err instanceof Error ? err.message : "Python sandbox execution failed.",
      "SANDBOX_FAILED",
      500
    );
  }
}
