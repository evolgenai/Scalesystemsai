/**
 * GET /api/payments/lightning/verify?paymentHash=...
 * Polls LND for invoice settlement and atomically credits Gas on settle.
 */

import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import {
  isLightningConfigured,
  lookupLightningInvoice,
} from "@/lib/payments/lightning";
import {
  findGasPaymentByExternalId,
  settleGasPayment,
} from "@/lib/payments/settleGasPayment";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentHash = url.searchParams.get("paymentHash")?.trim() ?? "";
  const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? null;

  const gate = await requireWorkspaceApiKeyGate(request, workspaceId);
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  if (!paymentHash) {
    return apiError("paymentHash query param is required.", "HASH_REQUIRED", 400);
  }

  if (!isLightningConfigured()) {
    return apiError(
      "Lightning node not configured.",
      "LIGHTNING_NOT_CONFIGURED",
      503
    );
  }

  const payment = await findGasPaymentByExternalId(paymentHash.toLowerCase());
  if (!payment) {
    // Also try raw hash casing as stored.
    const alt = await findGasPaymentByExternalId(paymentHash);
    if (!alt) {
      return apiError("Unknown payment hash.", "PAYMENT_NOT_FOUND", 404);
    }
    return verifyAndSettle(alt, gate.workspaceId, paymentHash);
  }

  return verifyAndSettle(payment, gate.workspaceId, paymentHash);
}

async function verifyAndSettle(
  payment: NonNullable<Awaited<ReturnType<typeof findGasPaymentByExternalId>>>,
  workspaceId: string,
  paymentHash: string
) {
  if (payment.workspaceId !== workspaceId) {
    return apiError(
      "Invoice does not belong to this workspace.",
      "WORKSPACE_RESOURCE_FORBIDDEN",
      403
    );
  }
  if (payment.provider !== "LIGHTNING") {
    return apiError("Not a Lightning payment.", "PROVIDER_MISMATCH", 400);
  }

  if (payment.status === "COMPLETED") {
    const ws = await getPrisma().workspace.findUnique({
      where: { id: payment.workspaceId },
      select: { gasBalance: true },
    });
    return apiSuccess({
      provider: "lightning",
      paymentHash: payment.externalId,
      settled: true,
      alreadyCredited: true,
      gasAmount: payment.gasAmount,
      balanceAfter: ws?.gasBalance ?? null,
      paymentId: payment.id,
      status: "COMPLETED",
    });
  }

  try {
    const status = await lookupLightningInvoice(paymentHash);

    if (!status.settled) {
      return apiSuccess({
        provider: "lightning",
        paymentHash: status.paymentHash,
        settled: false,
        state: status.state ?? "OPEN",
        paymentId: payment.id,
        status: payment.status,
      });
    }

    const settled = await settleGasPayment({
      paymentId: payment.id,
      metadata: {
        amtPaidSat: status.amtPaidSat,
        settleDate: status.settleDate,
        state: status.state,
      },
      description: `Lightning Gas recharge · ${payment.packageId} · ${payment.externalId}`,
    });

    return apiSuccess({
      provider: "lightning",
      paymentHash: status.paymentHash,
      settled: true,
      alreadyCredited: settled.alreadyCredited,
      gasAmount: settled.gasAmount,
      balanceAfter: settled.balanceAfter,
      ledgerId: settled.ledgerId,
      paymentId: settled.paymentId,
      status: settled.status,
    });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Lightning verify failed.",
      "LIGHTNING_VERIFY_FAILED",
      502
    );
  }
}
