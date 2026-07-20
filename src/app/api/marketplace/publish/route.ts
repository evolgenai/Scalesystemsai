import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  parseAndValidateMcpSchema,
  PublishPluginBodySchema,
} from "@/lib/marketplace/pluginSchema";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorBody = { success: false; error: string; code: string };

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
  });
}

async function requirePublishAuth(
  request: Request
): Promise<NextResponse | null> {
  const gate = request.headers.get("x-agent-auth")?.trim();
  if (gate === "verified") return null;

  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
    return jsonError(verdict.reason, "AGENT_TOKEN_INVALID", 401);
  }

  const wsKey =
    request.headers.get("x-workspace-key")?.trim() ||
    request.headers.get("x-workspace-api-key")?.trim();
  if (wsKey) return null;

  return jsonError(
    "Unauthorized. /api/marketplace/publish requires agent token or workspace key.",
    "PUBLISH_UNAUTHORIZED",
    401
  );
}

/**
 * POST /api/marketplace/publish
 * Developer sandbox SDK — validate metadata + MCP tool schema, persist AgentPlugin.
 * Multi-tenant: always bound to resolved Workspace.
 */
export async function POST(request: Request) {
  const denied = await requirePublishAuth(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PublishPluginBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Invalid publish payload.",
      "INVALID_PUBLISH",
      400
    );
  }

  const data = parsed.data;
  const schema = parseAndValidateMcpSchema(data.mcpSchema);
  if (!schema.ok) {
    return jsonError(schema.error, "INVALID_MCP_SCHEMA", 400);
  }

  const workspaceId = await resolveWorkspaceId(
    request,
    data.workspaceId ?? null
  );
  if (!workspaceId) {
    return jsonError(
      "workspaceId or x-workspace-key required for tenant isolation.",
      "WORKSPACE_REQUIRED",
      400
    );
  }

  try {
    const prisma = getPrisma();
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!ws) {
      return jsonError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);
    }

    const existing = await prisma.agentPlugin.findFirst({
      where: {
        workspaceId,
        name: data.name,
        developerId: data.developerId,
      },
      select: { id: true },
    });

    const plugin = existing
      ? await prisma.agentPlugin.update({
          where: { id: existing.id },
          data: {
            walletId: data.walletId,
            pricePerRun: data.pricePerRun,
            mcpSchema: schema.serialized,
            version: data.version,
            description: data.description ?? null,
            isActive: data.isActive,
          },
          select: {
            id: true,
            name: true,
            developerId: true,
            walletId: true,
            pricePerRun: true,
            version: true,
            description: true,
            mcpSchema: true,
            isActive: true,
            revenueUsd: true,
            runCount: true,
            workspaceId: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : await prisma.agentPlugin.create({
          data: {
            name: data.name,
            developerId: data.developerId,
            walletId: data.walletId,
            pricePerRun: data.pricePerRun,
            mcpSchema: schema.serialized,
            version: data.version,
            description: data.description ?? null,
            isActive: data.isActive,
            workspaceId,
          },
          select: {
            id: true,
            name: true,
            developerId: true,
            walletId: true,
            pricePerRun: true,
            version: true,
            description: true,
            mcpSchema: true,
            isActive: true,
            revenueUsd: true,
            runCount: true,
            workspaceId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

    await prisma.developerWallet.upsert({
      where: { developerId: data.developerId },
      create: {
        developerId: data.developerId,
        walletId: data.walletId,
        balanceUsd: 0,
        lifetimeUsd: 0,
      },
      update: {
        walletId: data.walletId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        upserted: Boolean(existing),
        plugin: {
          ...plugin,
          toolCount: schema.document.tools.length,
        },
        wallet: {
          developerId: data.developerId,
          walletId: data.walletId,
        },
      },
      { status: existing ? 200 : 201 }
    );
  } catch (err) {
    console.error("[marketplace/publish] failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Publish failed.",
      "PUBLISH_FAILED",
      503
    );
  }
}
