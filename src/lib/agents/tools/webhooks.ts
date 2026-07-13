export type WebhookDispatchReceipt = {
  ok: boolean;
  status: number;
  targetUrl: string;
  receipt: string;
  responseSnippet?: string;
  dispatchedAt: string;
};

export async function dispatchAgentWebhook(
  targetUrl: string,
  payload: Record<string, unknown>
): Promise<string> {
  const dispatchedAt = new Date().toISOString();

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ScaleSystems-Agent-Orchestrator/1.0",
      },
      body: JSON.stringify({
        ...payload,
        dispatchedAt,
        source: "ScaleAgentOrchestrator",
      }),
    });

    const responseText = await response.text();
    const receipt: WebhookDispatchReceipt = {
      ok: response.ok,
      status: response.status,
      targetUrl,
      receipt: response.ok
        ? `Webhook accepted by ${targetUrl} (HTTP ${response.status}).`
        : `Webhook rejected by ${targetUrl} (HTTP ${response.status}).`,
      responseSnippet: responseText.slice(0, 500) || undefined,
      dispatchedAt,
    };

    return JSON.stringify(receipt, null, 2);
  } catch (error) {
    const receipt: WebhookDispatchReceipt = {
      ok: false,
      status: 0,
      targetUrl,
      receipt:
        error instanceof Error
          ? `Webhook dispatch failed: ${error.message}`
          : "Webhook dispatch failed: unknown transport error.",
      dispatchedAt,
    };

    return JSON.stringify(receipt, null, 2);
  }
}
