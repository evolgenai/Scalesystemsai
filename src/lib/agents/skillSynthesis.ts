/**
 * Skill Synthesis Engine — turns successful multi-step auto-patches from
 * memory into structured, reusable Skill Documents.
 */

import { z } from "zod";
import {
  recallAgentMemory,
  type AgentMemoryEntry,
} from "@/lib/agents/agentMemoryStore";
import {
  storeSkillDocument,
  querySkillDocuments,
  markSkillUsed,
  type SkillDocument,
  type SkillStep,
} from "@/lib/agents/skillDocumentStore";

export const SynthesizeSkillsRequestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
  /** Limit how many auto_patch memories to consider. */
  limit: z.number().int().min(1).max(50).default(20),
  /** Only synthesize patches with successful sandbox outcomes when payload present. */
  successfulOnly: z.boolean().default(true),
  q: z.string().trim().min(1).max(240).optional(),
});
export type SynthesizeSkillsRequest = z.infer<
  typeof SynthesizeSkillsRequestSchema
>;

export type SynthesizeSkillsResult = {
  synthesized: SkillDocument[];
  skipped: number;
  scanned: number;
  reusedExisting: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSuccessfulAutoPatch(entry: AgentMemoryEntry): boolean {
  const payload = asRecord(entry.payload);
  const outcome = payload.outcome;
  if (outcome === "rejected" || outcome === "failed") return false;

  const sandbox = asRecord(payload.sandbox);
  if (typeof sandbox.applied === "boolean") return sandbox.applied;

  const autoPatch = asRecord(payload.autoPatch);
  const status = autoPatch.status ?? payload.status;
  if (status === "needs_review" || status === "no_pattern") return false;

  // Hand-off ready patches and explicit success tags count.
  if (
    entry.tags.includes("virtual_deploy") ||
    entry.tags.includes("execute-patch") ||
    status === "ready_for_virtual_deploy" ||
    outcome === "success"
  ) {
    return true;
  }

  return entry.kind === "auto_patch";
}

function extractTargetFile(entry: AgentMemoryEntry): string | null {
  const payload = asRecord(entry.payload);
  if (typeof payload.targetFile === "string") return payload.targetFile;
  const autoPatch = asRecord(payload.autoPatch);
  if (typeof autoPatch.targetFile === "string") return autoPatch.targetFile;
  return null;
}

function extractPatchText(entry: AgentMemoryEntry): string | null {
  const payload = asRecord(entry.payload);
  if (typeof payload.patch === "string") return payload.patch;
  const autoPatch = asRecord(payload.autoPatch);
  if (typeof autoPatch.patch === "string") return autoPatch.patch;
  return null;
}

function buildSteps(entry: AgentMemoryEntry, targetFile: string | null): SkillStep[] {
  const payload = asRecord(entry.payload);
  const autoPatch = asRecord(payload.autoPatch);
  const explanation =
    (typeof autoPatch.explanation === "string" && autoPatch.explanation) ||
    entry.summary;

  const steps: SkillStep[] = [
    {
      order: 1,
      name: "recall_context",
      instruction:
        "Query persistent memory and matching Skill Documents before calling an LLM.",
      targetHint: entry.sentryIssueId ?? undefined,
    },
    {
      order: 2,
      name: "apply_known_pattern",
      instruction: explanation.slice(0, 1800),
      targetHint: targetFile ?? undefined,
    },
    {
      order: 3,
      name: "virtual_sandbox_verify",
      instruction:
        "Run the patch in virtual sandbox mode and record auto_patch + sentry_resolution memories.",
      targetHint: targetFile ?? undefined,
    },
  ];

  const sandbox = asRecord(payload.sandbox);
  const checks = Array.isArray(sandbox.checks) ? sandbox.checks : [];
  if (checks.length > 0) {
    steps.push({
      order: 4,
      name: "safety_checks",
      instruction: checks
        .map((c) => {
          const row = asRecord(c);
          return `${row.name ?? "check"}: ${row.ok ? "ok" : "fail"} — ${row.detail ?? ""}`;
        })
        .join("; ")
        .slice(0, 1800),
    });
  }

  return steps;
}

function confidenceFromEntry(entry: AgentMemoryEntry): number {
  const payload = asRecord(entry.payload);
  const autoPatch = asRecord(payload.autoPatch);
  if (typeof autoPatch.confidence === "number") {
    return Math.min(1, Math.max(0.4, autoPatch.confidence));
  }
  if (payload.outcome === "success") return 0.88;
  return 0.72;
}

/**
 * Synthesize Skill Documents from successful auto_patch memories.
 */
export async function synthesizeSkillsFromMemory(
  input: SynthesizeSkillsRequest
): Promise<SynthesizeSkillsResult> {
  const recalled = await recallAgentMemory({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    userId: input.userId,
    kinds: ["auto_patch", "sentry_resolution"],
    q: input.q,
    tags: ["auto_patch", "virtual_deploy", "meta-sre"],
    limit: input.limit,
    strictTenant: Boolean(input.sessionId),
  });

  const synthesized: SkillDocument[] = [];
  let skipped = 0;
  let reusedExisting = 0;

  // Group related patches by target file + sentry issue for multi-step skills.
  const groups = new Map<string, AgentMemoryEntry[]>();
  for (const entry of recalled.entries) {
    if (input.successfulOnly && !isSuccessfulAutoPatch(entry)) {
      skipped += 1;
      continue;
    }
    const target = extractTargetFile(entry) ?? "unknown";
    const key = `${target}::${entry.sentryIssueId ?? entry.title}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  for (const [, entries] of groups) {
    const primary = entries.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    )[0]!;
    const targetFile = extractTargetFile(primary);
    const patch = extractPatchText(primary);
    const beforeCount = synthesized.length;

    // Prefer reuse when an equivalent skill already exists.
    const existing = querySkillDocuments({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      targetFile: targetFile ?? undefined,
      q: primary.title,
      tags: ["auto_patch"],
      minConfidence: 0.5,
      limit: 1,
      strictTenant: true,
    });

    if (
      existing.best &&
      existing.best.sourceMemoryIds.some((id) =>
        entries.some((e) => e.id === id)
      )
    ) {
      reusedExisting += 1;
      synthesized.push(existing.best);
      continue;
    }

    const title =
      targetFile != null
        ? `Heal ${targetFile.split("/").pop() ?? targetFile}`
        : `Skill · ${primary.title}`.slice(0, 240);

    const doc = storeSkillDocument({
      title,
      summary: primary.summary.slice(0, 2000),
      category: "auto_patch",
      steps: buildSteps(primary, targetFile),
      tags: [
        ...new Set([
          "synthesized",
          "auto_patch",
          "meta-sre",
          ...primary.tags.slice(0, 12),
        ]),
      ],
      targetFilePatterns: targetFile ? [targetFile] : [],
      patchTemplate: patch,
      confidence: confidenceFromEntry(primary),
      sourceMemoryIds: entries.map((e) => e.id),
      sentryIssueIds: entries
        .map((e) => e.sentryIssueId)
        .filter((id): id is string => Boolean(id)),
      workspaceId: input.workspaceId,
      sessionId: input.sessionId ?? primary.sessionId,
    });

    synthesized.push(doc);
    if (synthesized.length === beforeCount) reusedExisting += 1;
  }

  return {
    synthesized,
    skipped,
    scanned: recalled.entries.length,
    reusedExisting,
  };
}

export const QuerySkillsRequestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128).optional(),
  q: z.string().trim().min(1).max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(16).optional(),
  category: z
    .enum([
      "auto_patch",
      "sentry_heal",
      "sandbox_deploy",
      "tenant_isolation",
      "general",
    ])
    .optional(),
  targetFile: z.string().trim().min(1).max(240).optional(),
  sentryIssueId: z.string().trim().min(1).max(128).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  markUsed: z.boolean().default(false),
});
export type QuerySkillsRequest = z.infer<typeof QuerySkillsRequestSchema>;

/**
 * Query skills before generating a patch — returns best match for LLM skip.
 */
export function querySkillsForPatch(input: QuerySkillsRequest): {
  skills: SkillDocument[];
  matched: boolean;
  best: SkillDocument | null;
  skipLlm: boolean;
  reason: string;
} {
  const result = querySkillDocuments({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    q: input.q,
    tags: input.tags,
    category: input.category,
    targetFile: input.targetFile,
    sentryIssueId: input.sentryIssueId,
    minConfidence: input.minConfidence ?? 0.55,
    limit: input.limit,
    strictTenant: true,
  });

  const best = result.best;
  const skipLlm = Boolean(
    best &&
      best.confidence >= (input.minConfidence ?? 0.7) &&
      (best.patchTemplate?.trim() || best.steps.length >= 2)
  );

  if (skipLlm && best && input.markUsed) {
    markSkillUsed(best.id);
  }

  return {
    ...result,
    skipLlm,
    reason: skipLlm
      ? `Reusable skill ${best!.slug} (confidence ${best!.confidence.toFixed(2)}) — skip redundant LLM call.`
      : result.matched
        ? "Partial skill matches found — review before generating a new patch."
        : "No matching skills — proceed with LLM / hand-off synthesis.",
  };
}
