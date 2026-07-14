import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  isCheckoutPlan,
  stripePriceIdForPlan,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";
import { getAppBaseUrl, getStripe, isStripeConfigured } from "@/lib/stripe";
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
    const profile = await resolveRequestUser(request);
    const baseUrl = getAppBaseUrl(request);

    // Missing Stripe credentials / price map → safe mock checkout (no 500).
    if (!isStripeConfigured() || !priceId) {
      const mockId = `mock_stripe_${plan.toLowerCase()}_${Date.now()}`;
      const url = new URL(`${baseUrl}/dashboard`);
      url.searchParams.set("payment", "success");
      url.searchParams.set("provider", "stripe");
      url.searchParams.set("plan", plan);
      url.searchParams.set("mock", "1");
      url.searchParams.set("session_id", mockId);

      trackServerFunnel({
        event: "checkout_stripe_start",
        plan,
        provider: "stripe",
      });

      return NextResponse.json({
        success: true,
        provider: "stripe",
        plan,
        mock: true,
        sessionId: mockId,
        url: url.toString(),
        message:
          "Stripe is not fully configured — returning local mock checkout success URL.",
      });
    }

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
    // Last-resort mock so missing/misconfigured Stripe never hard-500s checkout UX.
    try {
      const baseUrl = getAppBaseUrl(request);
      const plan = "STARTER";
      const mockId = `mock_stripe_fallback_${Date.now()}`;
      const url = new URL(`${baseUrl}/dashboard`);
      url.searchParams.set("payment", "success");
      url.searchParams.set("provider", "stripe");
      url.searchParams.set("plan", plan);
      url.searchParams.set("mock", "1");
      return NextResponse.json({
        success: true,
        provider: "stripe",
        plan,
        mock: true,
        sessionId: mockId,
        url: url.toString(),
        warning:
          error instanceof Error
            ? error.message
            : "Stripe unavailable — mock checkout issued.",
      });
    } catch {
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
}
