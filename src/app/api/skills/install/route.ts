/**
 * POST /api/skills/install — equip an agent/robot with a built-in @skill.
 * GET  /api/skills/install — list built-in registry (+ optional agent installs).
 *
 * Auth: x-workspace-key (required)
 */

import { z } from "zod";
import {
  deductGasUnits,
  InsufficientGasError,
} from "@/lib/billing/gasMeter";
import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { getPrisma } from "@/lib/prisma";
import {
  getSkill,
  listBuiltinSkills,
  normalizeSkillId,
  skillGasNodeType,
} from "@/lib/skills/skillRegistry";
import {
  installSkillOnAgent,
  listAgentSkills,
} from "@/lib/skills/skillInstall";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const InstallBodySchema = z.object({
  agentId: z.string().trim().min(1).max(128),
  skillId: z.string().trim().min(1).max(64),
  agentAlias: z.string().trim().min(1).max(64).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  /** Skip install gas when re-equipping an already-installed skill. Default true. */
  chargeInstallGas: z.boolean().optional(),
});

export async function GET(request: Request) {
  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId")?.trim() || null;

  const registry = listBuiltinSkills().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    version: s.version,
    invokeGas: s.invokeGas,
    installGas: s.installGas,
    gasKind: s.gasKind,
    capabilities: s.capabilities,
    pythonMethods: s.pythonMethods,
  }));

  let installed: Awaited<ReturnType<typeof listAgentSkills>> = [];
  if (agentId) {
    installed = await listAgentSkills(gate.workspaceId, agentId);
  }

  return apiSuccess({
    registry,
    installed: installed.map((row) => ({
      id: row.id,
      skillId: row.skillId,
      agentId: row.agentId,
      agentAlias: row.agentAlias,
      installedAt: row.installedAt.toISOString(),
      skill: row.skill
        ? {
            name: row.skill.name,
            capabilities: row.skill.capabilities,
            pythonMethods: row.skill.pythonMethods,
          }
        : null,
    })),
    workspaceId: gate.workspaceId,
  });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = InstallBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    parsed.data.workspaceId ?? null
  );
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const skillId = normalizeSkillId(parsed.data.skillId);
  const skill = getSkill(skillId);
  if (!skill) {
    return apiError(
      `Unknown skill: ${skillId}. Built-ins: @vercel, @playwright, @github, @stripe.`,
      "UNKNOWN_SKILL",
      400
    );
  }

  const prisma = getPrisma();
  const agent = await prisma.agent.findUnique({
    where: { id: parsed.data.agentId },
    select: { id: true },
  });
  if (!agent) {
    return apiError(
      `Agent not found: ${parsed.data.agentId}`,
      "AGENT_NOT_FOUND",
      404
    );
  }

  const existing = await prisma.agentSkillInstall.findUnique({
    where: {
      workspaceId_agentId_skillId: {
        workspaceId: gate.workspaceId,
        agentId: parsed.data.agentId,
        skillId: skill.id,
      },
    },
    select: { id: true },
  });
  const isNew = !existing;

  const shouldCharge =
    parsed.data.chargeInstallGas !== false && isNew && skill.installGas > 0;

  let gas = null;
  if (shouldCharge) {
    try {
      gas = await deductGasUnits(gate.workspaceId, skill.installGas, {
        gasKind: skill.gasKind,
        nodeType: skillGasNodeType(skill.id),
        description: `Skill install ${skill.id} on agent ${parsed.data.agentId} — ${skill.installGas} GAS`,
      });
    } catch (err) {
      if (err instanceof InsufficientGasError) {
        return apiError(err.message, err.code, 402);
      }
      console.error("[skills/install] gas deduct failed", err);
      return apiError("Gas deduction failed.", "GAS_DEDUCT_FAILED", 503);
    }
  }

  const result = await installSkillOnAgent({
    workspaceId: gate.workspaceId,
    agentId: parsed.data.agentId,
    skillId: skill.id,
    agentAlias: parsed.data.agentAlias ?? null,
  });

  if (!result.ok) {
    const status = result.code === "AGENT_NOT_FOUND" ? 404 : 400;
    return apiError(result.message, result.code, status);
  }

  return apiSuccess(
    {
      installed: {
        id: result.row.id,
        skillId: result.row.skillId,
        agentId: result.row.agentId,
        agentAlias: result.row.agentAlias,
        installedAt: result.row.installedAt.toISOString(),
        created: result.created,
      },
      skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        capabilities: skill.capabilities,
        pythonMethods: skill.pythonMethods,
        invokeGas: skill.invokeGas,
        installGas: skill.installGas,
      },
      gas: gas
        ? {
            charged: gas.amount,
            balanceBefore: gas.balanceBefore,
            balanceAfter: gas.balanceAfter,
            ledgerId: gas.ledgerId,
          }
        : { charged: 0, skipped: true },
      workspaceId: gate.workspaceId,
    },
    result.created ? 201 : 200
  );
}
