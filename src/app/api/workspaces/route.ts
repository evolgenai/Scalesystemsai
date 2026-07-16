import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import {
  generateWorkspaceApiKey,
} from "@/lib/workspace/resolveWorkspace";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

async function requireAgentAuth(request: Request): Promise<NextResponse | null> {
  const gate = request.headers.get("x-agent-auth")?.trim();
  if (gate === "verified") return null;
  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
  }
  return NextResponse.json(
    { success: false, error: "Unauthorized.", code: "WORKSPACE_UNAUTHORIZED" },
    { status: 401 }
  );
}

/** POST /api/workspaces — create tenant workspace + apiKey (once). */
export async function POST(request: Request) {
  const denied = await requireAgentAuth(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body.",
        code: "INVALID_BODY",
      },
      { status: 400 }
    );
  }

  const apiKey = generateWorkspaceApiKey();
  const row = await getPrisma().workspace.create({
    data: { name: parsed.data.name, apiKey },
  });

  return NextResponse.json(
    {
      success: true,
      workspace: {
        id: row.id,
        name: row.name,
        apiKey: row.apiKey,
        createdAt: row.createdAt,
      },
    },
    { status: 201 }
  );
}

/** GET /api/workspaces — list workspaces (no apiKey secrets). */
export async function GET(request: Request) {
  const denied = await requireAgentAuth(request);
  if (denied) return denied;

  const rows = await getPrisma().workspace.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
    take: 100,
  });

  return NextResponse.json({ success: true, count: rows.length, workspaces: rows });
}
