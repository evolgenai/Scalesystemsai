/**
 * Discord webhook dispatcher — rich embeds for Meta-SRE / admin ops alerts.
 */

import { assertPublicHttpUrl } from "@/lib/security/ssrf";

export type DiscordSreStatus =
  | "success"
  | "failure"
  | "running"
  | "discarded"
  | "partial";

export type DiscordSreAlertInput = {
  title: string;
  status: DiscordSreStatus;
  executionLogs: string[];
  branch?: string | null;
  prUrl?: string | null;
  runId?: string | null;
  workspaceId?: string | null;
  severity?: "critical" | "high" | "medium" | "low" | null;
  directive?: string | null;
};

export type DiscordDispatchResult = {
  ok: boolean;
  status: number;
  skipped: boolean;
  detail: string;
  webhookHost: string | null;
  dispatchedAt: string;
};

const STATUS_COLOR: Record<DiscordSreStatus, number> = {
  success: 0x1db954,
  failure: 0xe74c3c,
  running: 0x3498db,
  discarded: 0xf39c12,
  partial: 0x9b59b6,
};

const STATUS_EMOJI: Record<DiscordSreStatus, string> = {
  success: "✅",
  failure: "❌",
  running: "🔄",
  discarded: "🗑️",
  partial: "⚠️",
};

function resolveWebhookUrl(): string | null {
  const url =
    process.env.DISCORD_SRE_WEBHOOK_URL?.trim() ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL?.trim() ||
    "";
  return url || null;
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildDiscordSreEmbed(
  input: DiscordSreAlertInput
): Record<string, unknown> {
  const logs = (input.executionLogs ?? [])
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-40);
  const logBlock =
    logs.length > 0
      ? truncate(`\`\`\`\n${logs.join("\n")}\n\`\`\``, 1000)
      : "_No execution logs._";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "Status",
      value: `${STATUS_EMOJI[input.status]} \`${input.status.toUpperCase()}\``,
      inline: true,
    },
  ];

  if (input.runId) {
    fields.push({
      name: "Run ID",
      value: `\`${truncate(input.runId, 80)}\``,
      inline: true,
    });
  }
  if (input.workspaceId) {
    fields.push({
      name: "Workspace",
      value: `\`${truncate(input.workspaceId, 64)}\``,
      inline: true,
    });
  }
  if (input.severity) {
    fields.push({
      name: "Severity",
      value: `\`${input.severity}\``,
      inline: true,
    });
  }
  if (input.branch) {
    fields.push({
      name: "Branch",
      value: `\`${truncate(input.branch, 120)}\``,
      inline: false,
    });
  }
  if (input.prUrl) {
    fields.push({
      name: "Pull Request",
      value: truncate(input.prUrl, 256),
      inline: false,
    });
  }
  if (input.directive) {
    fields.push({
      name: "Directive",
      value: truncate(input.directive, 400),
      inline: false,
    });
  }

  fields.push({
    name: "Execution Logs",
    value: logBlock,
    inline: false,
  });

  return {
    title: truncate(input.title, 256),
    color: STATUS_COLOR[input.status],
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: "Scale Systems · Meta-SRE",
    },
  };
}

/**
 * Post a rich Discord embed for SRE pipeline completion / failure.
 * Missing webhook → skipped (ok=true) with console mock for local/dev.
 */
export async function dispatchDiscordSreAlert(
  input: DiscordSreAlertInput
): Promise<DiscordDispatchResult> {
  const dispatchedAt = new Date().toISOString();
  const webhook = resolveWebhookUrl();
  const embed = buildDiscordSreEmbed(input);
  const payload = {
    username: "ScaleSystems SRE",
    content:
      input.status === "failure" || input.status === "discarded"
        ? `**Meta-SRE alert** — ${input.title}`
        : undefined,
    embeds: [embed],
  };

  if (!webhook) {
    console.info("[discord-notifier] mock dispatch (no webhook)", {
      title: input.title,
      status: input.status,
      runId: input.runId,
    });
    return {
      ok: true,
      status: 0,
      skipped: true,
      detail: "mock-console (DISCORD_SRE_WEBHOOK_URL unset)",
      webhookHost: null,
      dispatchedAt,
    };
  }

  let parsed: URL;
  try {
    parsed = assertPublicHttpUrl(webhook, {
      allowLoopback: process.env.NODE_ENV !== "production",
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      skipped: false,
      detail: err instanceof Error ? err.message : "Webhook URL blocked",
      webhookHost: null,
      dispatchedAt,
    };
  }

  if (!parsed.hostname.includes("discord")) {
    return {
      ok: false,
      status: 0,
      skipped: false,
      detail: "Webhook host must be a Discord webhook endpoint.",
      webhookHost: parsed.hostname,
      dispatchedAt,
    };
  }

  try {
    const res = await fetch(parsed.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "ScaleSystems-SRE-Notifier/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });

    return {
      ok: res.ok,
      status: res.status,
      skipped: false,
      detail: res.ok
        ? `Discord accepted embed (HTTP ${res.status}).`
        : `Discord rejected embed (HTTP ${res.status}).`,
      webhookHost: parsed.hostname,
      dispatchedAt,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      skipped: false,
      detail: err instanceof Error ? err.message : "Discord dispatch failed.",
      webhookHost: parsed.hostname,
      dispatchedAt,
    };
  }
}
