/**
 * POST /api/payments/paypal/capture-order
 * Captures an approved PayPal order, verifies COMPLETED status, credits Gas.
 */

import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  capturePayPalOrder,
  extractPayPalCaptureId,
  getPayPalOrder,
  isPayPalConfigured,
  isPayPalOrderPaid,
} from "@/lib/payments/paypal";
import {
  findGasPaymentByExternalId,
  settleGasPayment,
} from "@/lib/payments/settleGasPayment";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  orderId?: string;
  workspaceId?: string;
};

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    body.workspaceId ?? null
  );
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  if (!isPayPalConfigured()) {
    return apiError(
      "PayPal is not configured.",
      "PAYPAL_NOT_CONFIGURED",
      503
    );
  }

  const orderId = body.orderId?.trim();
  if (!orderId) {
    return apiError("orderId is required.", "ORDER_ID_REQUIRED", 400);
  }

  const payment = await findGasPaymentByExternalId(orderId);
  if (!payment) {
    return apiError("Unknown PayPal order.", "PAYMENT_NOT_FOUND", 404);
  }
  if (payment.workspaceId !== gate.workspaceId) {
    return apiError(
      "Order does not belong to this workspace.",
      "WORKSPACE_RESOURCE_FORBIDDEN",
      403
    );
  }
  if (payment.provider !== "PAYPAL") {
    return apiError("Payment is not a PayPal order.", "PROVIDER_MISMATCH", 400);
  }

  if (payment.status === "COMPLETED") {
    const ws = await getPrisma().workspace.findUnique({
      where: { id: payment.workspaceId },
      select: { gasBalance: true },
    });
    return apiSuccess({
      provider: "paypal",
      orderId,
      alreadyCredited: true,
      gasAmount: payment.gasAmount,
      balanceAfter: ws?.gasBalance ?? null,
      paymentId: payment.id,
      status: "COMPLETED",
    });
  }

  try {
    let order = await capturePayPalOrder(orderId);
    if (!isPayPalOrderPaid(order)) {
      order = await getPayPalOrder(orderId);
    }

    if (!isPayPalOrderPaid(order)) {
      await getPrisma().gasPayment.update({
        where: { id: payment.id },
        data: {
          status: "REQUIRES_ACTION",
          metadataJson: {
            paypalStatus: order.status,
          },
        },
      });
      return apiError(
        `PayPal order not completed (status=${order.status}).`,
        "PAYPAL_NOT_COMPLETED",
        402
      );
    }

    const captureId = extractPayPalCaptureId(order);
    const settled = await settleGasPayment({
      paymentId: payment.id,
      externalIdAlt: captureId,
      metadata: {
        paypalStatus: order.status,
        captureId,
      },
      description: `PayPal Gas recharge · ${payment.packageId} · order ${orderId}`,
    });

    return apiSuccess({
      provider: "paypal",
      orderId,
      captureId,
      paymentId: settled.paymentId,
      gasAmount: settled.gasAmount,
      balanceAfter: settled.balanceAfter,
      ledgerId: settled.ledgerId,
      alreadyCredited: settled.alreadyCredited,
      status: settled.status,
    });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Failed to capture PayPal order.",
      "PAYPAL_CAPTURE_FAILED",
      502
    );
  }
}
