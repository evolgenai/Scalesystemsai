/**
 * POST /api/spatial/morph
 * Synthesize a composite agent/tool from Spatial Universe source node IDs.
 * Deducts ⚡ 250 GAS and persists the morphed tool definition on the workspace.
 *
 * Auth: x-workspace-key (required)
 * Body: { sourceNodeIds: string[], workspaceId?: string }
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { InsufficientGasError } from "@/lib/billing/gasMeter";
import {
  SYNTHESIS_GAS_COST,
  synthesizeMorphedTool,
} from "@/lib/spatial/objectMorph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  sourceNodeIds: z
    .array(z.string().trim().min(1).max(128))
    .min(2)
    .max(12),
  workspaceId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ??
        "sourceNodeIds must include at least two node IDs.",
      "INVALID_BODY",
      400
    );
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    parsed.data.workspaceId ?? null
  );
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  try {
    const tool = await synthesizeMorphedTool({
      workspaceId: gate.workspaceId,
      sourceNodeIds: parsed.data.sourceNodeIds,
    });

    return apiSuccess(
      {
        tool,
        gasCost: SYNTHESIS_GAS_COST,
        workspaceId: gate.workspaceId,
      },
      200,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    if (err instanceof InsufficientGasError) {
      return apiError(err.message, err.code, 402, {
        "x-workspace-bound": gate.workspaceId,
      });
    }
    const message =
      err instanceof Error ? err.message : "Object synthesis failed.";
    const badRequest =
      message.toLowerCase().includes("at least two") ||
      message.toLowerCase().includes("required");
    console.error("[spatial/morph] failed", err);
    return apiError(
      message,
      badRequest ? "INVALID_MORPH" : "MORPH_FAILED",
      badRequest ? 400 : 500
    );
  }
}
