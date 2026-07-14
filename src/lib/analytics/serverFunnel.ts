type ServerFunnelEvent = {
  event: string;
  path?: string;
  plan?: string;
  provider?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

/** Server-side funnel logger used by auth/payment route handlers. */
export function trackServerFunnel(payload: ServerFunnelEvent): void {
  console.info(
    "[funnel:server]",
    JSON.stringify({
      ...payload,
      ts: new Date().toISOString(),
    })
  );
}
