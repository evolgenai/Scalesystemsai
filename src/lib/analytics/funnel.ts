export type FunnelEventName =
  | "auth_modal_open"
  | "auth_signup_clicked"
  | "auth_signin_clicked"
  | "auth_signup_submit"
  | "auth_signin_submit"
  | "auth_success"
  | "auth_failure"
  | "pricing_tier_clicked"
  | "stream_launch"
  | "stream_quota_hit"
  | "checkout_modal_open"
  | "checkout_proceed"
  | "checkout_cancel"
  | "checkout_stripe_start"
  | "checkout_bvnk_start"
  | "checkout_redirect"
  | "redirected_to_payment"
  | "payment_success_landing"
  | "payment_cancelled_landing";

export type FunnelEventPayload = {
  event: FunnelEventName;
  path?: string;
  plan?: string;
  provider?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Fire-and-forget funnel tracker for auth/payment drop-off analysis.
 * Never throws into the UI path.
 */
export function trackFunnelEvent(payload: FunnelEventPayload): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    ...payload,
    path: payload.path ?? window.location.pathname,
    ts: new Date().toISOString(),
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/funnel", blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch("/api/analytics/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
