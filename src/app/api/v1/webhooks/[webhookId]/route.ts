/**
 * POST /api/v1/webhooks/[webhookId]
 *
 * High-speed inbound webhook trigger router:
 * 1. Accept arbitrary JSON payloads
 * 2. Validate webhookSecret (header / Bearer)
 * 3. Deduct 10 GAS (webhook_trigger)
 * 4. Async-dispatch payload to runWorkflowBlueprint
 *
 * Auth: InboundWebhook.webhookSecret (not x-workspace-key).
 */

import { after } from "next/server";
import {
  deductGas,
  InsufficientGasError,
  INSUFFICIENT_GAS_MESSAGE,
} from "@/lib/billing/gasMeter";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  extractWebhookSecret,
  safeEqualSecret,
} from "@/lib/integrations/credentials";
import { withPrisma } from "@/lib/prisma";
import { runWorkflowBlueprint } from "@/lib/swarm/workflowRunner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ webhookId: string }> };

async function parseArbitraryJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  let parsed: unknown = JSON.parse(text);
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      /* keep string payload */
    }
  }
  return parsed;
}

function asTriggerPayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return { payload: raw };
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { webhookId } = await ctx.params;
  const id = webhookId?.trim();
  if (!id) {
    return apiError("Webhook id is required.", "INVALID_ID", 400);
  }

  const providedSecret = extractWebhookSecret(request);
  if (!providedSecret) {
    return apiError(
      "Missing webhook secret (x-webhook-secret or Authorization: Bearer).",
      "WEBHOOK_SECRET_REQUIRED",
      401
    );
  }

  let hook: {
    id: string;
    workspaceId: string;
    webhookSecret: string;
    targetWorkflowBlueprintId: string;
    name: string;
  } | null;

  try {
    hook = await withPrisma(
      (db) =>
        db.inboundWebhook.findUnique({
          where: { id },
          select: {
            id: true,
            workspaceId: true,
            webhookSecret: true,
            targetWorkflowBlueprintId: true,
            name: true,
          },
        }),
      "webhooks.inbound.load"
    );
  } catch (err) {
    console.error("[api/v1/webhooks] lookup failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Webhook lookup failed.",
      "WEBHOOK_LOOKUP_FAILED",
      503
    );
  }

  if (!hook || !safeEqualSecret(providedSecret, hook.webhookSecret)) {
    return apiError(
      "Invalid webhook secret.",
      "WEBHOOK_SECRET_INVALID",
      401
    );
  }

  let payload: unknown;
  try {
    payload = await parseArbitraryJson(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const triggerPayload = asTriggerPayload(payload);

  // Verify target blueprint still belongs to the same workspace.
  try {
    const blueprint = await withPrisma(
      (db) =>
        db.workflowBlueprint.findFirst({
          where: {
            id: hook.targetWorkflowBlueprintId,
            workspaceId: hook.workspaceId,
          },
          select: { id: true, status: true },
        }),
      "webhooks.inbound.blueprint"
    );

    if (!blueprint) {
      return apiError(
        "Target workflow blueprint not found for this webhook.",
        "WEBHOOK_TARGET_MISSING",
        404
      );
    }
    if (blueprint.status === "ARCHIVED") {
      return apiError(
        "Target workflow blueprint is archived.",
        "WEBHOOK_TARGET_ARCHIVED",
        409
      );
    }
  } catch (err) {
    console.error("[api/v1/webhooks] blueprint check failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Blueprint validation failed.",
      "WEBHOOK_TARGET_CHECK_FAILED",
      503
    );
  }

  let gas;
  try {
    gas = await deductGas(hook.workspaceId, "webhook_trigger");
  } catch (err) {
    if (err instanceof InsufficientGasError) {
      return apiError(INSUFFICIENT_GAS_MESSAGE, "INSUFFICIENT_GAS", 402);
    }
    console.error("[api/v1/webhooks] gas deduct failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Gas deduction failed.",
      "GAS_DEDUCT_FAILED",
      503
    );
  }

  const triggeredAt = new Date();
  try {
    await withPrisma(
      (db) =>
        db.inboundWebhook.update({
          where: { id: hook.id },
          data: {
            requestCount: { increment: 1 },
            lastTriggeredAt: triggeredAt,
          },
        }),
      "webhooks.inbound.bump"
    );
  } catch (err) {
    console.error("[api/v1/webhooks] counter bump failed:", err);
    // Non-fatal — dispatch still proceeds.
  }

  const workspaceId = hook.workspaceId;
  const blueprintId = hook.targetWorkflowBlueprintId;
  const webhookName = hook.name;
  const inboundWebhookId = hook.id;
  const triggeredIso = triggeredAt.toISOString();

  after(() => {
    void runWorkflowBlueprint({
      workspaceId,
      blueprintId,
      triggerPayload: {
        ...triggerPayload,
        _inboundWebhook: {
          id: inboundWebhookId,
          name: webhookName,
          triggeredAt: triggeredIso,
        },
      },
    }).catch((err) => {
      console.error("[api/v1/webhooks] async workflow dispatch failed:", {
        webhookId: inboundWebhookId,
        blueprintId,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  });

  return apiSuccess(
    {
      data: {
        accepted: true,
        webhookId: inboundWebhookId,
        workspaceId,
        targetWorkflowBlueprintId: blueprintId,
        gas: {
          amount: gas.amount,
          balanceAfter: gas.balanceAfter,
          ledgerId: gas.ledgerId,
        },
        dispatched: true,
      },
    },
    202,
    {
      "x-webhook-id": inboundWebhookId,
      "x-workspace-id": workspaceId,
      "x-blueprint-id": blueprintId,
    }
  );
}
