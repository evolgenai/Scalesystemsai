/**
 * GET /api/memory/skills/graph
 * Skill document graph for Spatial Universe / memory HUD (Sprint 56).
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";
import {
  listAllSkills,
  querySkillDocuments,
  type SkillDocument,
} from "@/lib/agents/skillDocumentStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

type SkillGraphNode = {
  id: string;
  label: string;
  category: SkillDocument["category"];
  confidence: number;
  usageCount: number;
  tags: string[];
  workspaceId: string | null;
};

type SkillGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "shared_tag" | "shared_memory" | "same_category";
  weight: number;
};

function buildSkillGraph(skills: SkillDocument[]): {
  nodes: SkillGraphNode[];
  edges: SkillGraphEdge[];
} {
  const nodes: SkillGraphNode[] = skills.map((s) => ({
    id: s.id,
    label: s.title,
    category: s.category,
    confidence: s.confidence,
    usageCount: s.usageCount,
    tags: s.tags,
    workspaceId: s.workspaceId,
  }));

  const edges: SkillGraphEdge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const a = skills[i]!;
      const b = skills[j]!;
      const sharedTags = a.tags.filter((t) =>
        b.tags.some((bt) => bt.toLowerCase() === t.toLowerCase())
      );
      const sharedMemory = a.sourceMemoryIds.filter((id) =>
        b.sourceMemoryIds.includes(id)
      );

      if (sharedTags.length > 0) {
        const key = `tag:${a.id}:${b.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            id: key,
            source: a.id,
            target: b.id,
            kind: "shared_tag",
            weight: sharedTags.length,
          });
        }
      }
      if (sharedMemory.length > 0) {
        const key = `mem:${a.id}:${b.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            id: key,
            source: a.id,
            target: b.id,
            kind: "shared_memory",
            weight: sharedMemory.length,
          });
        }
      }
      if (a.category === b.category && sharedTags.length === 0) {
        const key = `cat:${a.id}:${b.id}`;
        if (!seen.has(key) && edges.length < 200) {
          seen.add(key);
          edges.push({
            id: key,
            source: a.id,
            target: b.id,
            kind: "same_category",
            weight: 0.5,
          });
        }
      }
    }
  }

  return { nodes, edges: edges.slice(0, 250) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId =
    url.searchParams.get("workspaceId") ??
    request.headers.get("x-workspace-id") ??
    undefined;
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
    : 40;

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/memory/skills/graph",
    source: "api",
    tenantId: workspaceId,
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const skills = workspaceId
        ? querySkillDocuments({
            workspaceId,
            sessionId,
            limit,
            strictTenant: false,
          }).skills
        : listAllSkills().slice(0, limit);

      const graph = buildSkillGraph(skills);
      return apiSuccess({
        graph,
        meta: {
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          workspaceId: workspaceId ?? null,
          sessionId: sessionId ?? null,
        },
      });
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Skill graph failed.",
      "SKILL_GRAPH_FAILED",
      500
    );
  }
}
