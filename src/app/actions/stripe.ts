"use server";

import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export type StripeActionResult =
  | { success: true; url: string }
  | { success: false; error: string };

function resolvePremiumPriceId(priceId?: string): string | null {
  const envPriceId = process.env.STRIPE_PREMIUM_PRICE_ID?.trim();
  const resolved = (priceId?.trim() || envPriceId || "").trim();

  if (!resolved || resolved === "price_placeholder") {
    return null;
  }

  return resolved;
}

export async function createCheckoutSession(
  userId: string,
  priceId?: string
): Promise<StripeActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.id !== userId) {
      return { success: false, error: "Unauthorized checkout request." };
    }

    const resolvedPriceId = resolvePremiumPriceId(priceId);

    if (!resolvedPriceId) {
      console.error(
        "[Stripe Checkout] Missing STRIPE_PREMIUM_PRICE_ID in environment."
      );
      return {
        success: false,
        error:
          "Billing is not configured. Set STRIPE_PREMIUM_PRICE_ID in your .env file.",
      };
    }

    if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_")) {
      console.error("[Stripe Checkout] Invalid or missing STRIPE_SECRET_KEY.");
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
      line_items: [
        {
          price: resolvedPriceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        plan: "PREMIUM",
        priceId: resolvedPriceId,
      },
      subscription_data: {
        metadata: {
          userId,
          plan: "PREMIUM",
        },
      },
      success_url: `${baseUrl}/dashboard?billing=success`,
      cancel_url: `${baseUrl}/dashboard?billing=cancelled`,
    });

    if (!checkoutSession.url) {
      console.error("[Stripe Checkout] Session created without redirect URL.", {
        sessionId: checkoutSession.id,
      });
      return { success: false, error: "Stripe did not return a checkout URL." };
    }

    console.info("[Stripe Checkout] Session created.", {
      userId,
      sessionId: checkoutSession.id,
      priceId: resolvedPriceId,
    });

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

    console.info("[Stripe Portal] Session created.", {
      userId,
      customerId: user.stripeCustomerId,
    });

    return { success: true, url: portalSession.url };
  } catch (error) {
    console.error("[Stripe Portal] Failed to create session:", error);
    return {
      success: false,
      error: "Unable to open subscription management portal.",
    };
  }
}
