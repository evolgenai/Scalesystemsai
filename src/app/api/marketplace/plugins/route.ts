import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorBody = { success: false; error: string; code: string };

const RegisterPluginSchema = z.object({
  name: z.string().trim().min(2).max(120),
  developerId: z.string().trim().min(1).max(128),
  pricePerRun: z.number().min(0).max(100).optional(),
  mcpSchema: z.union([z.string().min(2), z.record(z.string(), z.unknown())]),
  isActive: z.boolean().optional(),
  workspaceId: z.string().uuid().optional().nullable(),
});

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
  });
}

function normalizeMcpSchema(
  value: string | Record<string, unknown>
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return JSON.stringify({ description: trimmed });
    }
  }
  return JSON.stringify(value);
}

/**
 * GET /api/marketplace/plugins
 * List active marketplace AgentPlugin rows (optional workspace filter).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") !== "false";
    const workspaceId = await resolveWorkspaceId(request, null);

    const prisma = getPrisma();
    const plugins = await prisma.agentPlugin.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        developerId: true,
        pricePerRun: true,
        mcpSchema: true,
        isActive: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      count: plugins.length,
      workspaceId,
      plugins,
    });
  } catch (err) {
    console.error("[marketplace/plugins] GET failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Failed to list plugins.",
      "MARKETPLACE_LIST_FAILED",
      503
    );
  }
}

/**
 * POST /api/marketplace/plugins
 * Mock-register an external developer tool into Scale Systems.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = RegisterPluginSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Invalid plugin payload.",
      "INVALID_PLUGIN",
      400
    );
  }

  const data = parsed.data;
  const workspaceId = await resolveWorkspaceId(
    request,
    data.workspaceId ?? null
  );

  try {
    const prisma = getPrisma();

    if (workspaceId) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true },
      });
      if (!ws) {
        return jsonError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);
      }
    }

    const plugin = await prisma.agentPlugin.create({
      data: {
        name: data.name,
        developerId: data.developerId,
        pricePerRun: data.pricePerRun ?? 0.001,
        mcpSchema: normalizeMcpSchema(data.mcpSchema),
        isActive: data.isActive ?? true,
        workspaceId,
      },
      select: {
        id: true,
        name: true,
        developerId: true,
        pricePerRun: true,
        mcpSchema: true,
        isActive: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, plugin }, { status: 201 });
  } catch (err) {
    console.error("[marketplace/plugins] POST failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Failed to register plugin.",
      "MARKETPLACE_REGISTER_FAILED",
      503
    );
  }
}
