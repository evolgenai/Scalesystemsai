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
import {
  isUsingVaultDevFallback,
  maskApiKey,
  sealWorkspaceCredentials,
} from "@/lib/crypto/vault";

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
  const sealed = sealWorkspaceCredentials({ apiKey });

  const row = await getPrisma().workspace.create({
    data: {
      name: parsed.data.name,
      apiKey,
      credentialCipher: sealed.cipher,
    },
  });

  // Creation response is the only time plaintext apiKey is returned.
  return NextResponse.json(
    {
      success: true,
      workspace: {
        id: row.id,
        name: row.name,
        apiKey: row.apiKey,
        apiKeyMasked: maskApiKey(row.apiKey),
        hasCredentialCipher: true,
        meterBalanceUsd: row.meterBalanceUsd,
        meterSpendUsd: row.meterSpendUsd,
        createdAt: row.createdAt,
      },
      warnings: isUsingVaultDevFallback()
        ? [
            "VAULT_ENCRYPTION_KEY unset — using development vault fallback. Set a 64-char hex key before production.",
          ]
        : undefined,
    },
    { status: 201 }
  );
}

/** GET /api/workspaces — list workspaces (no apiKey / cipher secrets). */
export async function GET(request: Request) {
  const denied = await requireAgentAuth(request);
  if (denied) return denied;

  const rows = await getPrisma().workspace.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      apiKey: true,
      credentialCipher: true,
      meterBalanceUsd: true,
      meterSpendUsd: true,
      meterLastAt: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 100,
  });

  const workspaces = rows.map((row) => ({
    id: row.id,
    name: row.name,
    apiKeyMasked: maskApiKey(row.apiKey),
    hasCredentialCipher: Boolean(row.credentialCipher),
    meterBalanceUsd: row.meterBalanceUsd,
    meterSpendUsd: row.meterSpendUsd,
    meterLastAt: row.meterLastAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return NextResponse.json({
    success: true,
    count: workspaces.length,
    workspaces,
  });
}
