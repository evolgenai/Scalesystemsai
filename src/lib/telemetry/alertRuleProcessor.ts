/**
 * Notification rule processor — evaluates workspace telemetry alert thresholds.
 */

import { getPrisma } from "@/lib/prisma";
import type { TelemetryAlertRule, Prisma } from "@prisma/client";

export const ALERT_METRICS = [
  "compute_gas_cost",
  "meter_spend_usd",
  "meter_balance_usd",
  "unresolved_errors",
  "plugin_fee_usd_1h",
] as const;

export type AlertMetric = (typeof ALERT_METRICS)[number];

export const ALERT_OPERATORS = ["gt", "gte", "lt", "lte", "eq"] as const;
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

export type AlertChannels = {
  webhook?: string | null;
  telegram?: boolean;
  whatsapp?: boolean;
};

export type WorkspaceMetricSnapshot = {
  workspaceId: string;
  computedAt: string;
  values: Record<AlertMetric, number>;
};

export type AlertRuleEvaluation = {
  ruleId: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  observed: number;
  triggered: boolean;
  cooledDown: boolean;
  channels: AlertChannels;
};

export type ProcessAlertRulesResult = {
  workspaceId: string;
  snapshot: WorkspaceMetricSnapshot;
  evaluations: AlertRuleEvaluation[];
  fired: AlertRuleEvaluation[];
};

function isAlertMetric(v: string): v is AlertMetric {
  return (ALERT_METRICS as readonly string[]).includes(v);
}

function isAlertOperator(v: string): v is AlertOperator {
  return (ALERT_OPERATORS as readonly string[]).includes(v);
}

export function parseAlertChannels(raw: unknown): AlertChannels {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const channels: AlertChannels = {};
  if (typeof o.webhook === "string" && o.webhook.trim()) {
    channels.webhook = o.webhook.trim();
  } else if (o.webhook === null) {
    channels.webhook = null;
  }
  if (typeof o.telegram === "boolean") channels.telegram = o.telegram;
  if (typeof o.whatsapp === "boolean") channels.whatsapp = o.whatsapp;
  return channels;
}

export function compareThreshold(
  observed: number,
  operator: AlertOperator,
  threshold: number
): boolean {
  switch (operator) {
    case "gt":
      return observed > threshold;
    case "gte":
      return observed >= threshold;
    case "lt":
      return observed < threshold;
    case "lte":
      return observed <= threshold;
    case "eq":
      return Math.abs(observed - threshold) < Number.EPSILON * 8;
    default:
      return false;
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Build live metric snapshot for a workspace (meter + error + recent plugin fees).
 */
export async function collectWorkspaceMetricSnapshot(
  workspaceId: string
): Promise<WorkspaceMetricSnapshot> {
  const prisma = getPrisma();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [workspace, unresolvedErrors, feeAgg] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, meterSpendUsd: true, meterBalanceUsd: true },
    }),
    prisma.appErrorLog.count({
      where: { workspaceId, resolved: false },
    }),
    prisma.workspaceMeterEvent.aggregate({
      where: {
        workspaceId,
        createdAt: { gte: oneHourAgo },
        source: "plugin",
      },
      _sum: { feeUsd: true },
    }),
  ]);

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found for metric snapshot.`);
  }

  const meterSpend = round6(workspace.meterSpendUsd);
  const meterBalance = round6(workspace.meterBalanceUsd);
  const pluginFee1h = round6(feeAgg._sum.feeUsd ?? 0);

  return {
    workspaceId,
    computedAt: new Date().toISOString(),
    values: {
      compute_gas_cost: meterSpend,
      meter_spend_usd: meterSpend,
      meter_balance_usd: meterBalance,
      unresolved_errors: unresolvedErrors,
      plugin_fee_usd_1h: pluginFee1h,
    },
  };
}

function evaluateRule(
  rule: TelemetryAlertRule,
  snapshot: WorkspaceMetricSnapshot,
  nowMs: number
): AlertRuleEvaluation | null {
  if (!rule.enabled) return null;
  if (!isAlertMetric(rule.metric) || !isAlertOperator(rule.operator)) {
    return null;
  }

  const observed = snapshot.values[rule.metric];
  const triggered = compareThreshold(observed, rule.operator, rule.threshold);
  const cooldownMs = Math.max(0, rule.cooldownSec) * 1000;
  const lastFired = rule.lastFiredAt?.getTime() ?? 0;
  const cooledDown = lastFired > 0 && nowMs - lastFired < cooldownMs;

  return {
    ruleId: rule.id,
    name: rule.name,
    metric: rule.metric,
    operator: rule.operator,
    threshold: rule.threshold,
    observed,
    triggered,
    cooledDown,
    channels: parseAlertChannels(rule.channelsJson),
  };
}

/**
 * Evaluate all enabled rules for a workspace.
 * Optionally stamps lastFiredAt for newly fired (non-cooldown) rules.
 */
export async function processWorkspaceAlertRules(
  workspaceId: string,
  options?: { markFired?: boolean }
): Promise<ProcessAlertRulesResult> {
  const prisma = getPrisma();
  const markFired = options?.markFired === true;
  const now = new Date();
  const nowMs = now.getTime();

  const [snapshot, rules] = await Promise.all([
    collectWorkspaceMetricSnapshot(workspaceId),
    prisma.telemetryAlertRule.findMany({
      where: { workspaceId, enabled: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const evaluations: AlertRuleEvaluation[] = [];
  for (const rule of rules) {
    const ev = evaluateRule(rule, snapshot, nowMs);
    if (ev) evaluations.push(ev);
  }

  const fired = evaluations.filter((e) => e.triggered && !e.cooledDown);

  if (markFired && fired.length > 0) {
    await prisma.$transaction(
      fired.map((f) =>
        prisma.telemetryAlertRule.update({
          where: { id: f.ruleId },
          data: { lastFiredAt: now },
        })
      )
    );
  }

  return { workspaceId, snapshot, evaluations, fired };
}

export type UpsertAlertRuleInput = {
  id?: string | null;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  channels?: AlertChannels;
  enabled?: boolean;
  cooldownSec?: number;
};

/**
 * Resilient create/update — prefers id match, else unique (workspaceId, name).
 */
export async function upsertWorkspaceAlertRule(
  workspaceId: string,
  input: UpsertAlertRuleInput
): Promise<TelemetryAlertRule> {
  const prisma = getPrisma();
  const channelsJson = (input.channels ?? {}) as Prisma.InputJsonValue;
  const enabled = input.enabled !== false;
  const cooldownSec =
    typeof input.cooldownSec === "number" && Number.isFinite(input.cooldownSec)
      ? Math.max(0, Math.min(86_400, Math.trunc(input.cooldownSec)))
      : 300;

  const dataCore = {
    name: input.name.trim(),
    metric: input.metric,
    operator: input.operator,
    threshold: input.threshold,
    channelsJson,
    enabled,
    cooldownSec,
  };

  if (input.id) {
    const existing = await prisma.telemetryAlertRule.findFirst({
      where: { id: input.id, workspaceId },
    });
    if (existing) {
      return prisma.telemetryAlertRule.update({
        where: { id: existing.id },
        data: dataCore,
      });
    }
  }

  return prisma.telemetryAlertRule.upsert({
    where: {
      workspaceId_name: { workspaceId, name: dataCore.name },
    },
    create: {
      workspaceId,
      ...dataCore,
    },
    update: dataCore,
  });
}

export async function listWorkspaceAlertRules(
  workspaceId: string
): Promise<TelemetryAlertRule[]> {
  return getPrisma().telemetryAlertRule.findMany({
    where: { workspaceId },
    orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
  });
}

export function serializeAlertRule(rule: TelemetryAlertRule) {
  return {
    id: rule.id,
    workspaceId: rule.workspaceId,
    name: rule.name,
    metric: rule.metric,
    operator: rule.operator,
    threshold: rule.threshold,
    channels: parseAlertChannels(rule.channelsJson),
    enabled: rule.enabled,
    cooldownSec: rule.cooldownSec,
    lastFiredAt: rule.lastFiredAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
