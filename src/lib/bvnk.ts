import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  bvnkAmountUsdForPlan,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";

export type BvnkCheckoutResult = {
  paymentId: string;
  checkoutUrl: string;
  status: string;
};

function getBvnkConfig() {
  const baseUrl = (
    process.env.BVNK_API_BASE_URL?.trim() || "https://api.sandbox.bvnk.com"
  ).replace(/\/$/, "");
  const apiKey =
    process.env.BVNK_API_KEY?.trim() ||
    process.env.BVNK_HAWK_AUTH_ID?.trim();
  const apiSecret =
    process.env.BVNK_API_SECRET?.trim() ||
    process.env.BVNK_HAWK_AUTH_KEY?.trim();
  const merchantId = process.env.BVNK_MERCHANT_ID?.trim();
  const walletId = process.env.BVNK_WALLET_ID?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error("BVNK_API_KEY / BVNK_API_SECRET are not configured.");
  }

  return { baseUrl, apiKey, apiSecret, merchantId, walletId };
}

function hawkPayloadHash(body: string): string {
  return createHmac("sha256", "")
    .update(`hawk.1.payload\napplication/json\n${body}\n`)
    .digest("base64");
}

function buildHawkAuthorization(
  method: string,
  absoluteUrl: string,
  apiKey: string,
  apiSecret: string,
  body: string
): string {
  const url = new URL(absoluteUrl);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(8).toString("hex");
  const path = `${url.pathname}${url.search}`;
  const host = url.hostname.toLowerCase();
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const hash = hawkPayloadHash(body);

  const normalized =
    `hawk.1.header\n${ts}\n${nonce}\n${method.toUpperCase()}\n${path}\n${host}\n${port}\n${hash}\n\n`;

  const mac = createHmac("sha256", apiSecret).update(normalized).digest("base64");

  return `Hawk id="${apiKey}", ts="${ts}", nonce="${nonce}", hash="${hash}", mac="${mac}"`;
}

export async function createBvnkCheckoutSession(input: {
  plan: CheckoutPlan;
  userId: string | null;
  email: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<BvnkCheckoutResult> {
  const config = getBvnkConfig();
  const amount = bvnkAmountUsdForPlan(input.plan);
  const reference = `scalesystems_${input.plan.toLowerCase()}_${Date.now()}`;

  const merchantConfigured =
    Boolean(config.merchantId) &&
    config.merchantId !== "bvnk_merchant_id_placeholder" &&
    Boolean(config.walletId) &&
    !(config.walletId ?? "").startsWith("00000000");

  // Local/sandbox fallback keeps checkout UX unblocked until merchant IDs are provisioned.
  if (!merchantConfigured) {
    const checkoutUrl = new URL(input.successUrl);
    checkoutUrl.searchParams.set("provider", "bvnk");
    checkoutUrl.searchParams.set("plan", input.plan);
    checkoutUrl.searchParams.set("ref", reference);
    return {
      paymentId: reference,
      checkoutUrl: checkoutUrl.toString(),
      status: "sandbox_simulated",
    };
  }

  const endpoint = `${config.baseUrl}/api/v1/payment`;
  const bodyObject = {
    merchantId: config.merchantId,
    walletId: config.walletId,
    type: "IN",
    amount,
    currency: "USD",
    reference,
    redirectUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    customerEmail: input.email ?? undefined,
    metadata: {
      plan: input.plan,
      userId: input.userId ?? "",
      product: "scalesystems",
    },
  };
  const body = JSON.stringify(bodyObject);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: buildHawkAuthorization(
        "POST",
        endpoint,
        config.apiKey,
        config.apiSecret,
        body
      ),
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    uuid?: string;
    id?: string;
    redirectUrl?: string;
    paymentUrl?: string;
    checkoutUrl?: string;
    status?: string;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.message ||
        payload.error ||
        `BVNK checkout failed with HTTP ${response.status}`
    );
  }

  const checkoutUrl =
    payload.redirectUrl || payload.paymentUrl || payload.checkoutUrl;
  const paymentId = payload.uuid || payload.id || reference;

  if (!checkoutUrl) {
    throw new Error("BVNK response did not include a checkout URL.");
  }

  return {
    paymentId,
    checkoutUrl,
    status: payload.status ?? "created",
  };
}

export function verifyBvnkWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.BVNK_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedB64 = createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();

  return (
    safeEqual(expectedHex, provided) || safeEqual(expectedB64, provided)
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
