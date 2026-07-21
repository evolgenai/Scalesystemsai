import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyPaidPlanToUser } from "@/lib/billing/applyPaidPlan";
import {
  isCheckoutPlan,
  planFromStripePriceId,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";
import {
  findGasPaymentByExternalId,
  settleGasPayment,
} from "@/lib/payments/settleGasPayment";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolvePlanFromSession(session: Stripe.Checkout.Session): CheckoutPlan {
  const metadataPlan = session.metadata?.plan?.toUpperCase();
  if (metadataPlan && isCheckoutPlan(metadataPlan)) {
    return metadataPlan;
  }
  return "STARTER";
}

async function resolvePlanFromLineItems(
  session: Stripe.Checkout.Session
): Promise<CheckoutPlan> {
  const fromMetadata = resolvePlanFromSession(session);
  if (session.metadata?.plan) return fromMetadata;

  try {
    const stripe = getStripe();
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 1,
    });
    const priceId = lineItems.data[0]?.price?.id;
    return planFromStripePriceId(priceId) ?? fromMetadata;
  } catch {
    return fromMetadata;
  }
}

async function creditGasFromPaymentIntent(
  intent: Stripe.PaymentIntent
): Promise<{
  credited: boolean;
  alreadyCredited?: boolean;
  paymentId?: string;
  gasAmount?: number;
  ignored?: string;
}> {
  if (intent.metadata?.purpose !== "gas_topup") {
    return { credited: false, ignored: "not_gas_topup" };
  }

  if (intent.status !== "succeeded") {
    return { credited: false, ignored: `status_${intent.status}` };
  }

  const payment = await findGasPaymentByExternalId(intent.id);
  if (!payment) {
    return { credited: false, ignored: "payment_row_missing" };
  }

  if (payment.status === "COMPLETED") {
    return {
      credited: false,
      alreadyCredited: true,
      paymentId: payment.id,
      gasAmount: payment.gasAmount,
    };
  }

  const settled = await settleGasPayment({
    paymentId: payment.id,
    externalIdAlt:
      typeof intent.latest_charge === "string"
        ? intent.latest_charge
        : intent.latest_charge?.id ?? null,
    metadata: {
      purpose: "gas_topup",
      stripeStatus: intent.status,
      amountReceived: intent.amount_received,
    },
    description: `Stripe/Google Pay Gas recharge · ${payment.packageId} · ${intent.id}`,
  });

  return {
    credited: !settled.alreadyCredited,
    alreadyCredited: settled.alreadyCredited,
    paymentId: settled.paymentId,
    gasAmount: settled.gasAmount,
  };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header." },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Webhook signature verification failed: ${error.message}`
            : "Webhook signature verification failed.",
      },
      { status: 400 }
    );
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const gasResult = await creditGasFromPaymentIntent(intent);
      return NextResponse.json({
        received: true,
        type: event.type,
        ...gasResult,
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const plan = await resolvePlanFromLineItems(session);

      const result = await applyPaidPlanToUser({
        userId:
          session.metadata?.userId ||
          session.client_reference_id ||
          null,
        email:
          session.metadata?.email ||
          session.customer_details?.email ||
          session.customer_email ||
          null,
        plan,
        provider: "stripe",
        externalId: session.subscription
          ? String(session.subscription)
          : session.id,
      });

      return NextResponse.json({
        received: true,
        updated: result.updated,
        userId: result.userId,
        plan,
      });
    }

    return NextResponse.json({ received: true, ignored: event.type });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process Stripe webhook.",
      },
      { status: 500 }
    );
  }
}
