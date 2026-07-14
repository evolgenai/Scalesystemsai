import { NextResponse } from "next/server";
import { applyPaidPlanToUser } from "@/lib/billing/applyPaidPlan";
import {
  isCheckoutPlan,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";
import { verifyBvnkWebhookSignature } from "@/lib/bvnk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BvnkWebhookPayload = {
  eventType?: string;
  type?: string;
  status?: string;
  reference?: string;
  uuid?: string;
  id?: string;
  metadata?: {
    plan?: string;
    userId?: string;
    email?: string;
  };
  data?: {
    status?: string;
    reference?: string;
    metadata?: {
      plan?: string;
      userId?: string;
      email?: string;
    };
  };
};

function isPaidStatus(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return (
    normalized === "COMPLETE" ||
    normalized === "COMPLETED" ||
    normalized === "PAID" ||
    normalized === "SUCCESS" ||
    normalized === "SUCCESSFUL"
  );
}

function resolvePlan(payload: BvnkWebhookPayload): CheckoutPlan {
  const raw =
    payload.metadata?.plan ||
    payload.data?.metadata?.plan ||
    "STARTER";
  const normalized = raw.toUpperCase();
  return isCheckoutPlan(normalized) ? normalized : "STARTER";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-bvnk-signature") ||
    request.headers.get("x-signature") ||
    request.headers.get("bvnk-signature");

  const bypass =
    process.env.BVNK_WEBHOOK_ALLOW_UNSIGNED === "1" &&
    process.env.NODE_ENV !== "production";

  if (!bypass && !verifyBvnkWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "Invalid BVNK webhook signature." },
      { status: 401 }
    );
  }

  let payload: BvnkWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as BvnkWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const eventType = (
    payload.eventType ||
    payload.type ||
    ""
  ).toLowerCase();
  const status = payload.status || payload.data?.status;
  const looksComplete =
    isPaidStatus(status) ||
    eventType.includes("complete") ||
    eventType.includes("paid") ||
    eventType.includes("success");

  if (!looksComplete) {
    return NextResponse.json({
      received: true,
      ignored: true,
      eventType: eventType || null,
      status: status || null,
    });
  }

  try {
    const plan = resolvePlan(payload);
    const result = await applyPaidPlanToUser({
      userId:
        payload.metadata?.userId ||
        payload.data?.metadata?.userId ||
        null,
      email:
        payload.metadata?.email ||
        payload.data?.metadata?.email ||
        null,
      plan,
      provider: "bvnk",
      externalId:
        payload.uuid ||
        payload.id ||
        payload.reference ||
        payload.data?.reference ||
        null,
    });

    return NextResponse.json({
      received: true,
      updated: result.updated,
      userId: result.userId,
      plan,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process BVNK webhook.",
      },
      { status: 500 }
    );
  }
}
