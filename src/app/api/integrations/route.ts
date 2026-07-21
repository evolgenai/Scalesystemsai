/**
 * GET  /api/integrations — list third-party connectors for the workspace
 * POST /api/integrations — connect / upsert credentials (encrypted at rest)
 *
 * Tenant isolation: requires x-workspace-key.
 */

import { NextResponse } from "next/server";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  ConnectIntegrationSchema,
  sealCredentials,
  toPublicIntegration,
} from "@/lib/integrations/credentials";
import { withPrisma } from "@/lib/prisma";
import type { IntegrationProvider, IntegrationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations
 * Query: provider?, status?
 */
export async function GET(request: Request) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const url = new URL(request.url);
  const providerParam = url.searchParams.get("provider")?.trim().toUpperCase();
  const statusParam = url.searchParams.get("status")?.trim().toUpperCase();

  const providers: IntegrationProvider[] = [
    "SHOPIFY",
    "SLACK",
    "DISCORD",
    "GOOGLE_SHEETS",
    "GITHUB",
  ];
  const statuses: IntegrationStatus[] = ["ACTIVE", "INACTIVE"];

  const provider =
    providerParam && providers.includes(providerParam as IntegrationProvider)
      ? (providerParam as IntegrationProvider)
      : undefined;
  const status =
    statusParam && statuses.includes(statusParam as IntegrationStatus)
      ? (statusParam as IntegrationStatus)
      : undefined;

  try {
    const rows = await withPrisma(
      (db) =>
        db.workspaceIntegration.findMany({
          where: {
            workspaceId: gate.workspaceId,
            ...(provider ? { provider } : {}),
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: "desc" },
        }),
      "integrations.list"
    );

    return apiSuccess({
      data: rows.map(toPublicIntegration),
      meta: {
        workspaceId: gate.workspaceId,
        total: rows.length,
      },
    });
  } catch (err) {
    console.error("[api/integrations] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list integrations.",
      "INTEGRATIONS_LIST_FAILED",
      503
    );
  }
}

/**
 * POST /api/integrations
 * Body: ConnectIntegrationSchema — encrypts credentials before persist.
 */
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

  const parsed = ConnectIntegrationSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;
  let sealed;
  try {
    sealed = sealCredentials(body.credentials ?? {});
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Unable to encrypt credentials.",
      "CREDENTIALS_ENCRYPT_FAILED",
      500
    );
  }

  try {
    const row = body.upsert
      ? await withPrisma(
          (db) =>
            db.workspaceIntegration.upsert({
              where: {
                workspaceId_provider: {
                  workspaceId: gate.workspaceId,
                  provider: body.provider,
                },
              },
              create: {
                workspaceId: gate.workspaceId,
                provider: body.provider,
                status: body.status,
                credentialsEncrypted: sealed,
                lastSyncedAt: new Date(),
              },
              update: {
                status: body.status,
                credentialsEncrypted: sealed,
                lastSyncedAt: new Date(),
              },
            }),
          "integrations.upsert"
        )
      : await withPrisma(
          (db) =>
            db.workspaceIntegration.create({
              data: {
                workspaceId: gate.workspaceId,
                provider: body.provider,
                status: body.status,
                credentialsEncrypted: sealed,
                lastSyncedAt: new Date(),
              },
            }),
          "integrations.create"
        );

    return NextResponse.json(
      { success: true, data: toPublicIntegration(row) },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
          "x-integration-id": row.id,
          "x-workspace-id": gate.workspaceId,
          "x-workspace-bound": gate.workspaceId,
        },
      }
    );
  } catch (err) {
    const isDuplicate =
      err instanceof Error &&
      (err.message.includes("Unique constraint") ||
        err.message.includes("workspaceId_provider"));
    if (isDuplicate) {
      return apiError(
        `Integration for ${body.provider} already exists in this workspace.`,
        "INTEGRATION_CONFLICT",
        409
      );
    }
    console.error("[api/integrations] POST failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to connect integration.",
      "INTEGRATIONS_CONNECT_FAILED",
      503
    );
  }
}
