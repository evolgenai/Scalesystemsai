import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  isCheckoutPlan,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";
import { createBvnkCheckoutSession } from "@/lib/bvnk";
import { getAppBaseUrl } from "@/lib/stripe";
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
          error: "Invalid plan. Use STARTER, PRO, PREMIUM, or ENTERPRISE.",
        },
        { status: 400 }
      );
    }
    const plan: CheckoutPlan = planValue;

    const profile = await resolveRequestUser(request);
    const baseUrl = getAppBaseUrl(request);

    const checkout = await createBvnkCheckoutSession({
      plan,
      userId: profile.id,
      email: profile.email,
      successUrl: `${baseUrl}/dashboard?payment=success&provider=bvnk&plan=${plan}`,
      cancelUrl: `${baseUrl}/dashboard?payment=cancelled&provider=bvnk&plan=${plan}`,
    });

    trackServerFunnel({
      event: "checkout_bvnk_start",
      plan,
      provider: "bvnk",
    });

    return NextResponse.json({
      success: true,
      provider: "bvnk",
      plan,
      paymentId: checkout.paymentId,
      status: checkout.status,
      url: checkout.checkoutUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to create BVNK checkout session.",
      },
      { status: 500 }
    );
  }
}
