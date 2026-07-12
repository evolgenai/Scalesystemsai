"use server";

import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  type PaidCheckoutTier,
  resolveStripePriceIdForPlan,
} from "@/lib/plans";

export type StripeActionResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function createCheckoutSession(
  userId: string,
  targetPlan: PaidCheckoutTier = "STARTER"
): Promise<StripeActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.id !== userId) {
      return { success: false, error: "Unauthorized checkout request." };
    }

    const resolvedPriceId = resolveStripePriceIdForPlan(targetPlan);

    if (!resolvedPriceId) {
      const envKey =
        targetPlan === "STARTER"
          ? "STRIPE_STARTER_PRICE_ID"
          : "STRIPE_PREMIUM_PRICE_ID";
      return {
        success: false,
        error: `Billing is not configured. Set ${envKey} in your .env file.`,
      };
    }

    if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_")) {
      return {
        success: false,
        error: "Stripe secret key is not configured.",
      };
    }

    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, email: true },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const stripe = getStripe();

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: userId,
      customer: dbUser?.stripeCustomerId ?? undefined,
      customer_email: dbUser?.stripeCustomerId
        ? undefined
        : session.user.email ?? undefined,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      metadata: {
        userId,
        plan: targetPlan,
        priceId: resolvedPriceId,
      },
      subscription_data: {
        metadata: {
          userId,
          plan: targetPlan,
        },
      },
      success_url: `${baseUrl}/dashboard?billing=success&plan=${targetPlan.toLowerCase()}`,
      cancel_url: `${baseUrl}/dashboard?billing=cancelled`,
    });

    if (!checkoutSession.url) {
      return { success: false, error: "Stripe did not return a checkout URL." };
    }

    return { success: true, url: checkoutSession.url };
  } catch (error) {
    console.error("[Stripe Checkout] Failed to create session:", error);
    return {
      success: false,
      error: "Unable to create checkout session.",
    };
  }
}

export async function createStripePortalSession(
  userId: string
): Promise<StripeActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.id !== userId) {
      return { success: false, error: "Unauthorized portal request." };
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      return {
        success: false,
        error:
          "No Stripe billing profile found. Complete a subscription checkout first.",
      };
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/dashboard?billing=portal-return`,
    });

    if (!portalSession.url) {
      return {
        success: false,
        error: "Stripe did not return a customer portal URL.",
      };
    }

    return { success: true, url: portalSession.url };
  } catch (error) {
    console.error("[Stripe Portal] Failed to create session:", error);
    return {
      success: false,
      error: "Unable to open subscription management portal.",
    };
  }
}
