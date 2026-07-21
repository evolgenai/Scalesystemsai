/**
 * GET  /api/cli — CLI gateway discovery (endpoints + auth contract)
 * POST /api/cli — alias for key mint when body.action === "keys" (compat)
 *
 * Tenant isolation: workspace API key (x-workspace-key) for mint;
 * CLI keys (Bearer / x-cli-key) for deploy.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCliApiKey } from "@/lib/auth/cliApiKey";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { hashCliApiKey } from "@/lib/billing/gasMeter";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MintKeySchema = z.object({
  action: z.literal("keys").optional(),
  name: z.string().trim().min(1).max(128).default("cli"),
});

export async function GET() {
  return apiSuccess({
    gateway: "scalesystems-cli",
    endpoints: {
      keys: { method: "POST", path: "/api/cli/keys" },
      deploy: { method: "POST", path: "/api/cli/deploy" },
    },
    auth: {
      mint: "x-workspace-key",
      deploy: "Authorization: Bearer <ss_cli_...> | x-cli-key",
    },
  });
}

/**
 * POST /api/cli — mint a CLI key when action=keys (compat with /api/cli/keys).
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

  const parsed = MintKeySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      "INVALID_BODY",
      400
    );
  }

  const rawKey = generateCliApiKey();
  const keyHash = hashCliApiKey(rawKey);

  try {
    const row = await withPrisma(
      (db) =>
        db.apiKey.create({
          data: {
            workspaceId: gate.workspaceId,
            keyHash,
            name: parsed.data.name,
          },
          select: {
            id: true,
            name: true,
            workspaceId: true,
            createdAt: true,
          },
        }),
      "cli.keys.create"
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          workspaceId: row.workspaceId,
          createdAt: row.createdAt,
          /** One-time plaintext — store client-side; never retrievable again. */
          apiKey: rawKey,
        },
      },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
          "x-workspace-id": gate.workspaceId,
        },
      }
    );
  } catch (err) {
    console.error("[api/cli] POST keys failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to mint CLI API key.",
      "CLI_KEY_MINT_FAILED",
      503
    );
  }
}
