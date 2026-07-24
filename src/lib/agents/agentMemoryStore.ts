/**
 * Persistent Meta-SRE / agent memory — execution steps, auto-patches,
 * and Sentry issue resolutions retained across sessions.
 *
 * Persists to WorkspaceMemory when Prisma is available; always mirrors
 * into a process-local ring buffer so recall works without a DB.
 */

import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import {
  tokenizeMemoryText,
  recallMemories,
  type RecalledMemory,
} from "@/lib/agents/memoryBank";
import {
  captureStructuredError,
  createTraceId,
} from "@/lib/sentry/telemetry";

export const MemoryKindSchema = z.enum([
  "execution_step",
  "auto_patch",
  "preemptive_tune",
  "sentry_resolution",
  "general",
]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const AgentMemoryEntrySchema = z.object({
  id: z.string().min(1),
  kind: MemoryKindSchema,
  sessionId: z.string().min(1).max(128),
  agentId: z.string().min(1).max(128).default("meta-sre"),
  workspaceId: z.string().nullable(),
  userId: z.string().nullable(),
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(4000),
  payload: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string().min(1).max(64)).max(32).default([]),
  sentryIssueId: z.string().nullable().optional(),
  traceId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  source: z.enum(["api", "server_action", "agent", "system"]).default("api"),
});
export type AgentMemoryEntry = z.infer<typeof AgentMemoryEntrySchema>;

const FRAGMENT_PREFIX = "[agent_memory:v1]";
const MAX_RING = 500;

type MemoryGlobals = {
  __ssAgentMemoryRing?: AgentMemoryEntry[];
};

function ring(): AgentMemoryEntry[] {
  const g = globalThis as unknown as MemoryGlobals;
  if (!g.__ssAgentMemoryRing) g.__ssAgentMemoryRing = [];
  return g.__ssAgentMemoryRing;
}

function pushRing(entry: AgentMemoryEntry): void {
  const r = ring();
  r.push(entry);
  if (r.length > MAX_RING) r.splice(0, r.length - MAX_RING);
}

function encodeFragment(entry: AgentMemoryEntry): string {
  return `${FRAGMENT_PREFIX}${JSON.stringify({
    kind: entry.kind,
    sessionId: entry.sessionId,
    agentId: entry.agentId,
    title: entry.title,
    summary: entry.summary,
    payload: entry.payload,
    tags: entry.tags,
    sentryIssueId: entry.sentryIssueId ?? null,
    traceId: entry.traceId ?? null,
    source: entry.source,
  })}`;
}

function tryParseFragment(
  id: string,
  fragment: string,
  createdAt: Date,
  userId: string | null,
  workspaceId: string | null
): AgentMemoryEntry | null {
  if (!fragment.startsWith(FRAGMENT_PREFIX)) return null;
  try {
    const raw = JSON.parse(fragment.slice(FRAGMENT_PREFIX.length)) as unknown;
    const parsed = AgentMemoryEntrySchema.omit({
      id: true,
      createdAt: true,
      userId: true,
      workspaceId: true,
    })
      .partial({ agentId: true, tags: true, payload: true, source: true })
      .safeParse(raw);
    if (!parsed.success) return null;
    return {
      id,
      kind: parsed.data.kind ?? "general",
      sessionId: parsed.data.sessionId ?? "unknown",
      agentId: parsed.data.agentId ?? "meta-sre",
      workspaceId,
      userId,
      title: parsed.data.title ?? "Memory",
      summary: parsed.data.summary ?? fragment.slice(0, 400),
      payload: parsed.data.payload ?? {},
      tags: parsed.data.tags ?? [],
      sentryIssueId: parsed.data.sentryIssueId ?? null,
      traceId: parsed.data.traceId ?? null,
      createdAt: createdAt.toISOString(),
      source: parsed.data.source ?? "system",
    };
  } catch {
    return null;
  }
}

export type StoreAgentMemoryInput = {
  kind: MemoryKind;
  sessionId: string;
  agentId?: string;
  workspaceId?: string | null;
  userId?: string | null;
  title: string;
  summary: string;
  payload?: Record<string, unknown>;
  tags?: string[];
  sentryIssueId?: string | null;
  traceId?: string | null;
  source?: AgentMemoryEntry["source"];
};

export async function storeAgentMemory(
  input: StoreAgentMemoryInput
): Promise<AgentMemoryEntry> {
  const now = new Date();
  const entry: AgentMemoryEntry = {
    id: `mem_${createTraceId().replace(/-/g, "").slice(0, 20)}`,
    kind: input.kind,
    sessionId: input.sessionId.trim().slice(0, 128),
    agentId: (input.agentId ?? "meta-sre").trim().slice(0, 128),
    workspaceId: input.workspaceId?.trim() || null,
    userId: input.userId?.trim() || null,
    title: input.title.trim().slice(0, 240),
    summary: input.summary.trim().slice(0, 4000),
    payload: input.payload ?? {},
    tags: (input.tags ?? []).slice(0, 32),
    sentryIssueId: input.sentryIssueId ?? null,
    traceId: input.traceId ?? createTraceId(),
    createdAt: now.toISOString(),
    source: input.source ?? "api",
  };

  pushRing(entry);

  const userId = entry.userId;
  if (userId) {
    try {
      const keywords = [
        "agent_memory",
        entry.kind,
        entry.agentId,
        ...tokenizeMemoryText(`${entry.title} ${entry.summary}`),
        ...entry.tags,
      ].slice(0, 32);

      const row = await getPrisma().workspaceMemory.create({
        data: {
          userId,
          orgId: entry.workspaceId,
          fragment: encodeFragment(entry),
          keywords,
        },
        select: { id: true },
      });
      entry.id = row.id;
      // Update ring copy with durable id
      const r = ring();
      const idx = r.findIndex(
        (e) =>
          e.sessionId === entry.sessionId &&
          e.createdAt === entry.createdAt &&
          e.title === entry.title
      );
      if (idx >= 0) r[idx] = entry;
    } catch (error) {
      captureStructuredError(error, {
        source: "api",
        route: "/api/memory/store",
        extra: { phase: "persist", kind: entry.kind },
      });
    }
  }

  return entry;
}

export type RecallAgentMemoryQuery = {
  sessionId?: string;
  agentId?: string;
  kind?: MemoryKind;
  /** Match any of these kinds when set (overrides singular `kind`). */
  kinds?: MemoryKind[];
  userId?: string | null;
  workspaceId?: string | null;
  q?: string;
  tags?: string[];
  sentryIssueId?: string | null;
  limit?: number;
  /**
   * When true (default for API routes), workspaceId + sessionId filters are
   * strict — null/mismatched tenant scopes never leak across enterprises.
   */
  strictTenant?: boolean;
};

function matchesKindFilter(
  entry: AgentMemoryEntry,
  query: RecallAgentMemoryQuery
): boolean {
  if (query.kinds && query.kinds.length > 0) {
    return query.kinds.includes(entry.kind);
  }
  if (query.kind) return entry.kind === query.kind;
  return true;
}

/** Multi-tenant gate for workspace + session isolation. */
function matchesTenantScope(
  entry: AgentMemoryEntry,
  query: RecallAgentMemoryQuery
): boolean {
  const strict = query.strictTenant === true;

  if (strict) {
    if (!query.sessionId || entry.sessionId !== query.sessionId) return false;
    const wantWs = query.workspaceId?.trim() || null;
    if (!wantWs || entry.workspaceId !== wantWs) return false;
    return true;
  }

  // Soft mode: when filters are provided, match exactly (no null→tenant leaks).
  if (query.sessionId && entry.sessionId !== query.sessionId) return false;
  if (query.workspaceId) {
    if (entry.workspaceId !== query.workspaceId) return false;
  }
  return true;
}

export async function recallAgentMemory(
  query: RecallAgentMemoryQuery
): Promise<{
  entries: AgentMemoryEntry[];
  recalledContext: RecalledMemory[];
  source: "ring" | "mixed" | "db";
}> {
  const limit = Math.min(50, Math.max(1, query.limit ?? 12));
  const tagNeedles = (query.tags ?? []).map((t) => t.toLowerCase());
  const ringHits = ring()
    .filter((e) => {
      if (!matchesTenantScope(e, query)) return false;
      if (query.agentId && e.agentId !== query.agentId) return false;
      if (!matchesKindFilter(e, query)) return false;
      if (query.userId && e.userId && e.userId !== query.userId) return false;
      if (
        query.sentryIssueId &&
        (e.sentryIssueId ?? "").toLowerCase() !==
          query.sentryIssueId.toLowerCase()
      ) {
        return false;
      }
      if (tagNeedles.length > 0) {
        const hay = e.tags.map((t) => t.toLowerCase());
        if (!tagNeedles.some((t) => hay.includes(t))) return false;
      }
      if (query.q) {
        const hay = `${e.title} ${e.summary} ${e.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(query.q.toLowerCase())) return false;
      }
      return true;
    })
    .slice(-limit)
    .reverse();

  let dbEntries: AgentMemoryEntry[] = [];
  let recalledContext: RecalledMemory[] = [];

  if (query.userId) {
    try {
      const rows = await getPrisma().workspaceMemory.findMany({
        where: {
          userId: query.userId,
          ...(query.workspaceId
            ? { orgId: query.workspaceId }
            : { orgId: null }),
          fragment: { startsWith: FRAGMENT_PREFIX },
        },
        orderBy: { createdAt: "desc" },
        take: limit * 3,
      });

      dbEntries = rows
        .map((row) =>
          tryParseFragment(
            row.id,
            row.fragment,
            row.createdAt,
            row.userId,
            row.orgId
          )
        )
        .filter((e): e is AgentMemoryEntry => e != null)
        .filter((e) => {
          if (!matchesTenantScope(e, query)) return false;
          if (!matchesKindFilter(e, query)) return false;
          if (query.agentId && e.agentId !== query.agentId) return false;
          if (
            query.sentryIssueId &&
            (e.sentryIssueId ?? "").toLowerCase() !==
              query.sentryIssueId.toLowerCase()
          ) {
            return false;
          }
          if (tagNeedles.length > 0) {
            const hay = e.tags.map((t) => t.toLowerCase());
            if (!tagNeedles.some((t) => hay.includes(t))) return false;
          }
          if (query.q) {
            const hay =
              `${e.title} ${e.summary} ${e.tags.join(" ")}`.toLowerCase();
            if (!hay.includes(query.q.toLowerCase())) return false;
          }
          return true;
        })
        .slice(0, limit);

      if (query.q) {
        recalledContext = await recallMemories(
          query.userId,
          query.workspaceId ?? null,
          query.q,
          Math.min(5, limit)
        );
      }
    } catch (error) {
      captureStructuredError(error, {
        source: "api",
        route: "/api/memory/store",
        extra: { phase: "recall" },
        level: "warning",
      });
    }
  }

  const byId = new Map<string, AgentMemoryEntry>();
  for (const e of [...dbEntries, ...ringHits]) {
    byId.set(e.id, e);
  }
  const entries = [...byId.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

  return {
    entries,
    recalledContext,
    source:
      dbEntries.length && ringHits.length
        ? "mixed"
        : dbEntries.length
          ? "db"
          : "ring",
  };
}
