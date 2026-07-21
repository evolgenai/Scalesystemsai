/**
 * POST /api/payments/google-pay
 *
 * Creates a Stripe PaymentIntent for one-tap Google Pay / card wallets.
 * Uses automatic_payment_methods (dynamic PM) — Google Pay is enabled via
 * Dashboard / payment_method_configurations, never hardcoded payment_method_types.
 *
 * Settlement credits Gas only after Stripe webhook signature verification
 * (payment_intent.succeeded → /api/webhooks/stripe).
 */

import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import {
  getGasPackage,
  isGasPackageId,
  packageAmountCents,
} from "@/lib/billing/gasPackages";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { createPendingGasPayment } from "@/lib/payments/settleGasPayment";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  packageId?: string;
  workspaceId?: string;
  /** Optional Stripe Dashboard payment method configuration id. */
  paymentMethodConfiguration?: string;
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

  if (!isStripeConfigured()) {
    return apiError(
      "Stripe is not configured (STRIPE_SECRET_KEY).",
      "STRIPE_NOT_CONFIGURED",
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
  const amountCents = packageAmountCents(pack);
  const pmc =
    body.paymentMethodConfiguration?.trim() ||
    process.env.STRIPE_GOOGLE_PAY_PMC?.trim() ||
    process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION?.trim() ||
    undefined;

  try {
    const stripe = getStripe();

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      // Dynamic payment methods — enable Google Pay + cards in Dashboard.
      // Do NOT pass payment_method_types (Stripe best practice).
      automatic_payment_methods: { enabled: true },
      ...(pmc ? { payment_method_configuration: pmc } : {}),
      metadata: {
        purpose: "gas_topup",
        workspaceId: gate.workspaceId,
        packageId: pack.id,
        gasAmount: String(pack.gas),
      },
      description: `ScaleSystems Gas · ${pack.label} (${pack.gas.toLocaleString()} ⚡)`,
    });

    if (!intent.client_secret) {
      return apiError(
        "Stripe did not return a client_secret.",
        "STRIPE_NO_CLIENT_SECRET",
        502
      );
    }

    const payment = await createPendingGasPayment({
      workspaceId: gate.workspaceId,
      provider: "STRIPE",
      packageId: pack.id,
      gasAmount: pack.gas,
      amountMinor: amountCents,
      currency: "usd",
      externalId: intent.id,
      metadata: {
        purpose: "gas_topup",
        googlePay: true,
      },
    });

    return apiSuccess({
      provider: "stripe",
      googlePay: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      paymentId: payment.id,
      packageId: pack.id,
      gasAmount: pack.gas,
      amountCents,
      currency: "usd",
      status: intent.status,
      publishableKey:
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null,
    });
  } catch (err) {
    return apiError(
      err instanceof Error
        ? err.message
        : "Failed to create Google Pay PaymentIntent.",
      "GOOGLE_PAY_INTENT_FAILED",
      502
    );
  }
}
