/**
 * POST /api/payments/paypal/webhook
 * PayPal webhook listener — signature verified before any Gas credit.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  extractPayPalCaptureId,
  isPayPalOrderPaid,
  verifyPayPalWebhookSignature,
  type PayPalOrder,
} from "@/lib/payments/paypal";
import {
  findGasPaymentByExternalId,
  settleGasPayment,
} from "@/lib/payments/settleGasPayment";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    supplementary_data?: {
      related_ids?: { order_id?: string };
    };
    purchase_units?: PayPalOrder["purchase_units"];
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  const verified = await verifyPayPalWebhookSignature({
    headers: request.headers,
    rawBody,
  });

  if (!verified.ok) {
    return apiError(verified.reason, "PAYPAL_WEBHOOK_INVALID", 401);
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const eventType = event.event_type ?? "";
  const creditEvents = new Set([
    "PAYMENT.CAPTURE.COMPLETED",
    "CHECKOUT.ORDER.APPROVED",
    "CHECKOUT.ORDER.COMPLETED",
  ]);

  if (!creditEvents.has(eventType)) {
    return apiSuccess({ received: true, ignored: eventType });
  }

  const resource = event.resource ?? {};
  const orderId =
    resource.supplementary_data?.related_ids?.order_id?.trim() ||
    (eventType.startsWith("CHECKOUT.ORDER") ? resource.id?.trim() : null) ||
    null;

  // CAPTURE events key by capture id — resolve via GasPayment.externalIdAlt or order.
  let payment =
    (orderId ? await findGasPaymentByExternalId(orderId) : null) ?? null;

  if (!payment && resource.id) {
    payment = await getPrisma().gasPayment.findFirst({
      where: {
        OR: [{ externalId: resource.id }, { externalIdAlt: resource.id }],
        provider: "PAYPAL",
      },
    });
  }

  if (!payment) {
    return apiSuccess({
      received: true,
      unmatched: true,
      eventType,
      resourceId: resource.id ?? null,
    });
  }

  if (payment.status === "COMPLETED") {
    return apiSuccess({
      received: true,
      alreadyCredited: true,
      paymentId: payment.id,
    });
  }

  // For ORDER.APPROVED alone, wait for capture unless status already COMPLETED.
  if (
    eventType === "CHECKOUT.ORDER.APPROVED" &&
    resource.status !== "COMPLETED"
  ) {
    await getPrisma().gasPayment.update({
      where: { id: payment.id },
      data: { status: "REQUIRES_ACTION" },
    });
    return apiSuccess({
      received: true,
      awaitingCapture: true,
      paymentId: payment.id,
    });
  }

  const asOrder = {
    id: orderId ?? payment.externalId,
    status: resource.status ?? "COMPLETED",
    purchase_units: resource.purchase_units,
  } satisfies PayPalOrder;

  const captureId =
    extractPayPalCaptureId(asOrder) ||
    (eventType === "PAYMENT.CAPTURE.COMPLETED" ? resource.id : null);

  if (
    eventType === "PAYMENT.CAPTURE.COMPLETED" ||
    isPayPalOrderPaid(asOrder) ||
    resource.status === "COMPLETED"
  ) {
    const settled = await settleGasPayment({
      paymentId: payment.id,
      externalIdAlt: captureId,
      metadata: {
        webhookEventId: event.id,
        eventType,
        captureId,
      },
      description: `PayPal webhook Gas recharge · ${payment.packageId} · ${payment.externalId}`,
    });

    return apiSuccess({
      received: true,
      credited: !settled.alreadyCredited,
      alreadyCredited: settled.alreadyCredited,
      paymentId: settled.paymentId,
      gasAmount: settled.gasAmount,
      balanceAfter: settled.balanceAfter,
    });
  }

  return apiSuccess({ received: true, pending: true, paymentId: payment.id });
}
