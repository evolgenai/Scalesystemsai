import { z } from "zod";
import {
  requireWorkspaceApiKeyGate,
  type WorkspaceGateDenied,
} from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiFail, apiOk } from "@/lib/http/apiEnvelope";
import {
  listWorkspaceAlertRules,
  processWorkspaceAlertRules,
  serializeAlertRule,
  upsertWorkspaceAlertRule,
  type UpsertAlertRuleInput,
} from "@/lib/telemetry/alertRuleProcessor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MetricSchema = z.enum([
  "compute_gas_cost",
  "meter_spend_usd",
  "meter_balance_usd",
  "unresolved_errors",
  "plugin_fee_usd_1h",
]);

const OperatorSchema = z.enum(["gt", "gte", "lt", "lte", "eq"]);

const ChannelsSchema = z
  .object({
    webhook: z.string().url().max(2048).nullable().optional(),
    telegram: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
  })
  .strict()
  .optional();

const RuleBodySchema = z
  .object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1).max(128),
    metric: MetricSchema,
    operator: OperatorSchema.default("gt"),
    threshold: z.number().finite(),
    channels: ChannelsSchema,
    enabled: z.boolean().optional(),
    cooldownSec: z.number().int().min(0).max(86_400).optional(),
    workspaceId: z.string().uuid().optional().nullable(),
    /** When true, evaluate rules after write and stamp lastFiredAt. */
    evaluate: z.boolean().optional(),
  })
  .strict();

const BulkBodySchema = z
  .object({
    workspaceId: z.string().uuid().optional().nullable(),
    rules: z.array(RuleBodySchema.omit({ workspaceId: true, evaluate: true })).min(1).max(50),
    evaluate: z.boolean().optional(),
  })
  .strict();

function gateFail(denied: WorkspaceGateDenied) {
  return apiFail(denied.message, denied.code, denied.status, {
    "x-workspace-bound": "denied",
  });
}

/**
 * GET /api/telemetry/alerts
 * List workspace telemetry warning rules. Requires x-workspace-key.
 * Query: ?evaluate=1 to also run the rule processor against live metrics.
 */
export async function GET(request: Request) {
  const gate = await requireWorkspaceApiKeyGate(request, null);
  if (!gate.ok) return gateFail(gate);

  const url = new URL(request.url);
  const evaluate = url.searchParams.get("evaluate") === "1";

  try {
    const rules = await listWorkspaceAlertRules(gate.workspaceId);
    const serialized = rules.map(serializeAlertRule);

    if (!evaluate) {
      return apiOk(
        {
          workspaceId: gate.workspaceId,
          authMode: gate.authMode,
          count: serialized.length,
          rules: serialized,
        },
        {
          headers: { "x-workspace-bound": gate.workspaceId },
        }
      );
    }

    const processed = await processWorkspaceAlertRules(gate.workspaceId, {
      markFired: false,
    });

    return apiOk(
      {
        workspaceId: gate.workspaceId,
        authMode: gate.authMode,
        count: serialized.length,
        rules: serialized,
        evaluation: {
          snapshot: processed.snapshot,
          evaluations: processed.evaluations,
          fired: processed.fired,
        },
      },
      {
        headers: { "x-workspace-bound": gate.workspaceId },
      }
    );
  } catch (err) {
    console.error("[telemetry/alerts] GET failed:", err);
    return apiFail(
      err instanceof Error ? err.message : "Unable to load alert rules.",
      "TELEMETRY_ALERTS_LIST_FAILED",
      503
    );
  }
}

/**
 * POST /api/telemetry/alerts
 * Create or upsert one rule, or bulk upsert via `{ rules: [...] }`.
 * Requires x-workspace-key; blocks cross-tenant claimed workspaceId mismatch.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiFail("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const isBulk =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as { rules?: unknown }).rules);

  if (isBulk) {
    const parsed = BulkBodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiFail(
        parsed.error.issues[0]?.message ?? "Invalid body.",
        "INVALID_BODY",
        400
      );
    }

    const gate = await requireWorkspaceApiKeyGate(
      request,
      parsed.data.workspaceId
    );
    if (!gate.ok) return gateFail(gate);

    try {
      const saved = [];
      for (const rule of parsed.data.rules) {
        const input: UpsertAlertRuleInput = {
          id: rule.id,
          name: rule.name,
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          channels: rule.channels,
          enabled: rule.enabled,
          cooldownSec: rule.cooldownSec,
        };
        saved.push(await upsertWorkspaceAlertRule(gate.workspaceId, input));
      }

      const serialized = saved.map(serializeAlertRule);
      let evaluation = null;
      if (parsed.data.evaluate) {
        const processed = await processWorkspaceAlertRules(gate.workspaceId, {
          markFired: true,
        });
        evaluation = {
          snapshot: processed.snapshot,
          evaluations: processed.evaluations,
          fired: processed.fired,
        };
      }

      return apiOk(
        {
          workspaceId: gate.workspaceId,
          authMode: gate.authMode,
          count: serialized.length,
          rules: serialized,
          evaluation,
        },
        {
          status: 201,
          headers: { "x-workspace-bound": gate.workspaceId },
        }
      );
    } catch (err) {
      console.error("[telemetry/alerts] bulk POST failed:", err);
      return apiFail(
        err instanceof Error ? err.message : "Unable to persist alert rules.",
        "TELEMETRY_ALERTS_WRITE_FAILED",
        503
      );
    }
  }

  const parsed = RuleBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body.",
      "INVALID_BODY",
      400
    );
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    parsed.data.workspaceId
  );
  if (!gate.ok) return gateFail(gate);

  try {
    const rule = await upsertWorkspaceAlertRule(gate.workspaceId, {
      id: parsed.data.id,
      name: parsed.data.name,
      metric: parsed.data.metric,
      operator: parsed.data.operator,
      threshold: parsed.data.threshold,
      channels: parsed.data.channels,
      enabled: parsed.data.enabled,
      cooldownSec: parsed.data.cooldownSec,
    });

    let evaluation = null;
    if (parsed.data.evaluate) {
      const processed = await processWorkspaceAlertRules(gate.workspaceId, {
        markFired: true,
      });
      evaluation = {
        snapshot: processed.snapshot,
        evaluations: processed.evaluations,
        fired: processed.fired,
      };
    }

    return apiOk(
      {
        workspaceId: gate.workspaceId,
        authMode: gate.authMode,
        rule: serializeAlertRule(rule),
        evaluation,
      },
      {
        status: 201,
        headers: { "x-workspace-bound": gate.workspaceId },
      }
    );
  } catch (err) {
    console.error("[telemetry/alerts] POST failed:", err);
    return apiFail(
      err instanceof Error ? err.message : "Unable to persist alert rule.",
      "TELEMETRY_ALERTS_WRITE_FAILED",
      503
    );
  }
}
