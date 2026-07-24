/**
 * Auto-synthesized skill library — derived from swarm memory + builtins.
 */

import { z } from "zod";
import { recallAgentMemory } from "@/lib/agents/agentMemoryStore";
import {
  BUILTIN_SKILLS,
  BUILTIN_SKILL_IDS,
  type BuiltinSkillDefinition,
} from "@/lib/skills/skillRegistry";
import { createTraceId } from "@/lib/sentry/telemetry";

export const SynthesizedSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  source: z.enum(["builtin", "auto_patch", "sentry_resolution", "system"]),
  tags: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  confidence: z.number().min(0).max(1),
});
export type SynthesizedSkill = z.infer<typeof SynthesizedSkillSchema>;

export type SkillLibrarySnapshot = {
  fetchedAt: string;
  skills: SynthesizedSkill[];
  counts: { builtin: number; synthesized: number; total: number };
  source: "mixed" | "builtin" | "memory";
};

function builtinToSkill(def: BuiltinSkillDefinition): SynthesizedSkill {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    source: "builtin",
    tags: [...def.capabilities, def.gasKind],
    payload: {
      invokeGas: def.invokeGas,
      installGas: def.installGas,
      pythonMethods: def.pythonMethods,
      capabilities: def.capabilities,
    },
    createdAt: new Date(0).toISOString(),
    confidence: 1,
  };
}

export type BuildSkillLibraryOptions = {
  sessionId?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  q?: string | null;
  limit?: number;
};

export async function buildSkillLibrary(
  options: BuildSkillLibraryOptions = {}
): Promise<SkillLibrarySnapshot> {
  const limit = Math.min(60, Math.max(8, options.limit ?? 40));
  const builtins = BUILTIN_SKILL_IDS.map((id) =>
    builtinToSkill(BUILTIN_SKILLS[id])
  );

  const recalled = await recallAgentMemory({
    sessionId: options.sessionId ?? undefined,
    workspaceId: options.workspaceId,
    userId: options.userId,
    kinds: ["auto_patch", "sentry_resolution"],
    limit: 30,
  });

  const synthesized: SynthesizedSkill[] = recalled.entries.map((e) => {
    const targetFile =
      typeof e.payload?.targetFile === "string"
        ? e.payload.targetFile
        : "src/lib/agents/healAgent.ts";
    const patch =
      typeof e.payload?.patch === "string" ? e.payload.patch : e.summary;
    return {
      id: `skill_${e.id}`,
      name: e.title.slice(0, 80),
      description: e.summary.slice(0, 400),
      version: "0.1.0-synth",
      source: e.kind === "auto_patch" ? "auto_patch" : "sentry_resolution",
      tags: [...e.tags.slice(0, 8), "synthesized", "meta-sre"],
      payload: {
        memoryId: e.id,
        sentryIssueId: e.sentryIssueId ?? null,
        targetFile,
        patch,
        agentId: e.agentId,
        invoke: {
          method: "apply_remembered_remediation",
          args: { memoryId: e.id },
        },
      },
      createdAt: e.createdAt,
      confidence: e.kind === "auto_patch" ? 0.82 : 0.7,
    };
  });

  // Demo synthesized skills when memory empty
  if (synthesized.length === 0) {
    synthesized.push(
      {
        id: `skill_demo_${createTraceId().slice(0, 8)}`,
        name: "WebGL Boundary Guard",
        description:
          "Auto-synthesized from SS-4790 — wrap Canvas in WebGLErrorBoundary + dpr clamp.",
        version: "0.1.0-synth",
        source: "auto_patch",
        tags: ["webgl", "spatial", "synthesized", "meta-sre"],
        payload: {
          targetFile: "src/components/spatial/SpatialUniverse.tsx",
          patch:
            "// WebGLErrorBoundary wrap + dpr={[1,1.5]}\nexport function applyWebglGuard() { return true; }",
          invoke: { method: "apply_webgl_guard", args: {} },
        },
        createdAt: new Date().toISOString(),
        confidence: 0.86,
      },
      {
        id: `skill_demo_${createTraceId().slice(0, 8)}_2`,
        name: "SSE Resume Resiliency",
        description:
          "Auto-synthesized from SS-4821 — Last-Event-Id resume + reconnect backoff.",
        version: "0.1.0-synth",
        source: "sentry_resolution",
        tags: ["sse", "resiliency", "synthesized"],
        payload: {
          targetFile: "src/lib/agents/useAgentStream.ts",
          patch:
            "// resume from Last-Event-Id\nexport function resumeSse(id: string) { return id; }",
          invoke: { method: "resume_sse", args: { lastEventId: "0" } },
        },
        createdAt: new Date().toISOString(),
        confidence: 0.78,
      }
    );
  }

  let skills = [...builtins, ...synthesized].slice(0, limit);
  const q = options.q?.trim().toLowerCase();
  if (q) {
    skills = skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.id.toLowerCase().includes(q)
    );
  }

  return {
    fetchedAt: new Date().toISOString(),
    skills,
    counts: {
      builtin: builtins.length,
      synthesized: synthesized.length,
      total: skills.length,
    },
    source: recalled.entries.length > 0 ? "mixed" : "builtin",
  };
}
