/**
 * Asynchronous security audit logger.
 * Fire-and-forget writes to SecurityAuditLog — never blocks the request path.
 */

import type { Prisma, SecurityAuditSeverity } from "@prisma/client";
import { withPrisma } from "@/lib/prisma";

export type SecurityEventSeverity = SecurityAuditSeverity;

export type LogSecurityEventInput = {
  workspaceId: string;
  eventType: string;
  severity?: SecurityEventSeverity;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function extractClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    null
  );
}

/**
 * Persist a security audit event. Safe to await; throws only on hard DB failures.
 */
export async function logSecurityEvent(
  input: LogSecurityEventInput
): Promise<{ id: string } | null> {
  const workspaceId = input.workspaceId?.trim();
  const eventType = input.eventType?.trim();
  if (!workspaceId || !eventType) return null;

  const details = (input.details ?? {}) as Prisma.InputJsonValue;

  const row = await withPrisma(
    (db) =>
      db.securityAuditLog.create({
        data: {
          workspaceId,
          eventType: eventType.slice(0, 128),
          severity: input.severity ?? "INFO",
          details,
          ipAddress: input.ipAddress?.trim().slice(0, 64) || null,
          userAgent: input.userAgent?.trim().slice(0, 512) || null,
        },
        select: { id: true },
      }),
    "security.auditLogger.write"
  );

  return row;
}

/**
 * Non-blocking security log — swallows errors so callers never fail on audit I/O.
 */
export function logSecurityEventAsync(input: LogSecurityEventInput): void {
  void logSecurityEvent(input).catch((err) => {
    console.warn(
      "[security/auditLogger] write skipped:",
      err instanceof Error ? err.message : err
    );
  });
}

/**
 * Convenience: log from an HTTP request context (IP + UA extracted).
 */
export function logSecurityEventFromRequest(
  request: Request,
  input: Omit<LogSecurityEventInput, "ipAddress" | "userAgent"> & {
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): void {
  logSecurityEventAsync({
    ...input,
    ipAddress: input.ipAddress ?? extractClientIp(request),
    userAgent: input.userAgent ?? request.headers.get("user-agent"),
  });
}
