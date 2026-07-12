import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { PlanTier } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { parsePlanTier, resolvePlanFromStripePriceId } from "@/lib/plans";

export const runtime = "nodejs";

type SubscriptionSyncInput = {
  userId: string;
  plan: PlanTier;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  source: string;
};

async function syncUserSubscription({
  userId,
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  source,
}: SubscriptionSyncInput) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, plan: true },
  });

  if (!user) {
    console.error(`[Stripe Webhook] User not found (${source}).`, { userId });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      ...(stripeCustomerId !== undefined && {
        stripeCustomerId: stripeCustomerId ?? null,
      }),
      ...(stripeSubscriptionId !== undefined && {
        stripeSubscriptionId: stripeSubscriptionId ?? null,
      }),
    },
  });

  console.info("[Stripe Webhook] Synced user subscription state.", {
    userId,
    previousPlan: user.plan,
    nextPlan: plan,
    stripeCustomerId,
    stripeSubscriptionId,
    source,
  });
}

function resolveUserIdFromCheckout(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.userId ?? session.client_reference_id ?? null;
}

function resolvePlanFromMetadata(metadata: Stripe.Metadata | null): PlanTier {
  return parsePlanTier(metadata?.plan);
}

function resolvePlanFromSubscription(
  subscription: Stripe.Subscription
): PlanTier {
  const metadataPlan = subscription.metadata?.plan;
  if (metadataPlan) {
    return parsePlanTier(metadataPlan);
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const fromPrice = resolvePlanFromStripePriceId(priceId);
  if (fromPrice) {
    return fromPrice;
  }

  if (
    subscription.status === "active" ||
    subscription.status === "trialing"
  ) {
    return "STARTER";
  }

  return "FREE";
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = resolveUserIdFromCheckout(session);
  if (!userId) {
    console.warn("[Stripe Webhook] checkout.session.completed missing userId.", {
      sessionId: session.id,
    });
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  await syncUserSubscription({
    userId,
    plan: resolvePlanFromMetadata(session.metadata),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    source: "checkout.session.completed",
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.warn(
      "[Stripe Webhook] customer.subscription.updated missing userId metadata.",
      { subscriptionId: subscription.id }
    );
    return;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const isActive =
    subscription.status === "active" || subscription.status === "trialing";

  await syncUserSubscription({
    userId,
    plan: isActive ? resolvePlanFromSubscription(subscription) : "FREE",
    stripeCustomerId: customerId,
    stripeSubscriptionId: isActive ? subscription.id : null,
    source: "customer.subscription.updated",
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: { stripeSubscriptionId: subscription.id },
      select: { id: true },
    });

    if (!user) {
      console.warn(
        "[Stripe Webhook] customer.subscription.deleted could not resolve user.",
        { subscriptionId: subscription.id }
      );
      return;
    }

    await syncUserSubscription({
      userId: user.id,
      plan: "FREE",
      stripeSubscriptionId: null,
      source: "customer.subscription.deleted",
    });
    return;
  }

  await syncUserSubscription({
    userId,
    plan: "FREE",
    stripeSubscriptionId: null,
    source: "customer.subscription.deleted",
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret || webhookSecret === "whsec_placeholder") {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured.");
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature header." },
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
    console.error("[Stripe Webhook] Signature verification failed:", error);
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;
      default:
        console.info("[Stripe Webhook] Ignored event type:", event.type);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[Stripe Webhook] Handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    );
  }
}
