/**
 * GET/POST /api/workspaces
 * List active workspaces, create tenants, switch active workspaceId.
 */

import { z } from "zod";
import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { getPrisma } from "@/lib/prisma";
import { generateWorkspaceApiKey } from "@/lib/workspace/resolveWorkspace";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";
import {
  isUsingVaultDevFallback,
  maskApiKey,
  sealWorkspaceCredentials,
} from "@/lib/crypto/vault";
import {
  createEphemeralWorkspace,
  getActiveWorkspaceId,
  listWorkspaces,
  resolveSessionKey,
  switchActiveWorkspace,
} from "@/lib/workspace/workspaceRegistry";
import {
  captureStructuredError,
  telemetryContextFromRequest,
  withSentryTelemetryAsync,
} from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const CreateSchema = z.object({
  action: z.literal("create").optional(),
  name: z.string().trim().min(1).max(120),
  ephemeral: z.boolean().optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
});

const SwitchSchema = z.object({
  action: z.literal("switch"),
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
});

async function requireAgentAuth(request: Request): Promise<NextResponse | null> {
  const gate = request.headers.get("x-agent-auth")?.trim();
  if (gate === "verified") return null;
  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
  }
  // Soft-open for HUD when workspace key is present (Sprint 53 switcher).
  if (request.headers.get("x-workspace-key")?.trim()) return null;
  if (request.headers.get("x-workspace-id")?.trim()) return null;
  return apiError("Unauthorized.", "WORKSPACE_UNAUTHORIZED", 401);
}

/** GET /api/workspaces — list + active workspace binding. */
export async function GET(request: Request) {
  const denied = await requireAgentAuth(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;
  const userId = url.searchParams.get("userId")?.trim() || undefined;
  const sessionKey = resolveSessionKey({ sessionId, userId });
  const headerWorkspace =
    request.headers.get("x-workspace-id")?.trim() || null;

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/workspaces",
    source: "api",
  });

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      const workspaces = await listWorkspaces({ includeDemo: true });

      // Prefer Prisma-backed list for meter fields when available.
      let prismaExtras: Array<{
        id: string;
        apiKeyMasked: string;
        hasCredentialCipher: boolean;
        meterBalanceUsd: number;
        meterSpendUsd: number;
        meterLastAt: Date | null;
      }> = [];
      try {
        const rows = await getPrisma().workspace.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            apiKey: true,
            credentialCipher: true,
            meterBalanceUsd: true,
            meterSpendUsd: true,
            meterLastAt: true,
          },
          take: 100,
        });
        prismaExtras = rows.map((row) => ({
          id: row.id,
          apiKeyMasked: maskApiKey(row.apiKey),
          hasCredentialCipher: Boolean(row.credentialCipher),
          meterBalanceUsd: row.meterBalanceUsd,
          meterSpendUsd: row.meterSpendUsd,
          meterLastAt: row.meterLastAt,
        }));
      } catch {
        prismaExtras = [];
      }

      const extrasById = new Map(prismaExtras.map((r) => [r.id, r]));
      const enriched = workspaces.map((w) => {
        const extra = extrasById.get(w.id);
        return {
          ...w,
          ...(extra
            ? {
                apiKeyMasked: extra.apiKeyMasked,
                hasCredentialCipher: extra.hasCredentialCipher,
                meterBalanceUsd: extra.meterBalanceUsd,
                meterSpendUsd: extra.meterSpendUsd,
                meterLastAt: extra.meterLastAt,
              }
            : {}),
        };
      });

      const activeWorkspaceId =
        getActiveWorkspaceId(sessionKey) ??
        headerWorkspace ??
        enriched[0]?.id ??
        null;

      return apiSuccess({
        count: enriched.length,
        activeWorkspaceId,
        sessionKey,
        workspaces: enriched,
      });
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Workspace list failed.",
      "WORKSPACE_LIST_FAILED",
      500
    );
  }
}

/** POST /api/workspaces — create tenant OR switch active workspaceId. */
export async function POST(request: Request) {
  const denied = await requireAgentAuth(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON.", "INVALID_JSON", 400);
  }

  const telemetry = telemetryContextFromRequest(request, {
    route: "/api/workspaces",
    source: "api",
  });

  const asSwitch = SwitchSchema.safeParse(raw);
  if (asSwitch.success) {
    try {
      return await withSentryTelemetryAsync(telemetry, async () => {
        const result = await switchActiveWorkspace(asSwitch.data);
        return apiSuccess(
          {
            action: "switch",
            activeWorkspaceId: result.activeWorkspaceId,
            workspace: result.workspace,
            sessionKey: result.sessionKey,
          },
          200,
          {
            "x-workspace-bound": result.activeWorkspaceId,
          }
        );
      });
    } catch (error) {
      captureStructuredError(error, telemetry);
      return apiError(
        error instanceof Error ? error.message : "Workspace switch failed.",
        "WORKSPACE_SWITCH_FAILED",
        500
      );
    }
  }

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ??
        "Invalid body. Use { name } to create or { action: 'switch', workspaceId }.",
      "INVALID_BODY",
      400
    );
  }

  try {
    return await withSentryTelemetryAsync(telemetry, async () => {
      if (parsed.data.ephemeral) {
        const workspace = createEphemeralWorkspace(parsed.data.name);
        const sessionKey = resolveSessionKey(parsed.data);
        const activeWorkspaceId = (
          await switchActiveWorkspace({
            action: "switch",
            workspaceId: workspace.id,
            sessionId: parsed.data.sessionId,
            userId: parsed.data.userId,
          })
        ).activeWorkspaceId;
        return apiSuccess(
          {
            action: "create",
            workspace,
            activeWorkspaceId,
            sessionKey,
          },
          201,
          { "x-workspace-bound": activeWorkspaceId }
        );
      }

      const apiKey = generateWorkspaceApiKey();
      const sealed = sealWorkspaceCredentials({ apiKey });

      const row = await getPrisma().workspace.create({
        data: {
          name: parsed.data.name,
          apiKey,
          credentialCipher: sealed.cipher,
        },
      });

      const sessionKey = resolveSessionKey(parsed.data);
      await switchActiveWorkspace({
        action: "switch",
        workspaceId: row.id,
        sessionId: parsed.data.sessionId,
        userId: parsed.data.userId,
      });

      return apiSuccess(
        {
          action: "create",
          workspace: {
            id: row.id,
            name: row.name,
            apiKey: row.apiKey,
            apiKeyMasked: maskApiKey(row.apiKey),
            hasCredentialCipher: true,
            meterBalanceUsd: row.meterBalanceUsd,
            meterSpendUsd: row.meterSpendUsd,
            createdAt: row.createdAt,
            source: "prisma" as const,
            status: "active" as const,
          },
          activeWorkspaceId: row.id,
          sessionKey,
          warnings: isUsingVaultDevFallback()
            ? [
                "VAULT_ENCRYPTION_KEY unset — using development vault fallback. Set a 64-char hex key before production.",
              ]
            : undefined,
        },
        201,
        { "x-workspace-bound": row.id }
      );
    });
  } catch (error) {
    captureStructuredError(error, telemetry);
    return apiError(
      error instanceof Error ? error.message : "Workspace create failed.",
      "WORKSPACE_CREATE_FAILED",
      500
    );
  }
}
