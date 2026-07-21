/**
 * Bitcoin Lightning (LND REST) invoice engine + webhook MAC verification.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type LightningInvoice = {
  paymentRequest: string;
  paymentHash: string;
  rHash: string;
  amountSats: number;
  expiresAt: string;
  addIndex?: string;
};

export type LightningInvoiceStatus = {
  paymentHash: string;
  settled: boolean;
  settleDate?: number;
  amtPaidSat?: number;
  state?: string;
};

function lndBaseUrl(): string {
  const base =
    process.env.LIGHTNING_LND_REST_URL?.trim() ||
    process.env.LND_REST_URL?.trim() ||
    "";
  return base.replace(/\/$/, "");
}

function lndMacaroon(): string {
  return (
    process.env.LIGHTNING_LND_MACAROON_HEX?.trim() ||
    process.env.LND_MACAROON_HEX?.trim() ||
    ""
  );
}

export function isLightningConfigured(): boolean {
  return Boolean(lndBaseUrl() && lndMacaroon());
}

async function lndFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = lndBaseUrl();
  const macaroon = lndMacaroon();
  if (!base || !macaroon) {
    throw new Error("Lightning LND REST URL / macaroon not configured.");
  }

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Grpc-Metadata-macaroon": macaroon,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // LND often uses self-signed TLS; Node fetch respects NODE_TLS_REJECT_UNAUTHORIZED.
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LND ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

function bytesToHex(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("hex");
}

function base64ToHex(b64: string): string {
  return bytesToHex(Buffer.from(b64, "base64"));
}

/**
 * Create a Bolt11 invoice via LND REST POST /v1/invoices.
 */
export async function createLightningInvoice(input: {
  amountSats: number;
  memo: string;
  expirySeconds?: number;
}): Promise<LightningInvoice> {
  const expiry = input.expirySeconds ?? 3600;
  const data = await lndFetch<{
    r_hash: string;
    payment_request: string;
    add_index?: string;
    payment_addr?: string;
  }>("/v1/invoices", {
    method: "POST",
    body: JSON.stringify({
      value: String(Math.max(1, Math.trunc(input.amountSats))),
      memo: input.memo.slice(0, 1024),
      expiry: String(expiry),
      private: false,
    }),
  });

  const paymentHash = base64ToHex(data.r_hash);
  return {
    paymentRequest: data.payment_request,
    paymentHash,
    rHash: data.r_hash,
    amountSats: Math.trunc(input.amountSats),
    expiresAt: new Date(Date.now() + expiry * 1000).toISOString(),
    addIndex: data.add_index,
  };
}

/**
 * Lookup invoice settlement by payment hash (hex).
 * LND expects URL-safe base64 of the 32-byte hash in the path.
 */
export async function lookupLightningInvoice(
  paymentHashHex: string
): Promise<LightningInvoiceStatus> {
  const hex = paymentHashHex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("paymentHash must be 64 hex characters.");
  }

  const rHashB64 = Buffer.from(hex, "hex")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const data = await lndFetch<{
    r_hash?: string;
    settled?: boolean;
    state?: string;
    settle_date?: string;
    amt_paid_sat?: string;
  }>(`/v1/invoice/${rHashB64}`, { method: "GET" });

  const settled =
    data.settled === true ||
    data.state === "SETTLED" ||
    String(data.state).toUpperCase() === "SETTLED";

  return {
    paymentHash: hex,
    settled,
    settleDate: data.settle_date ? Number(data.settle_date) : undefined,
    amtPaidSat: data.amt_paid_sat ? Number(data.amt_paid_sat) : undefined,
    state: data.state,
  };
}

/**
 * Verify Lightning node webhook HMAC (sha256 hex) before trusting settlement.
 * Header: x-lightning-signature or x-webhook-signature
 */
export function verifyLightningWebhookSignature(
  rawBody: string,
  headers: Headers
): { ok: true } | { ok: false; reason: string } {
  const secret =
    process.env.LIGHTNING_WEBHOOK_SECRET?.trim() ||
    process.env.LND_WEBHOOK_SECRET?.trim() ||
    "";

  if (!secret) {
    return { ok: false, reason: "LIGHTNING_WEBHOOK_SECRET is not configured." };
  }

  const provided =
    headers.get("x-lightning-signature")?.trim() ||
    headers.get("x-webhook-signature")?.trim() ||
    headers.get("x-signature")?.trim() ||
    "";

  if (!provided) {
    return { ok: false, reason: "Missing Lightning webhook signature header." };
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.toLowerCase().replace(/^sha256=/, ""), "utf8");

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Invalid Lightning webhook signature." };
  }

  return { ok: true };
}

/**
 * Build LNURL-pay style callback payload (optional metadata for wallets).
 */
export function buildLnurlPayPayload(input: {
  callbackUrl: string;
  amountSats: number;
  description: string;
}): {
  tag: "payRequest";
  callback: string;
  minSendable: number;
  maxSendable: number;
  metadata: string;
} {
  const msats = Math.max(1, Math.trunc(input.amountSats)) * 1000;
  const metadata = JSON.stringify([["text/plain", input.description]]);
  return {
    tag: "payRequest",
    callback: input.callbackUrl,
    minSendable: msats,
    maxSendable: msats,
    metadata,
  };
}
