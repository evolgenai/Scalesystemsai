/**
 * POST /api/payments/paypal/create-order
 * Creates a PayPal order for a Gas package and records a PENDING GasPayment.
 */

import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import {
  getGasPackage,
  isGasPackageId,
  packageAmountCents,
} from "@/lib/billing/gasPackages";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  createPayPalOrder,
  isPayPalConfigured,
} from "@/lib/payments/paypal";
import { createPendingGasPayment } from "@/lib/payments/settleGasPayment";
import { getAppBaseUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  packageId?: string;
  workspaceId?: string;
  returnUrl?: string;
  cancelUrl?: string;
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
      "PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).",
      "PAYPAL_NOT_CONFIGURED",
      503
    );
  }

  const packageId = (body.packageId ?? "").trim().toLowerCase();
  if (!isGasPackageId(packageId)) {
    return apiError(
      "Invalid packageId. Use starter, scale, or overlord.",
      "INVALID_PACKAGE",
      400
    );
  }

  const pack = getGasPackage(packageId)!;
  const baseUrl = getAppBaseUrl(request);
  const returnUrl =
    body.returnUrl?.trim() ||
    `${baseUrl}/dashboard?payment=success&provider=paypal&package=${pack.id}`;
  const cancelUrl =
    body.cancelUrl?.trim() ||
    `${baseUrl}/dashboard?payment=cancelled&provider=paypal&package=${pack.id}`;

  const customId = `gas:${gate.workspaceId}:${pack.id}:${Date.now()}`;

  try {
    const order = await createPayPalOrder({
      amountUsd: pack.priceUsd,
      currency: "USD",
      customId,
      description: `ScaleSystems Gas · ${pack.label} (${pack.gas.toLocaleString()} ⚡)`,
      returnUrl,
      cancelUrl,
    });

    const payment = await createPendingGasPayment({
      workspaceId: gate.workspaceId,
      provider: "PAYPAL",
      packageId: pack.id,
      gasAmount: pack.gas,
      amountMinor: packageAmountCents(pack),
      currency: "usd",
      externalId: order.id,
      metadata: {
        customId,
        paypalStatus: order.status,
      },
    });

    const approveUrl = order.links?.find((l) => l.rel === "approve")?.href;

    return apiSuccess({
      provider: "paypal",
      orderId: order.id,
      status: order.status,
      paymentId: payment.id,
      packageId: pack.id,
      gasAmount: pack.gas,
      amountUsd: pack.priceUsd,
      approveUrl: approveUrl ?? null,
      links: order.links ?? [],
    });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Failed to create PayPal order.",
      "PAYPAL_CREATE_FAILED",
      502
    );
  }
}
