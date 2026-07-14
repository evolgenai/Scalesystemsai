import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  isCheckoutPlan,
  stripePriceIdForPlan,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { trackServerFunnel } from "@/lib/analytics/serverFunnel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckoutBody = {
  plan?: string;
};

export async function POST(request: Request) {
  try {
    let body: CheckoutBody = {};
    try {
      body = (await request.json()) as CheckoutBody;
    } catch {
      body = {};
    }

    const planValue = (body.plan ?? "STARTER").toUpperCase();
    if (!isCheckoutPlan(planValue)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid plan. Use STARTER or PREMIUM.",
        },
        { status: 400 }
      );
    }
    const plan: CheckoutPlan = planValue;

    const priceId = stripePriceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing Stripe price ID for plan ${plan}.`,
        },
        { status: 500 }
      );
    }

    const profile = await resolveRequestUser(request);
    const baseUrl = getAppBaseUrl(request);
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?payment=success&provider=stripe&plan=${plan}`,
      cancel_url: `${baseUrl}/dashboard?payment=cancelled&provider=stripe&plan=${plan}`,
      customer_email: profile.email ?? undefined,
      client_reference_id: profile.id ?? undefined,
      metadata: {
        plan,
        userId: profile.id ?? "",
        email: profile.email ?? "",
      },
      subscription_data: {
        metadata: {
          plan,
          userId: profile.id ?? "",
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { success: false, error: "Stripe did not return a checkout URL." },
        { status: 502 }
      );
    }

    trackServerFunnel({
      event: "checkout_stripe_start",
      plan,
      provider: "stripe",
    });

    return NextResponse.json({
      success: true,
      provider: "stripe",
      plan,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to create Stripe checkout session.",
      },
      { status: 500 }
    );
  }
}
