/**
 * POST /api/payments/lightning/invoice
 * Creates a Bolt11 Lightning invoice (optional LNURL-pay payload) for Gas top-up.
 */

import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import {
  getGasPackage,
  isGasPackageId,
  packageAmountSats,
} from "@/lib/billing/gasPackages";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  buildLnurlPayPayload,
  createLightningInvoice,
  isLightningConfigured,
} from "@/lib/payments/lightning";
import { createPendingGasPayment } from "@/lib/payments/settleGasPayment";
import { getAppBaseUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  packageId?: string;
  workspaceId?: string;
  includeLnurl?: boolean;
  expirySeconds?: number;
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

  if (!isLightningConfigured()) {
    return apiError(
      "Lightning node not configured (LIGHTNING_LND_REST_URL / LIGHTNING_LND_MACAROON_HEX).",
      "LIGHTNING_NOT_CONFIGURED",
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
  const amountSats = packageAmountSats(pack);
  const expirySeconds =
    typeof body.expirySeconds === "number" && body.expirySeconds > 60
      ? Math.min(86_400, Math.trunc(body.expirySeconds))
      : 3600;

  try {
    const invoice = await createLightningInvoice({
      amountSats,
      memo: `ScaleSystems Gas · ${pack.label} · ${pack.gas} ⚡`,
      expirySeconds,
    });

    const payment = await createPendingGasPayment({
      workspaceId: gate.workspaceId,
      provider: "LIGHTNING",
      packageId: pack.id,
      gasAmount: pack.gas,
      amountMinor: amountSats * 1000,
      currency: "msat",
      externalId: invoice.paymentHash,
      externalIdAlt: invoice.paymentRequest,
      metadata: {
        amountSats,
        expiresAt: invoice.expiresAt,
      },
    });

    const baseUrl = getAppBaseUrl(request);
    const lnurl =
      body.includeLnurl === true
        ? buildLnurlPayPayload({
            callbackUrl: `${baseUrl}/api/payments/lightning/invoice`,
            amountSats,
            description: `ScaleSystems Gas · ${pack.label}`,
          })
        : null;

    return apiSuccess({
      provider: "lightning",
      paymentId: payment.id,
      packageId: pack.id,
      gasAmount: pack.gas,
      amountSats,
      paymentHash: invoice.paymentHash,
      bolt11: invoice.paymentRequest,
      expiresAt: invoice.expiresAt,
      lnurl,
      verifyUrl: `${baseUrl}/api/payments/lightning/verify?paymentHash=${invoice.paymentHash}`,
    });
  } catch (err) {
    return apiError(
      err instanceof Error
        ? err.message
        : "Failed to create Lightning invoice.",
      "LIGHTNING_INVOICE_FAILED",
      502
    );
  }
}
