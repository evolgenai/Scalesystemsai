/**
 * Skill Document store — reusable synthesized skills from successful
 * multi-step auto-patches. Queried before patch generation to skip
 * redundant LLM calls.
 */

import { z } from "zod";
import { createTraceId } from "@/lib/sentry/telemetry";

export const SkillStepSchema = z.object({
  order: z.number().int().positive(),
  name: z.string().min(1).max(120),
  instruction: z.string().min(1).max(2000),
  targetHint: z.string().max(240).optional(),
});
export type SkillStep = z.infer<typeof SkillStepSchema>;

export const SkillDocumentSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(2000),
  category: z.enum([
    "auto_patch",
    "sentry_heal",
    "sandbox_deploy",
    "tenant_isolation",
    "general",
  ]),
  steps: z.array(SkillStepSchema).min(1).max(32),
  tags: z.array(z.string().min(1).max(64)).max(32),
  targetFilePatterns: z.array(z.string().min(1).max(240)).max(16),
  patchTemplate: z.string().max(8000).nullable(),
  confidence: z.number().min(0).max(1),
  sourceMemoryIds: z.array(z.string().min(1)).max(32),
  sentryIssueIds: z.array(z.string().min(1)).max(32),
  workspaceId: z.string().nullable(),
  sessionId: z.string().nullable(),
  usageCount: z.number().int().nonnegative().default(0),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SkillDocument = z.infer<typeof SkillDocumentSchema>;

type SkillGlobals = {
  __ssSkillDocuments?: SkillDocument[];
};

const MAX_SKILLS = 300;

function ring(): SkillDocument[] {
  const g = globalThis as unknown as SkillGlobals;
  if (!g.__ssSkillDocuments) g.__ssSkillDocuments = [];
  return g.__ssSkillDocuments;
}

export function slugifySkillTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "skill";
}

export type StoreSkillDocumentInput = Omit<
  SkillDocument,
  "id" | "createdAt" | "updatedAt" | "usageCount" | "lastUsedAt" | "slug"
> & {
  id?: string;
  slug?: string;
  usageCount?: number;
  lastUsedAt?: string | null;
};

export function storeSkillDocument(
  input: StoreSkillDocumentInput
): SkillDocument {
  const now = new Date().toISOString();
  const slug =
    input.slug?.trim() ||
    `${slugifySkillTitle(input.title)}-${createTraceId().slice(0, 8)}`;

  const existing = ring().find(
    (s) =>
      s.slug === slug ||
      (s.workspaceId === (input.workspaceId ?? null) &&
        s.title === input.title.trim())
  );

  if (existing) {
    const merged: SkillDocument = {
      ...existing,
      summary: input.summary.trim().slice(0, 2000),
      steps: input.steps,
      tags: [...new Set([...existing.tags, ...input.tags])].slice(0, 32),
      targetFilePatterns: [
        ...new Set([
          ...existing.targetFilePatterns,
          ...input.targetFilePatterns,
        ]),
      ].slice(0, 16),
      patchTemplate: input.patchTemplate ?? existing.patchTemplate,
      confidence: Math.max(existing.confidence, input.confidence),
      sourceMemoryIds: [
        ...new Set([...existing.sourceMemoryIds, ...input.sourceMemoryIds]),
      ].slice(0, 32),
      sentryIssueIds: [
        ...new Set([...existing.sentryIssueIds, ...input.sentryIssueIds]),
      ].slice(0, 32),
      updatedAt: now,
    };
    const idx = ring().findIndex((s) => s.id === existing.id);
    if (idx >= 0) ring()[idx] = merged;
    return merged;
  }

  const doc: SkillDocument = {
    id: input.id ?? `skill_${createTraceId().replace(/-/g, "").slice(0, 18)}`,
    slug,
    title: input.title.trim().slice(0, 240),
    summary: input.summary.trim().slice(0, 2000),
    category: input.category,
    steps: input.steps,
    tags: input.tags.slice(0, 32),
    targetFilePatterns: input.targetFilePatterns.slice(0, 16),
    patchTemplate: input.patchTemplate,
    confidence: input.confidence,
    sourceMemoryIds: input.sourceMemoryIds.slice(0, 32),
    sentryIssueIds: input.sentryIssueIds.slice(0, 32),
    workspaceId: input.workspaceId ?? null,
    sessionId: input.sessionId ?? null,
    usageCount: input.usageCount ?? 0,
    lastUsedAt: input.lastUsedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const r = ring();
  r.push(doc);
  if (r.length > MAX_SKILLS) r.splice(0, r.length - MAX_SKILLS);
  return doc;
}

export type QuerySkillsOptions = {
  workspaceId?: string | null;
  sessionId?: string | null;
  q?: string;
  tags?: string[];
  category?: SkillDocument["category"];
  targetFile?: string;
  sentryIssueId?: string;
  minConfidence?: number;
  limit?: number;
  /** When true, require workspaceId match (enterprise isolation). */
  strictTenant?: boolean;
};

function scoreSkill(skill: SkillDocument, options: QuerySkillsOptions): number {
  let score = skill.confidence * 10;
  const q = options.q?.toLowerCase().trim();
  if (q) {
    const hay = `${skill.title} ${skill.summary} ${skill.tags.join(" ")} ${skill.patchTemplate ?? ""}`.toLowerCase();
    if (hay.includes(q)) score += 8;
    for (const token of q.split(/\s+/).filter(Boolean)) {
      if (hay.includes(token)) score += 1.5;
    }
  }
  if (options.tags?.length) {
    const tagSet = new Set(skill.tags.map((t) => t.toLowerCase()));
    for (const t of options.tags) {
      if (tagSet.has(t.toLowerCase())) score += 3;
    }
  }
  if (options.targetFile) {
    const file = options.targetFile.replace(/\\/g, "/").toLowerCase();
    for (const pat of skill.targetFilePatterns) {
      const p = pat.toLowerCase();
      if (file.includes(p) || file.endsWith(p) || p.includes(file)) {
        score += 6;
      }
    }
  }
  if (
    options.sentryIssueId &&
    skill.sentryIssueIds.includes(options.sentryIssueId)
  ) {
    score += 5;
  }
  score += Math.min(5, skill.usageCount * 0.2);
  return score;
}

export function querySkillDocuments(
  options: QuerySkillsOptions = {}
): {
  skills: SkillDocument[];
  matched: boolean;
  best: SkillDocument | null;
} {
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const minConfidence = options.minConfidence ?? 0;
  const strict = options.strictTenant === true;

  const candidates = ring().filter((skill) => {
    if (strict) {
      if (!options.workspaceId || skill.workspaceId !== options.workspaceId) {
        return false;
      }
      if (options.sessionId && skill.sessionId !== options.sessionId) {
        return false;
      }
    } else if (
      options.workspaceId &&
      skill.workspaceId &&
      skill.workspaceId !== options.workspaceId
    ) {
      return false;
    }
    if (options.category && skill.category !== options.category) return false;
    if (skill.confidence < minConfidence) return false;
    return true;
  });

  const ranked = candidates
    .map((skill) => ({ skill, score: scoreSkill(skill, options) }))
    .filter(({ skill, score }) => {
      if (
        !options.q &&
        !options.tags?.length &&
        !options.targetFile &&
        !options.sentryIssueId
      ) {
        return true;
      }
      // Require some match signal beyond baseline confidence weight.
      return score > skill.confidence * 10 + 1;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ skill }) => skill);

  // When no query filters, return by recency/confidence.
  const skills =
    ranked.length > 0
      ? ranked
      : !options.q && !options.tags?.length && !options.targetFile
        ? candidates
            .sort(
              (a, b) =>
                b.confidence - a.confidence ||
                Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
            )
            .slice(0, limit)
        : [];

  return {
    skills,
    matched: skills.length > 0,
    best: skills[0] ?? null,
  };
}

export function markSkillUsed(skillId: string): SkillDocument | null {
  const r = ring();
  const idx = r.findIndex((s) => s.id === skillId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const updated: SkillDocument = {
    ...r[idx]!,
    usageCount: r[idx]!.usageCount + 1,
    lastUsedAt: now,
    updatedAt: now,
  };
  r[idx] = updated;
  return updated;
}

export function getSkillById(id: string): SkillDocument | null {
  return ring().find((s) => s.id === id || s.slug === id) ?? null;
}

export function listAllSkills(): SkillDocument[] {
  return [...ring()];
}
