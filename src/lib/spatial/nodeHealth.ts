/**
 * Spatial node anomaly diagnostics — classify nodes healthy / warning / critical
 * from Sentry logs, execution errors, and procedural telemetry signals.
 */

import { z } from "zod";
import {
  fetchSanitizedSentryErrors,
  type SanitizedSentryIssue,
} from "@/lib/spatial/sentryLiveLogs";
import {
  DEFAULT_WORLD_SEED,
  generateWorldObjectsMatrix,
  type SpatialRegistryNode,
} from "@/lib/spatial/worldObjects";
import { recallAgentMemory } from "@/lib/agents/agentMemoryStore";

export const NodeHealthStateSchema = z.enum([
  "healthy",
  "warning",
  "critical",
]);
export type NodeHealthState = z.infer<typeof NodeHealthStateSchema>;

export const NodeHealthReportSchema = z.object({
  nodeId: z.string(),
  type: z.string(),
  title: z.string(),
  state: NodeHealthStateSchema,
  score: z.number().min(0).max(100),
  coordinates: z.tuple([z.number(), z.number(), z.number()]),
  requiresPin: z.boolean(),
  signals: z.array(
    z.object({
      kind: z.enum([
        "sentry",
        "execution",
        "telemetry",
        "memory",
        "heartbeat",
      ]),
      severity: NodeHealthStateSchema,
      message: z.string(),
      weight: z.number(),
    })
  ),
  relatedSentryIssueIds: z.array(z.string()),
  lastErrorAt: z.string().datetime().nullable(),
});
export type NodeHealthReport = z.infer<typeof NodeHealthReportSchema>;

export const NodeHealthSnapshotSchema = z.object({
  generatedAt: z.string().datetime(),
  seed: z.string(),
  workspaceId: z.string().nullable(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    healthy: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
  }),
  nodes: z.array(NodeHealthReportSchema),
  sentrySource: z.string(),
});
export type NodeHealthSnapshot = z.infer<typeof NodeHealthSnapshotSchema>;

export const NodeHealthQuerySchema = z.object({
  workspaceId: z.string().trim().min(1).max(128).optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  seed: z.string().trim().min(1).max(128).optional(),
  nodeId: z.string().trim().min(1).max(128).optional(),
  nodeType: z.string().trim().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(200).default(40),
});
export type NodeHealthQuery = z.infer<typeof NodeHealthQuerySchema>;

function scoreToState(score: number): NodeHealthState {
  if (score <= 40) return "critical";
  if (score <= 72) return "warning";
  return "healthy";
}

function issueTouchesNode(
  issue: SanitizedSentryIssue,
  node: SpatialRegistryNode
): boolean {
  const hay =
    `${issue.title} ${issue.culprit ?? ""} ${issue.project ?? ""}`.toLowerCase();
  const needles = [
    node.type,
    node.title,
    node.id,
    node.type.replace(/_/g, " "),
  ].map((s) => s.toLowerCase());
  return needles.some((n) => n.length > 2 && hay.includes(n));
}

function classifyNode(options: {
  node: SpatialRegistryNode;
  issues: SanitizedSentryIssue[];
  execErrors: Array<{
    at: string;
    summary: string;
    sentryIssueId: string | null;
  }>;
}): NodeHealthReport {
  const { node, issues, execErrors } = options;
  let score = 100;
  const signals: NodeHealthReport["signals"] = [];
  const relatedSentryIssueIds: string[] = [];
  let lastErrorAt: string | null = null;

  const tel = node.telemetry;
  if (tel.status === "degraded") {
    score -= 25;
    signals.push({
      kind: "telemetry",
      severity: "warning",
      message: "Node telemetry status: degraded",
      weight: 25,
    });
  } else if (tel.status === "locked") {
    score -= 15;
    signals.push({
      kind: "telemetry",
      severity: "warning",
      message: "Node locked — awaiting PIN / access",
      weight: 15,
    });
  }

  if (tel.cpuLoad > 0.9) {
    const weight = tel.cpuLoad > 0.97 ? 22 : 12;
    score -= weight;
    signals.push({
      kind: "telemetry",
      severity: tel.cpuLoad > 0.97 ? "critical" : "warning",
      message: `CPU load ${(tel.cpuLoad * 100).toFixed(0)}%`,
      weight,
    });
  }

  if (tel.latencyMs > 800) {
    const weight = tel.latencyMs > 2000 ? 25 : 12;
    score -= weight;
    signals.push({
      kind: "telemetry",
      severity: tel.latencyMs > 2000 ? "critical" : "warning",
      message: `Latency ${Math.round(tel.latencyMs)}ms`,
      weight,
    });
  }

  const matchedIssues = issues.filter((i) => issueTouchesNode(i, node));
  for (const issue of matchedIssues.slice(0, 5)) {
    relatedSentryIssueIds.push(issue.id);
    const level = (issue.level ?? "").toLowerCase();
    const weight =
      level === "fatal" || level === "error"
        ? 22
        : level === "warning"
          ? 10
          : 6;
    score -= weight;
    signals.push({
      kind: "sentry",
      severity:
        level === "fatal" || level === "error"
          ? "critical"
          : level === "warning"
            ? "warning"
            : "healthy",
      message: `${issue.shortId ?? issue.id}: ${issue.title}`.slice(0, 200),
      weight,
    });
    if (issue.lastSeen) {
      const ts = Date.parse(issue.lastSeen);
      if (
        Number.isFinite(ts) &&
        (!lastErrorAt || ts > Date.parse(lastErrorAt))
      ) {
        lastErrorAt = new Date(ts).toISOString();
      }
    }
  }

  if (
    (node.type === "sentry_terminal" || node.type === "meta_sre_autofix") &&
    issues.some((i) => (i.status ?? "").toLowerCase() !== "resolved")
  ) {
    const open = issues.filter(
      (i) => (i.status ?? "").toLowerCase() !== "resolved"
    ).length;
    if (open >= 8) {
      score -= 18;
      signals.push({
        kind: "sentry",
        severity: "warning",
        message: `${open} unresolved Sentry issues in feed`,
        weight: 18,
      });
    }
  }

  const nodeErrors = execErrors.filter((e) => {
    const hay = e.summary.toLowerCase();
    return (
      hay.includes(node.type.toLowerCase()) ||
      hay.includes(node.id.toLowerCase()) ||
      (e.sentryIssueId != null &&
        relatedSentryIssueIds.includes(e.sentryIssueId))
    );
  });
  for (const err of nodeErrors.slice(0, 4)) {
    score -= 14;
    signals.push({
      kind: "execution",
      severity: "critical",
      message: err.summary.slice(0, 200),
      weight: 14,
    });
    if (!lastErrorAt || Date.parse(err.at) > Date.parse(lastErrorAt)) {
      lastErrorAt = err.at;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const state = scoreToState(score);

  if (signals.length === 0) {
    signals.push({
      kind: "telemetry",
      severity: "healthy",
      message: "No anomaly signals detected",
      weight: 0,
    });
  }

  return {
    nodeId: node.id,
    type: node.type,
    title: node.title,
    state,
    score,
    coordinates: [
      node.coordinates.x,
      node.coordinates.y,
      node.coordinates.z,
    ],
    requiresPin: node.requires_pin,
    signals,
    relatedSentryIssueIds: [...new Set(relatedSentryIssueIds)],
    lastErrorAt,
  };
}

/**
 * Analyze spatial node health from Sentry + memory execution errors + matrix telemetry.
 */
export async function analyzeNodeHealth(
  query: NodeHealthQuery
): Promise<NodeHealthSnapshot> {
  const seed = query.seed?.trim() || DEFAULT_WORLD_SEED;
  const matrix = generateWorldObjectsMatrix({ seed });

  const sentry = await fetchSanitizedSentryErrors({ limit: 25 });
  const issues = sentry.issues;

  let execErrors: Array<{
    at: string;
    summary: string;
    sentryIssueId: string | null;
  }> = [];

  if (query.workspaceId) {
    try {
      const recalled = await recallAgentMemory({
        workspaceId: query.workspaceId,
        sessionId: query.sessionId,
        kinds: ["auto_patch", "execution_step", "sentry_resolution"],
        limit: 40,
        strictTenant: Boolean(query.sessionId),
      });
      execErrors = recalled.entries
        .filter((e) => {
          const outcome = (e.payload as { outcome?: string }).outcome;
          return (
            outcome === "failed" ||
            outcome === "rejected" ||
            e.tags.includes("error") ||
            e.summary.toLowerCase().includes("fail") ||
            e.summary.toLowerCase().includes("reject")
          );
        })
        .map((e) => ({
          at: e.createdAt,
          summary: e.summary,
          sentryIssueId: e.sentryIssueId ?? null,
        }));
    } catch {
      execErrors = [];
    }
  }

  let nodes = matrix.objects.filter((n) => n.category === "interactive");
  if (query.nodeId) {
    nodes = nodes.filter((n) => n.id === query.nodeId);
  }
  if (query.nodeType) {
    nodes = nodes.filter((n) => n.type === query.nodeType);
  }

  const reports = nodes
    .slice(0, query.limit)
    .map((node) => classifyNode({ node, issues, execErrors }))
    .sort((a, b) => a.score - b.score);

  const summary = {
    total: reports.length,
    healthy: reports.filter((r) => r.state === "healthy").length,
    warning: reports.filter((r) => r.state === "warning").length,
    critical: reports.filter((r) => r.state === "critical").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    seed,
    workspaceId: query.workspaceId ?? null,
    summary,
    nodes: reports,
    sentrySource: sentry.source,
  };
}
