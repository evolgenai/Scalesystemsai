/**
 * POST /api/affiliate/claim
 * Dispatch referral Gas credits when a referred workspace completes checkout.
 * Idempotent on gasPaymentId — duplicate claims return alreadyClaimed: true.
 */

import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { requireWorkspaceApiKeyGate } from "@/lib/auth/workspaceGate";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import {
  attributeReferral,
  claimReferralReward,
} from "@/lib/affiliate/referralRewards";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ClaimSchema = z.object({
  gasPaymentId: z.string().min(1).max(128),
  referralCode: z.string().min(2).max(64).optional().nullable(),
  /** Optional: attribute before claim when referred workspace presents a code. */
  attributeOnly: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof ClaimSchema>;
  try {
    const raw = await parseJsonBody(request);
    const parsed = ClaimSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message ?? "Invalid claim payload.",
        "INVALID_BODY",
        400
      );
    }
    body = parsed.data;
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const gate = await requireWorkspaceApiKeyGate(
    request,
    null
  );
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const prisma = getPrisma();

  try {
    if (body.attributeOnly && body.referralCode) {
      const attributed = await attributeReferral({
        referredWorkspaceId: gate.workspaceId,
        referralCode: body.referralCode,
      });
      if (attributed.rejected) {
        return apiError(
          attributed.reason ?? "Referral attribution rejected.",
          "AFFILIATE_FRAUD_BLOCKED",
          422,
          { "x-workspace-bound": gate.workspaceId }
        );
      }
      return apiSuccess(
        {
          attributed: true,
          attributionId: attributed.attributionId,
          referrerWorkspaceId: attributed.referrerWorkspaceId,
          status: attributed.status,
          rejected: false,
          reason: null,
        },
        200,
        { "x-workspace-bound": gate.workspaceId }
      );
    }

    const payment = await prisma.gasPayment.findUnique({
      where: { id: body.gasPaymentId },
      select: {
        id: true,
        workspaceId: true,
        status: true,
      },
    });

    if (!payment) {
      return apiError("GasPayment not found.", "PAYMENT_NOT_FOUND", 404);
    }

    // Claimant must be the referrer (reward recipient) or the referred payer.
    const attribution = await prisma.referralAttribution.findUnique({
      where: { referredWorkspaceId: payment.workspaceId },
      select: {
        referrerWorkspaceId: true,
        referredWorkspaceId: true,
      },
    });

    const allowed =
      gate.workspaceId === payment.workspaceId ||
      gate.workspaceId === attribution?.referrerWorkspaceId;

    if (!allowed) {
      // Allow claim when attributing for the first time with a code belonging to this gate.
      if (body.referralCode) {
        const code = await prisma.referralCode.findUnique({
          where: { code: body.referralCode.trim().toUpperCase() },
          select: { workspaceId: true },
        });
        if (
          !code ||
          (code.workspaceId !== gate.workspaceId &&
            payment.workspaceId !== gate.workspaceId)
        ) {
          return apiError(
            "Workspace is not a party to this referral claim.",
            "AFFILIATE_FORBIDDEN",
            403
          );
        }
      } else {
        return apiError(
          "Workspace is not a party to this referral claim.",
          "AFFILIATE_FORBIDDEN",
          403
        );
      }
    }

    if (body.referralCode && payment.workspaceId === gate.workspaceId) {
      await attributeReferral({
        referredWorkspaceId: gate.workspaceId,
        referralCode: body.referralCode,
      });
    }

    const result = await claimReferralReward({
      gasPaymentId: payment.id,
      referralCode: body.referralCode,
    });

    return apiSuccess(
      {
        claim: result,
      },
      200,
      { "x-workspace-bound": gate.workspaceId }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Referral claim failed.";
    const fraud =
      message.toLowerCase().includes("self-referral") ||
      message.toLowerCase().includes("rejected");
    return apiError(
      message,
      fraud ? "AFFILIATE_FRAUD_BLOCKED" : "AFFILIATE_CLAIM_FAILED",
      fraud ? 422 : 400
    );
  }
}
