/**
 * Node-specific decrypted payloads returned after Superadmin PIN success.
 */

import { createHash, randomBytes } from "node:crypto";
import type { SentryLiveTelemetry } from "@/lib/spatial/sentryLiveLogs";

export type NodeDecryptedLog = {
  nodeType: string;
  kind: string;
  generatedAt: string;
  entries: Array<Record<string, unknown>>;
};

function token(prefix: string): string {
  return `${prefix}_${createHash("sha256")
    .update(randomBytes(16))
    .digest("hex")
    .slice(0, 24)}`;
}

export function buildNodeSpecificLogs(
  nodeType: string | null | undefined,
  sentry: SentryLiveTelemetry
): NodeDecryptedLog {
  const generatedAt = new Date().toISOString();
  const type = nodeType?.trim() || "sentry_terminal";

  switch (type) {
    case "sentry_terminal":
      return {
        nodeType: type,
        kind: "sentry_issues",
        generatedAt,
        entries: sentry.issues.map((issue) => ({
          id: issue.id,
          shortId: issue.shortId,
          title: issue.title,
          level: issue.level,
          status: issue.status,
          traceIdHint: createHash("sha256")
            .update(`${issue.id}:${issue.lastSeen ?? ""}`)
            .digest("hex")
            .slice(0, 32),
          lastSeen: issue.lastSeen,
          permalink: issue.permalink,
        })),
      };
    case "meta_sre_autofix":
      return {
        nodeType: type,
        kind: "autofix_patches",
        generatedAt,
        entries: [
          {
            patchId: "patch-pool-circuit",
            summary: "Raise Prisma pool timeout + Sentry capture on exhaustion",
            risk: "low",
            platformHealth: 0.94,
          },
          {
            patchId: "patch-sse-reconnect",
            summary: "Apply SSE resiliency backoff on agent stream drop",
            risk: "medium",
            platformHealth: 0.91,
          },
          {
            patchId: "patch-catalog-cache",
            summary: "TTL refresh for official catalog cache stampede",
            risk: "low",
            platformHealth: 0.97,
          },
        ],
      };
    case "quantum_vault":
      return {
        nodeType: type,
        kind: "vault_secrets",
        generatedAt,
        entries: [
          {
            slot: "workspace-api",
            token: token("vault"),
            scope: "workspace.read_write",
            expiresInSec: 900,
          },
          {
            slot: "spatial-superadmin",
            token: token("qs"),
            scope: "spatial.pin_bypass",
            expiresInSec: 600,
          },
          {
            slot: "sentry-ingest",
            token: token("sentry"),
            scope: "telemetry.write",
            expiresInSec: 1800,
          },
        ],
      };
    default:
      return {
        nodeType: type,
        kind: "generic_secure_log",
        generatedAt,
        entries: [
          {
            message: `Decrypted secure log for ${type}`,
            sentryIssueCount: sentry.issueCount,
            source: sentry.source,
          },
        ],
      };
  }
}
