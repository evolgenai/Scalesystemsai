import { assertPublicHttpUrl } from "@/lib/security/ssrf";

export type HealNotifyInput = {
  route: string;
  errorMessage: string;
  patch: string;
  validatorStatus: "APPROVED" | "REJECTED";
  targetFile?: string;
  workspaceName?: string | null;
};

export type ChannelDispatchStatus = {
  channel: "whatsapp" | "telegram" | "webhook";
  status: "sent" | "skipped" | "failed";
  detail?: string;
};

export type NotifyDispatchResult = {
  success: boolean;
  markdown: string;
  dispatches: ChannelDispatchStatus[];
  /** Compact log lines for heal response, e.g. `whatsapp: sent`. */
  logs: string[];
};

export function buildIncidentResolvedMarkdown(input: HealNotifyInput): string {
  const patchPreview = input.patch.slice(0, 1200);
  return [
    `*Incident Resolved!*`,
    `Route: ${input.route}`,
    `Error: ${input.errorMessage.slice(0, 400)}`,
    input.targetFile ? `File: ${input.targetFile}` : null,
    input.workspaceName ? `Workspace: ${input.workspaceName}` : null,
    `Patch Applied: ${patchPreview}${input.patch.length > 1200 ? "…" : ""}`,
    `Validator Status: ${input.validatorStatus}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function postWebhook(
  url: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; detail: string }> {
  try {
    assertPublicHttpUrl(url, {
      allowLoopback: process.env.NODE_ENV !== "production",
    });
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "URL blocked",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    return {
      ok: res.ok,
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

/**
 * Dispatch incident-resolved notifications (Telegram/WhatsApp/webhook mocks).
 * Missing URLs → logged as sent to console mock (dev-friendly).
 */
export async function dispatchHealNotifications(
  input: HealNotifyInput
): Promise<NotifyDispatchResult> {
  const markdown = buildIncidentResolvedMarkdown(input);
  const payload = {
    type: "heal.incident_resolved",
    markdown,
    route: input.route,
    errorMessage: input.errorMessage,
    patch: input.patch,
    validatorStatus: input.validatorStatus,
    targetFile: input.targetFile ?? null,
    workspaceName: input.workspaceName ?? null,
    at: new Date().toISOString(),
  };

  const dispatches: ChannelDispatchStatus[] = [];

  const channels: Array<{
    channel: ChannelDispatchStatus["channel"];
    envKey: string;
  }> = [
    { channel: "whatsapp", envKey: "HEAL_WHATSAPP_WEBHOOK_URL" },
    { channel: "telegram", envKey: "HEAL_TELEGRAM_WEBHOOK_URL" },
    { channel: "webhook", envKey: "HEAL_NOTIFY_WEBHOOK_URL" },
  ];

  for (const { channel, envKey } of channels) {
    const url = process.env[envKey]?.trim();
    if (!url) {
      console.info(`[heal-notify:${channel}] mock dispatch →`, markdown);
      dispatches.push({
        channel,
        status: "sent",
        detail: "mock-console (no webhook URL configured)",
      });
      continue;
    }

    const result = await postWebhook(url, { ...payload, channel });
    dispatches.push({
      channel,
      status: result.ok ? "sent" : "failed",
      detail: result.detail,
    });
  }

  const logs = dispatches.map((d) => `${d.channel}: ${d.status}`);
  return {
    success: dispatches.every((d) => d.status === "sent"),
    markdown,
    dispatches,
    logs,
  };
}
