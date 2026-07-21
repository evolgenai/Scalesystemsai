/**
 * Persist + query AgentSkillInstall rows (workspace-scoped skill equip).
 */

import { getPrisma } from "@/lib/prisma";
import {
  getSkill,
  normalizeSkillId,
  type BuiltinSkillDefinition,
} from "@/lib/skills/skillRegistry";

export type InstalledSkillRow = {
  id: string;
  workspaceId: string;
  agentId: string;
  skillId: string;
  agentAlias: string | null;
  installedAt: Date;
  skill: BuiltinSkillDefinition | null;
};

export async function listAgentSkills(
  workspaceId: string,
  agentId: string
): Promise<InstalledSkillRow[]> {
  const prisma = getPrisma();
  const rows = await prisma.agentSkillInstall.findMany({
    where: { workspaceId, agentId },
    orderBy: { installedAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    skillId: row.skillId,
    agentAlias: row.agentAlias,
    installedAt: row.installedAt,
    skill: getSkill(row.skillId),
  }));
}

export async function getEquippedSkillIds(
  workspaceId: string,
  agentId: string
): Promise<string[]> {
  const rows = await listAgentSkills(workspaceId, agentId);
  return rows.map((r) => r.skillId);
}

export type InstallSkillInput = {
  workspaceId: string;
  agentId: string;
  skillId: string;
  agentAlias?: string | null;
};

export type InstallSkillResult =
  | { ok: true; created: boolean; row: InstalledSkillRow }
  | { ok: false; code: "UNKNOWN_SKILL" | "AGENT_NOT_FOUND"; message: string };

/**
 * Equip an agent with a built-in skill. Idempotent on (workspace, agent, skill).
 */
export async function installSkillOnAgent(
  input: InstallSkillInput
): Promise<InstallSkillResult> {
  const skillId = normalizeSkillId(input.skillId);
  const skill = getSkill(skillId);
  if (!skill) {
    return {
      ok: false,
      code: "UNKNOWN_SKILL",
      message: `Unknown skill: ${skillId}. Built-ins: @vercel, @playwright, @github, @stripe.`,
    };
  }

  const prisma = getPrisma();
  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    select: { id: true, name: true },
  });
  if (!agent) {
    return {
      ok: false,
      code: "AGENT_NOT_FOUND",
      message: `Agent not found: ${input.agentId}`,
    };
  }

  const existing = await prisma.agentSkillInstall.findUnique({
    where: {
      workspaceId_agentId_skillId: {
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        skillId: skill.id,
      },
    },
  });

  if (existing) {
    const updated =
      input.agentAlias !== undefined &&
      input.agentAlias !== existing.agentAlias
        ? await prisma.agentSkillInstall.update({
            where: { id: existing.id },
            data: { agentAlias: input.agentAlias },
          })
        : existing;

    return {
      ok: true,
      created: false,
      row: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        agentId: updated.agentId,
        skillId: updated.skillId,
        agentAlias: updated.agentAlias,
        installedAt: updated.installedAt,
        skill,
      },
    };
  }

  const created = await prisma.agentSkillInstall.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      skillId: skill.id,
      agentAlias: input.agentAlias ?? null,
    },
  });

  return {
    ok: true,
    created: true,
    row: {
      id: created.id,
      workspaceId: created.workspaceId,
      agentId: created.agentId,
      skillId: created.skillId,
      agentAlias: created.agentAlias,
      installedAt: created.installedAt,
      skill,
    },
  };
}
