/**
 * Tenant compliance audit log execution layer.
 * Append-only writes + workspace-bound reads.
 */

import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import type { Prisma, TelemetryAuditLog } from "@prisma/client";

export const AUDIT_ACTOR_TYPES = [
  "user",
  "api_key",
  "system",
  "agent",
] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_OUTCOMES = ["success", "denied", "failed"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export type CreateAuditLogInput = {
  workspaceId: string;
  action: string;
  actorType: AuditActorType;
  actorId?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export type ListAuditLogsQuery = {
  workspaceId: string;
  action?: string | null;
  outcome?: AuditOutcome | null;
  actorType?: AuditActorType | null;
  resource?: string | null;
  resourceId?: string | null;
  since?: Date | null;
  until?: Date | null;
  limit?: number;
  cursor?: string | null;
};

export function hashClientIp(ip: string | null | undefined): string | null {
  const trimmed = ip?.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(trimmed).digest("hex");
}

export function serializeAuditLog(row: TelemetryAuditLog) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    action: row.action,
    actorType: row.actorType,
    actorId: row.actorId,
    resource: row.resource,
    resourceId: row.resourceId,
    outcome: row.outcome,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    metadata:
      row.metadataJson &&
      typeof row.metadataJson === "object" &&
      !Array.isArray(row.metadataJson)
        ? (row.metadataJson as Record<string, unknown>)
        : {},
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Persist a single audit event. Never throws on metadata shape — coerces to {}.
 */
export async function appendAuditLog(
  input: CreateAuditLogInput
): Promise<TelemetryAuditLog> {
  const prisma = getPrisma();
  const metadataJson = (input.metadata ?? {}) as Prisma.InputJsonValue;

  return prisma.telemetryAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      action: input.action.trim(),
      actorType: input.actorType,
      actorId: input.actorId?.trim() || null,
      resource: input.resource?.trim() || null,
      resourceId: input.resourceId?.trim() || null,
      outcome: input.outcome ?? "success",
      ipHash: hashClientIp(input.ip),
      userAgent: input.userAgent?.slice(0, 512) || null,
      metadataJson,
    },
  });
}

/**
 * Bulk append inside a single transaction (max 100).
 */
export async function appendAuditLogs(
  workspaceId: string,
  events: Omit<CreateAuditLogInput, "workspaceId">[]
): Promise<TelemetryAuditLog[]> {
  if (events.length === 0) return [];
  const prisma = getPrisma();

  return prisma.$transaction(
    events.map((ev) =>
      prisma.telemetryAuditLog.create({
        data: {
          workspaceId,
          action: ev.action.trim(),
          actorType: ev.actorType,
          actorId: ev.actorId?.trim() || null,
          resource: ev.resource?.trim() || null,
          resourceId: ev.resourceId?.trim() || null,
          outcome: ev.outcome ?? "success",
          ipHash: hashClientIp(ev.ip),
          userAgent: ev.userAgent?.slice(0, 512) || null,
          metadataJson: (ev.metadata ?? {}) as Prisma.InputJsonValue,
        },
      })
    )
  );
}

/**
 * Cursor-paginated workspace audit feed (newest first).
 */
export async function listAuditLogs(
  query: ListAuditLogsQuery
): Promise<{ rows: TelemetryAuditLog[]; nextCursor: string | null }> {
  const prisma = getPrisma();
  const take = Math.min(200, Math.max(1, query.limit ?? 50));

  const where: Prisma.TelemetryAuditLogWhereInput = {
    workspaceId: query.workspaceId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.actorType ? { actorType: query.actorType } : {}),
    ...(query.resource ? { resource: query.resource } : {}),
    ...(query.resourceId ? { resourceId: query.resourceId } : {}),
    ...(query.since || query.until
      ? {
          createdAt: {
            ...(query.since ? { gte: query.since } : {}),
            ...(query.until ? { lte: query.until } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.telemetryAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(query.cursor
      ? {
          cursor: { id: query.cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return { rows: page, nextCursor };
}
