/**
 * Lightning Gas payments router.
 *
 * Canonical paths:
 *   POST /api/payments/lightning/invoice
 *   GET  /api/payments/lightning/verify?paymentHash=...
 *   POST /api/payments/lightning/webhook
 */

import { apiError } from "@/lib/http/apiResponse";
import { POST as createInvoice } from "./invoice/route";
import { GET as verifyInvoice } from "./verify/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "").trim().toLowerCase();

  if (action === "invoice" || action === "create") {
    return createInvoice(request);
  }

  // Default POST → invoice create for convenience.
  return createInvoice(request);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("paymentHash")) {
    return verifyInvoice(request);
  }
  return apiError(
    "Use GET /api/payments/lightning/verify?paymentHash=... or POST /api/payments/lightning/invoice.",
    "LIGHTNING_ACTION_REQUIRED",
    400
  );
}
