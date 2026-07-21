/**
 * PayPal Gas payments router.
 *
 * Canonical paths (App Router folders):
 *   POST /api/payments/paypal/create-order
 *   POST /api/payments/paypal/capture-order
 *   POST /api/payments/paypal/webhook
 *
 * This entry also accepts POST { action: "create-order" | "capture-order" }
 * so clients can target /api/payments/paypal without a path segment.
 */

import { apiError } from "@/lib/http/apiResponse";
import { POST as createOrder } from "./create-order/route";
import { POST as captureOrder } from "./capture-order/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  let action = "";
  try {
    const parsed = JSON.parse(raw || "{}") as { action?: string };
    action = (parsed.action ?? "").trim().toLowerCase();
  } catch {
    action = "";
  }

  const replay = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: raw || "{}",
  });

  if (action === "create-order" || action === "create") {
    return createOrder(replay);
  }
  if (action === "capture-order" || action === "capture") {
    return captureOrder(replay);
  }

  return apiError(
    'Use /api/payments/paypal/create-order, /capture-order, /webhook — or pass action "create-order" | "capture-order".',
    "PAYPAL_ACTION_REQUIRED",
    400
  );
}
