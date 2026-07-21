/**
 * PayPal Orders API v2 client + webhook signature verification.
 */

import { createHash, createVerify, X509Certificate } from "node:crypto";

const PAYPAL_API_LIVE = "https://api-m.paypal.com";
const PAYPAL_API_SANDBOX = "https://api-m.sandbox.paypal.com";

export type PayPalAccessToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type PayPalOrder = {
  id: string;
  status: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: {
      captures?: Array<{ id: string; status: string }>;
    };
  }>;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isPayPalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
      process.env.PAYPAL_CLIENT_SECRET?.trim()
  );
}

export function getPayPalApiBase(): string {
  const mode = (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase();
  if (mode === "live" || mode === "production") return PAYPAL_API_LIVE;
  return PAYPAL_API_SANDBOX;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not configured.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as PayPalAccessToken;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function paypalFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

export async function createPayPalOrder(input: {
  amountUsd: number;
  currency?: string;
  customId: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PayPalOrder> {
  const currency = (input.currency ?? "USD").toUpperCase();
  const value = input.amountUsd.toFixed(2);

  return paypalFetch<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.customId.slice(0, 256),
          custom_id: input.customId.slice(0, 127),
          description: input.description.slice(0, 127),
          amount: {
            currency_code: currency,
            value,
          },
        },
      ],
      application_context: {
        brand_name: "ScaleSystems",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalOrder> {
  return paypalFetch<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    { method: "POST", body: "{}" }
  );
}

export async function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  return paypalFetch<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" }
  );
}

export function extractPayPalCaptureId(order: PayPalOrder): string | null {
  const captures = order.purchase_units?.[0]?.payments?.captures;
  const completed = captures?.find((c) => c.status === "COMPLETED") ?? captures?.[0];
  return completed?.id ?? null;
}

export function isPayPalOrderPaid(order: PayPalOrder): boolean {
  if (order.status === "COMPLETED") return true;
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  return captures.some((c) => c.status === "COMPLETED");
}

/**
 * Verify PayPal webhook transmission signature (RSA-SHA256 over CRC32 body).
 * Requires PAYPAL_WEBHOOK_ID. Rejects when cert URL is not on paypal.com.
 */
export async function verifyPayPalWebhookSignature(input: {
  headers: Headers;
  rawBody: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    return { ok: false, reason: "PAYPAL_WEBHOOK_ID is not configured." };
  }

  const transmissionId = input.headers.get("paypal-transmission-id");
  const timestamp = input.headers.get("paypal-transmission-time");
  const certUrl = input.headers.get("paypal-cert-url");
  const transmissionSig = input.headers.get("paypal-transmission-sig");
  const authAlgo = input.headers.get("paypal-auth-algo") ?? "SHA256withRSA";

  if (!transmissionId || !timestamp || !certUrl || !transmissionSig) {
    return { ok: false, reason: "Missing PayPal transmission signature headers." };
  }

  let parsedCertUrl: URL;
  try {
    parsedCertUrl = new URL(certUrl);
  } catch {
    return { ok: false, reason: "Invalid paypal-cert-url." };
  }

  const host = parsedCertUrl.hostname.toLowerCase();
  if (
    parsedCertUrl.protocol !== "https:" ||
    !(host === "api.paypal.com" ||
      host.endsWith(".paypal.com") ||
      host === "api.sandbox.paypal.com" ||
      host.endsWith(".sandbox.paypal.com"))
  ) {
    return { ok: false, reason: "paypal-cert-url host is not allowlisted." };
  }

  // Prefer PayPal's verify-webhook-signature API (authoritative).
  try {
    const event = JSON.parse(input.rawBody) as Record<string, unknown>;
    const result = await paypalFetch<{ verification_status: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: timestamp,
          webhook_id: webhookId,
          webhook_event: event,
        }),
      }
    );

    if (result.verification_status === "SUCCESS") {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `PayPal verification_status=${result.verification_status}`,
    };
  } catch (err) {
    // Fallback: local CRC32 + X509 verify if API verify fails (network).
    try {
      const certPem = await fetch(certUrl).then(async (r) => {
        if (!r.ok) throw new Error(`cert fetch ${r.status}`);
        return r.text();
      });
      const crc = crc32(Buffer.from(input.rawBody, "utf8"));
      const message = `${transmissionId}|${timestamp}|${webhookId}|${crc}`;
      const verifier = createVerify("RSA-SHA256");
      verifier.update(message);
      verifier.end();
      const cert = new X509Certificate(certPem);
      const valid = verifier.verify(cert.publicKey, transmissionSig, "base64");
      if (valid) return { ok: true };
      return { ok: false, reason: "Local RSA signature mismatch." };
    } catch (fallbackErr) {
      return {
        ok: false,
        reason:
          fallbackErr instanceof Error
            ? fallbackErr.message
            : err instanceof Error
              ? err.message
              : "Webhook signature verification failed.",
      };
    }
  }
}

/** IEEE CRC32 (PayPal webhook body checksum). */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
