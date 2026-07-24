/**
 * GET/POST /api/memory/skills
 * Synthesize Skill Documents from successful auto-patches; query before LLM.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import {
  QuerySkillsRequestSchema,
  SynthesizeSkillsRequestSchema,
  querySkillsForPatch,
  synthesizeSkillsFromMemory,
} from "@/lib/agents/skillSynthesis";
import { getSkillById } from "@/lib/agents/skillDocumentStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const skillId = url.searchParams.get("id")?.trim();

  if (skillId) {
    const skill = getSkillById(skillId);
    if (!skill) {
      return apiError("Skill not found.", "SKILL_NOT_FOUND", 404);
    }
    return apiSuccess({ skill });
  }

  const tagsRaw = url.searchParams.get("tags");
  const parsed = QuerySkillsRequestSchema.safeParse({
    workspaceId:
      url.searchParams.get("workspaceId") ??
      request.headers.get("x-workspace-id") ??
      undefined,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
    category: url.searchParams.get("category") ?? undefined,
    targetFile: url.searchParams.get("targetFile") ?? undefined,
    sentryIssueId: url.searchParams.get("sentryIssueId") ?? undefined,
    minConfidence: url.searchParams.get("minConfidence")
      ? Number(url.searchParams.get("minConfidence"))
      : undefined,
    limit: url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 10,
    markUsed: url.searchParams.get("markUsed") === "true",
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ??
        "workspaceId is required to query skills.",
      "INVALID_QUERY",
      400
    );
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/memory/skills",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = querySkillsForPatch(parsed.data);
      return apiSuccess(
        {
          skills: result.skills,
          matched: result.matched,
          best: result.best,
          skipLlm: result.skipLlm,
          reason: result.reason,
        },
        200,
        {
          "x-workspace-bound": parsed.data.workspaceId,
          "x-skill-skip-llm": result.skipLlm ? "1" : "0",
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Skill query failed.",
      "SKILL_QUERY_FAILED",
      500
    );
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const headerWorkspace =
    request.headers.get("x-workspace-id")?.trim() || undefined;
  const merged =
    raw && typeof raw === "object"
      ? {
          ...(raw as Record<string, unknown>),
          workspaceId:
            (raw as { workspaceId?: string }).workspaceId ?? headerWorkspace,
        }
      : raw;

  // Dual mode: synthesize from memory OR query (action=query).
  const action =
    merged && typeof merged === "object" && "action" in merged
      ? String((merged as { action?: string }).action ?? "synthesize")
      : "synthesize";

  const profile = await resolveRequestUser(request);

  if (action === "query") {
    const parsed = QuerySkillsRequestSchema.safeParse(merged);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message ?? "Invalid skill query payload.",
        "INVALID_BODY",
        400
      );
    }
    const telemetry = telemetryContextFromRequest(request, {
      route: "/api/memory/skills",
      source: "api",
      tenantId: parsed.data.workspaceId,
    });
    try {
      return await withSentryTelemetryAsync(telemetry, async () => {
        const result = querySkillsForPatch(parsed.data);
        return apiSuccess({
          action: "query",
          ...result,
          auth: { userId: profile.id },
        });
      });
    } catch (error) {
      captureStructuredError(error, telemetry);
      return apiError(
        error instanceof Error ? error.message : "Skill query failed.",
        "SKILL_QUERY_FAILED",
        500
      );
    }
  }

  const parsed = SynthesizeSkillsRequestSchema.safeParse({
    ...(typeof merged === "object" && merged ? merged : {}),
    userId:
      (merged as { userId?: string })?.userId ?? profile.id ?? undefined,
  });

  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid skill synthesize payload.",
      "INVALID_BODY",
      400
    );
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/memory/skills",
    source: "api",
    tenantId: parsed.data.workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const result = await synthesizeSkillsFromMemory(parsed.data);
      return apiSuccess(
        {
          action: "synthesize",
          ...result,
          count: result.synthesized.length,
          auth: { userId: profile.id },
        },
        200,
        {
          "x-workspace-bound": parsed.data.workspaceId,
          "x-skills-count": String(result.synthesized.length),
        }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Skill synthesis failed.",
      "SKILL_SYNTHESIZE_FAILED",
      500
    );
  }
}
