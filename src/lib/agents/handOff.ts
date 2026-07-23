/**
 * Swarm agent hand-off — Agent A receives a Sentry error ID, recalls prior
 * fix patterns from persistent memory, and returns a deploy-ready auto-patch.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  recallAgentMemory,
  storeAgentMemory,
  type AgentMemoryEntry,
} from "@/lib/agents/agentMemoryStore";
import { createTraceId } from "@/lib/sentry/telemetry";
import { sanitizeTelemetryText } from "@/lib/spatial/sentryLiveLogs";

export const HandOffRequestSchema = z.object({
  sentryErrorId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
  fromAgentId: z.string().trim().min(1).max(128).default("agent-a"),
  toAgentId: z.string().trim().min(1).max(128).default("meta-sre"),
  workspaceId: z.string().trim().min(1).max(128).optional().nullable(),
  issueTitle: z.string().trim().max(240).optional(),
  issueCulprit: z.string().trim().max(240).optional(),
  level: z.string().trim().max(32).optional(),
});
export type HandOffRequest = z.infer<typeof HandOffRequestSchema>;

export const AutoPatchPayloadSchema = z.object({
  patchId: z.string(),
  status: z.enum(["ready_for_virtual_deploy", "needs_review", "no_pattern"]),
  confidence: z.number().min(0).max(1),
  targetFile: z.string(),
  patch: z.string(),
  explanation: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  sentryErrorId: z.string(),
  basedOnMemoryIds: z.array(z.string()),
  deploy: z.object({
    mode: z.literal("virtual"),
    dryRun: z.boolean(),
    estimatedSteps: z.array(z.string()),
  }),
});
export type AutoPatchPayload = z.infer<typeof AutoPatchPayloadSchema>;

export type HandOffResult = {
  handOffId: string;
  traceId: string;
  fromAgentId: string;
  toAgentId: string;
  sentryErrorId: string;
  steps: Array<{
    step: number;
    name: string;
    status: "ok" | "empty" | "fallback";
    detail: string;
  }>;
  priorPatterns: AgentMemoryEntry[];
  autoPatch: AutoPatchPayload;
  memoryLogged: boolean;
};

function hashIssue(sentryErrorId: string, title?: string): string {
  return createHash("sha256")
    .update(`${sentryErrorId}:${title ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

function synthesizePatchFromPatterns(
  sentryErrorId: string,
  patterns: AgentMemoryEntry[],
  issueTitle?: string
): AutoPatchPayload {
  const basedOnMemoryIds = patterns.map((p) => p.id);
  const best = patterns[0];

  if (!best) {
    const safeTitle = sanitizeTelemetryText(issueTitle) || "Unknown issue";
    return {
      patchId: `patch-fallback-${hashIssue(sentryErrorId, issueTitle)}`,
      status: "needs_review",
      confidence: 0.28,
      targetFile: "src/lib/prisma.ts",
      patch: [
        `// Auto-generated scaffold for Sentry ${sentryErrorId}`,
        `// Issue: ${safeTitle}`,
        `// TODO: No prior fix pattern in swarm memory — Meta-SRE should investigate.`,
        `export function applyEmergencyGuard() {`,
        `  console.warn("[meta-sre] unscoped remediation for ${sentryErrorId}");`,
        `}`,
      ].join("\n"),
      explanation:
        "No prior auto-patch or resolution found in persistent memory. Returned a low-confidence scaffold for human/Meta-SRE review.",
      risk: "medium",
      sentryErrorId,
      basedOnMemoryIds: [],
      deploy: {
        mode: "virtual",
        dryRun: true,
        estimatedSteps: [
          "Open Sentry issue details",
          "Reproduce in sandbox",
          "Draft patch with Meta-SRE",
          "Validate + virtual deploy",
        ],
      },
    };
  }

  const priorPayload = best.payload ?? {};
  const targetFile =
    typeof priorPayload.targetFile === "string"
      ? priorPayload.targetFile
      : typeof priorPayload.file === "string"
        ? priorPayload.file
        : "src/lib/db/poolMonitor.ts";

  const priorPatch =
    typeof priorPayload.patch === "string"
      ? priorPayload.patch
      : [
          `// Replayed from swarm memory ${best.id}`,
          `// Prior fix: ${sanitizeTelemetryText(best.summary)}`,
          `// Sentry: ${sentryErrorId}`,
          `export function applyRememberedRemediation() {`,
          `  // ${sanitizeTelemetryText(best.title)}`,
          `  return { ok: true, sourceMemory: "${best.id}" };`,
          `}`,
        ].join("\n");

  const confidence = Math.min(
    0.95,
    0.55 + patterns.length * 0.08 + (best.kind === "auto_patch" ? 0.12 : 0)
  );

  return {
    patchId: `patch-${hashIssue(sentryErrorId, best.title)}`,
    status: confidence >= 0.7 ? "ready_for_virtual_deploy" : "needs_review",
    confidence: Number(confidence.toFixed(3)),
    targetFile,
    patch: priorPatch,
    explanation: `Hand-off synthesized from ${patterns.length} prior memory pattern(s). Primary: "${sanitizeTelemetryText(best.title)}" (${best.kind}).`,
    risk: confidence >= 0.8 ? "low" : "medium",
    sentryErrorId,
    basedOnMemoryIds,
    deploy: {
      mode: "virtual",
      dryRun: confidence < 0.85,
      estimatedSteps: [
        "Validate patch against sandbox",
        "Apply virtual deploy marker",
        "Record sentry_resolution memory",
        "Notify Meta-SRE HUD terminal",
      ],
    },
  };
}

export type RunHandOffOptions = HandOffRequest & {
  userId?: string | null;
};

/**
 * Full hand-off pipeline:
 * 1) Accept Sentry error ID
 * 2) Query persistent memory for prior fix patterns
 * 3) Return structured auto-patch for virtual deployment
 */
export async function runAgentHandOff(
  input: RunHandOffOptions
): Promise<HandOffResult> {
  const traceId = createTraceId();
  const handOffId = `handoff_${traceId.replace(/-/g, "").slice(0, 16)}`;
  const steps: HandOffResult["steps"] = [];

  steps.push({
    step: 1,
    name: "receive_sentry_error",
    status: "ok",
    detail: `Agent ${input.fromAgentId} accepted Sentry error ${input.sentryErrorId}.`,
  });

  const byIssue = await recallAgentMemory({
    userId: input.userId,
    workspaceId: input.workspaceId,
    sentryIssueId: input.sentryErrorId,
    kinds: ["auto_patch", "sentry_resolution", "execution_step"],
    limit: 10,
  });

  const byQuery = await recallAgentMemory({
    userId: input.userId,
    workspaceId: input.workspaceId,
    q: input.issueTitle || input.sentryErrorId,
    kinds: ["auto_patch", "sentry_resolution"],
    tags: ["meta-sre", "autofix", "patch"],
    limit: 10,
  });

  const merged = new Map<string, AgentMemoryEntry>();
  for (const e of [...byIssue.entries, ...byQuery.entries]) {
    merged.set(e.id, e);
  }
  const priorPatterns = [...merged.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  steps.push({
    step: 2,
    name: "query_persistent_memory",
    status: priorPatterns.length > 0 ? "ok" : "empty",
    detail:
      priorPatterns.length > 0
        ? `Found ${priorPatterns.length} prior fix pattern(s).`
        : "No prior patterns — synthesizing review scaffold.",
  });

  const autoPatch = synthesizePatchFromPatterns(
    input.sentryErrorId,
    priorPatterns,
    input.issueTitle
  );

  steps.push({
    step: 3,
    name: "return_auto_patch",
    status: autoPatch.status === "no_pattern" ? "fallback" : "ok",
    detail: `Patch ${autoPatch.patchId} · ${autoPatch.status} · confidence ${autoPatch.confidence}`,
  });

  let memoryLogged = false;
  try {
    await storeAgentMemory({
      kind: "execution_step",
      sessionId: input.sessionId,
      agentId: input.toAgentId,
      userId: input.userId,
      workspaceId: input.workspaceId,
      title: `Hand-off ${input.sentryErrorId}`,
      summary: `Delegated from ${input.fromAgentId} → ${input.toAgentId}. Patch ${autoPatch.patchId} (${autoPatch.status}).`,
      tags: [
        "hand-off",
        "meta-sre",
        "swarm",
        input.sentryErrorId.slice(0, 64),
      ],
      sentryIssueId: input.sentryErrorId,
      traceId,
      payload: {
        handOffId,
        autoPatch,
        fromAgentId: input.fromAgentId,
        toAgentId: input.toAgentId,
      },
      source: "agent",
    });

    if (autoPatch.status === "ready_for_virtual_deploy") {
      await storeAgentMemory({
        kind: "auto_patch",
        sessionId: input.sessionId,
        agentId: input.toAgentId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        title: autoPatch.patchId,
        summary: autoPatch.explanation,
        tags: ["auto_patch", "meta-sre", "virtual_deploy"],
        sentryIssueId: input.sentryErrorId,
        traceId,
        payload: {
          ...autoPatch,
          targetFile: autoPatch.targetFile,
          patch: autoPatch.patch,
        },
        source: "agent",
      });
    }
    memoryLogged = true;
  } catch {
    memoryLogged = false;
  }

  return {
    handOffId,
    traceId,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    sentryErrorId: input.sentryErrorId,
    steps,
    priorPatterns,
    autoPatch,
    memoryLogged,
  };
}
