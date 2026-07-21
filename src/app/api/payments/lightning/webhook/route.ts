/**
 * POST /api/payments/lightning/webhook
 * Signed Lightning node settlement push — HMAC verified before Gas credit.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  lookupLightningInvoice,
  verifyLightningWebhookSignature,
} from "@/lib/payments/lightning";
import {
  findGasPaymentByExternalId,
  settleGasPayment,
} from "@/lib/payments/settleGasPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  paymentHash?: string;
  settled?: boolean;
  r_hash?: string;
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  const verified = verifyLightningWebhookSignature(rawBody, request.headers);
  if (!verified.ok) {
    return apiError(verified.reason, "LIGHTNING_WEBHOOK_INVALID", 401);
  }

  let body: Body = {};
  try {
    body = JSON.parse(rawBody || "{}") as Body;
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const paymentHash = (
    body.paymentHash?.trim() ||
    body.r_hash?.trim() ||
    ""
  ).toLowerCase();

  if (!paymentHash) {
    return apiError("paymentHash is required.", "HASH_REQUIRED", 400);
  }

  const payment = await findGasPaymentByExternalId(paymentHash);
  if (!payment || payment.provider !== "LIGHTNING") {
    return apiSuccess({ received: true, unmatched: true, paymentHash });
  }

  if (payment.status === "COMPLETED") {
    return apiSuccess({
      received: true,
      alreadyCredited: true,
      paymentId: payment.id,
    });
  }

  // Defense in depth: re-check settlement on the node even after HMAC verify.
  try {
    const status = await lookupLightningInvoice(paymentHash);
    if (!status.settled) {
      return apiSuccess({
        received: true,
        settled: false,
        paymentId: payment.id,
        state: status.state ?? "OPEN",
      });
    }

    const settled = await settleGasPayment({
      paymentId: payment.id,
      metadata: {
        webhook: true,
        amtPaidSat: status.amtPaidSat,
        state: status.state,
      },
      description: `Lightning webhook Gas recharge · ${payment.packageId} · ${paymentHash}`,
    });

    return apiSuccess({
      received: true,
      credited: !settled.alreadyCredited,
      alreadyCredited: settled.alreadyCredited,
      paymentId: settled.paymentId,
      gasAmount: settled.gasAmount,
      balanceAfter: settled.balanceAfter,
    });
  } catch (err) {
    return apiError(
      err instanceof Error
        ? err.message
        : "Unable to confirm Lightning settlement.",
      "LIGHTNING_WEBHOOK_CONFIRM_FAILED",
      502
    );
  }
}
