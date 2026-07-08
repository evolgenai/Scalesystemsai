import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyBvnkWebhookSignature } from "@/lib/bvnkWebhook";
import type { PlanTier } from "@prisma/client";
import type { BvnkWebhookPayload } from "@/types/bvnk";

export const runtime = "nodejs";

const SUCCESS_STATUSES = new Set([
  "COMPLETE",
  "COMPLETED",
  "SUCCESS",
  "PAID",
  "CONFIRMED",
]);

const SUCCESS_EVENTS = new Set([
  "bvnk:payment:crypto:status-change",
  "bvnk:payment:status-change",
]);

function extractUserId(payload: BvnkWebhookPayload): string | null {
  return (
    payload.metadata?.userId ??
    payload.data?.metadata?.userId ??
    null
  );
}

function extractStatus(payload: BvnkWebhookPayload): string | null {
  const status = payload.status ?? payload.data?.status;
  return status ? status.toUpperCase() : null;
}

function isSuccessfulPayment(payload: BvnkWebhookPayload): boolean {
  const status = extractStatus(payload);
  if (status && SUCCESS_STATUSES.has(status)) {
    return true;
  }

  if (payload.event && SUCCESS_EVENTS.has(payload.event)) {
    return status ? SUCCESS_STATUSES.has(status) : true;
  }

  return false;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.BVNK_WEBHOOK_SECRET?.trim();

  try {
    const rawBody = await request.text();
    let payload: BvnkWebhookPayload;

    try {
      payload = JSON.parse(rawBody) as BvnkWebhookPayload;
    } catch (error) {
      console.error("[BVNK Webhook] Invalid JSON payload:", error);
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    if (webhookSecret && !webhookSecret.includes("placeholder")) {
      const signature = request.headers.get("x-signature");

      if (!verifyBvnkWebhookSignature(rawBody, signature, webhookSecret)) {
        console.error("[BVNK Webhook] Signature verification failed.");
        return NextResponse.json(
          { error: "Invalid webhook signature." },
          { status: 401 }
        );
      }
    }

    const status = extractStatus(payload);
    const userId = extractUserId(payload);

    console.info("[BVNK Webhook] Event received.", {
      event: payload.event,
      status,
      userId,
      reference: payload.reference ?? payload.data?.reference,
    });

    if (!userId) {
      console.warn("[BVNK Webhook] Missing userId in metadata.");
      return NextResponse.json({ received: true, skipped: true }, { status: 200 });
    }

    if (!isSuccessfulPayment(payload)) {
      return NextResponse.json(
        { received: true, skipped: true, status, event: payload.event },
        { status: 200 }
      );
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true },
    });

    if (!user) {
      console.error("[BVNK Webhook] User not found for upgrade.", { userId });
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { plan: "PREMIUM" satisfies PlanTier },
    });

    console.info("[BVNK Webhook] Upgraded user to PREMIUM.", {
      userId,
      previousPlan: user.plan,
    });

    return NextResponse.json({ received: true, upgraded: true }, { status: 200 });
  } catch (error) {
    console.error("[BVNK Webhook] Handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    );
  }
}
