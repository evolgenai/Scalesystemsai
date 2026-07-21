/**
 * GET  /api/domains — list tenant custom domains (workspace-scoped)
 * POST /api/domains — create or verify a TenantDomain binding
 *
 * Tenant isolation: x-workspace-key required on every request.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { withPrisma } from "@/lib/prisma";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  extractClientIp,
  logSecurityEventAsync,
} from "@/lib/security/auditLogger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const CreateDomainSchema = z.object({
  action: z.literal("create").optional().default("create"),
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .refine((v) => DOMAIN_RE.test(v), "Invalid domain hostname."),
  customLogoUrl: z.string().url().max(2_048).optional().nullable(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "primaryColor must be #RGB or #RRGGBB.")
    .optional()
    .nullable(),
});

const VerifyDomainSchema = z.object({
  action: z.literal("verify"),
  domainId: z.string().cuid().optional(),
  domain: z.string().trim().min(3).max(253).optional(),
  verificationToken: z.string().trim().min(16).max(128),
});

const PostBodySchema = z.union([CreateDomainSchema, VerifyDomainSchema]);

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

function mintVerificationToken(): string {
  return `ss-dom-${randomBytes(16).toString("hex")}`;
}

function serializeDomain(row: {
  id: string;
  workspaceId: string;
  domain: string;
  sslStatus: string;
  verificationToken: string;
  customLogoUrl: string | null;
  primaryColor: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    domain: row.domain,
    sslStatus: row.sslStatus,
    verificationToken: row.verificationToken,
    customLogoUrl: row.customLogoUrl,
    primaryColor: row.primaryColor,
    createdAt: row.createdAt.toISOString(),
    dnsHint: {
      type: "TXT",
      host: `_scalesystems-verify.${row.domain}`,
      value: row.verificationToken,
    },
  };
}

export async function GET(request: Request) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  try {
    const rows = await withPrisma(
      (db) =>
        db.tenantDomain.findMany({
          where: { workspaceId: gate.workspaceId },
          orderBy: { createdAt: "desc" },
        }),
      "domains.list"
    );

    return apiSuccess(
      {
        data: rows.map(serializeDomain),
        meta: {
          workspaceId: gate.workspaceId,
          count: rows.length,
        },
      },
      200,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    console.error("[api/domains] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list domains.",
      "DOMAINS_LIST_FAILED",
      503
    );
  }
}

export async function POST(request: Request) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  const ip = extractClientIp(request);
  const ua = request.headers.get("user-agent");

  try {
    if (body.action === "verify") {
      const domainNorm = body.domain ? normalizeDomain(body.domain) : null;

      const existing = await withPrisma(
        (db) =>
          db.tenantDomain.findFirst({
            where: {
              workspaceId: gate.workspaceId,
              ...(body.domainId ? { id: body.domainId } : {}),
              ...(domainNorm ? { domain: domainNorm } : {}),
            },
          }),
        "domains.verify.lookup"
      );

      if (!existing) {
        logSecurityEventAsync({
          workspaceId: gate.workspaceId,
          eventType: "domain.verify.not_found",
          severity: "WARNING",
          ipAddress: ip,
          userAgent: ua,
          details: { domainId: body.domainId, domain: domainNorm },
        });
        return apiError("Domain not found in this workspace.", "DOMAIN_NOT_FOUND", 404);
      }

      const expected = createHash("sha256")
        .update(existing.verificationToken)
        .digest();
      const provided = createHash("sha256")
        .update(body.verificationToken.trim())
        .digest();

      if (
        expected.length !== provided.length ||
        !timingSafeEqual(expected, provided)
      ) {
        await withPrisma(
          (db) =>
            db.tenantDomain.update({
              where: { id: existing.id },
              data: { sslStatus: "FAILED" },
            }),
          "domains.verify.fail"
        );
        logSecurityEventAsync({
          workspaceId: gate.workspaceId,
          eventType: "domain.verify.failed",
          severity: "WARNING",
          ipAddress: ip,
          userAgent: ua,
          details: { domainId: existing.id, domain: existing.domain },
        });
        return apiError(
          "Domain verification token mismatch.",
          "DOMAIN_VERIFY_FAILED",
          403
        );
      }

      const updated = await withPrisma(
        (db) =>
          db.tenantDomain.update({
            where: { id: existing.id },
            data: { sslStatus: "ACTIVE" },
          }),
        "domains.verify.ok"
      );

      logSecurityEventAsync({
        workspaceId: gate.workspaceId,
        eventType: "domain.verify.succeeded",
        severity: "INFO",
        ipAddress: ip,
        userAgent: ua,
        details: { domainId: updated.id, domain: updated.domain },
      });

      return apiSuccess(
        { data: serializeDomain(updated) },
        200,
        { "x-workspace-bound": gate.workspaceId }
      );
    }

    const domain = normalizeDomain(body.domain);
    const verificationToken = mintVerificationToken();

    const created = await withPrisma(
      (db) =>
        db.tenantDomain.create({
          data: {
            workspaceId: gate.workspaceId,
            domain,
            sslStatus: "PENDING",
            verificationToken,
            customLogoUrl: body.customLogoUrl ?? null,
            primaryColor: body.primaryColor ?? null,
          },
        }),
      "domains.create"
    );

    logSecurityEventAsync({
      workspaceId: gate.workspaceId,
      eventType: "domain.created",
      severity: "INFO",
      ipAddress: ip,
      userAgent: ua,
      details: { domainId: created.id, domain: created.domain },
    });

    return apiSuccess(
      { data: serializeDomain(created) },
      201,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Domain operation failed.";
    const isUnique =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";

    if (isUnique) {
      return apiError(
        "Domain is already registered.",
        "DOMAIN_ALREADY_EXISTS",
        409
      );
    }

    console.error("[api/domains] POST failed:", err);
    return apiError(message, "DOMAINS_MUTATION_FAILED", 503);
  }
}
