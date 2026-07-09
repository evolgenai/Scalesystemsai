"use server";

import { auth } from "@/auth";
import {
  buildBvnkAuthorizationHeader,
  getBvnkHawkCredentials,
} from "@/lib/bvnkAuth";
import { resolvePlanFromPaymentAmount } from "@/lib/plans";
import type {
  BvnkPayInRequest,
  BvnkPayInResponse,
  FiatCurrency,
} from "@/types/bvnk";

const BVNK_API_BASE =
  process.env.BVNK_API_BASE_URL?.replace(/\/$/, "") ??
  "https://api.sandbox.bvnk.com";

export type CryptoPaymentIntentResult =
  | {
      success: true;
      redirectUrl: string;
      referenceId: string;
      checkoutId?: string;
      currency: FiatCurrency;
      amount: number;
    }
  | { success: false; error: string };

export async function prepareCryptoPaymentIntent(
  amount: number,
  userId: string,
  currency: FiatCurrency = "USD"
): Promise<CryptoPaymentIntentResult> {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.id !== userId) {
      return { success: false, error: "Unauthorized crypto checkout request." };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: "Amount must be greater than zero." };
    }

    const credentials = getBvnkHawkCredentials();
    const walletId = process.env.BVNK_WALLET_ID?.trim();

    if (!credentials) {
      console.error("[BVNK Checkout] Missing Hawk credentials.");
      return {
        success: false,
        error:
          "Crypto billing is not configured. Set BVNK_HAWK_AUTH_ID and BVNK_HAWK_AUTH_KEY in .env.",
      };
    }

    if (!walletId || walletId.includes("placeholder")) {
      console.error("[BVNK Checkout] Missing BVNK_WALLET_ID.");
      return {
        success: false,
        error:
          "Crypto billing is not configured. Set BVNK_WALLET_ID from your BVNK portal wallet.",
      };
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const referenceId = `ss-bvnk-${userId.slice(0, 8)}-${Date.now()}`;
    const endpoint = `${BVNK_API_BASE}/api/v1/pay/summary`;
    const targetPlan = resolvePlanFromPaymentAmount(amount) ?? "STARTER";

    const payload: BvnkPayInRequest = {
      walletId,
      type: "IN",
      amount,
      currency,
      reference: referenceId,
      returnUrl: `${baseUrl}/dashboard?billing=crypto-return`,
      expiryMinutes: 60,
      payInDetails: {
        currency: "USDT",
      },
      metadata: {
        userId,
        plan: targetPlan,
        service: `ScaleSystems ${targetPlan}`,
      },
    };

    const authorization = buildBvnkAuthorizationHeader(
      endpoint,
      "POST",
      credentials
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const responseBody = (await response.json().catch(() => ({}))) as
      | BvnkPayInResponse
      | { message?: string; error?: string };

    if (!response.ok) {
      const errorMessage =
        (typeof responseBody === "object" &&
          responseBody &&
          "message" in responseBody &&
          typeof responseBody.message === "string" &&
          responseBody.message) ||
        (typeof responseBody === "object" &&
          responseBody &&
          "error" in responseBody &&
          typeof responseBody.error === "string" &&
          responseBody.error) ||
        `BVNK checkout failed with status ${response.status}.`;

      console.error("[BVNK Checkout] API error:", {
        status: response.status,
        body: responseBody,
      });

      return { success: false, error: errorMessage };
    }

    const checkout = responseBody as BvnkPayInResponse;
    const redirectUrl = checkout.redirectUrl;

    if (!redirectUrl) {
      console.error("[BVNK Checkout] Missing redirectUrl in response:", checkout);
      return {
        success: false,
        error: "BVNK did not return a hosted checkout redirect URL.",
      };
    }

    console.info("[BVNK Checkout] Payment link created.", {
      userId,
      referenceId,
      checkoutId: checkout.uuid ?? checkout.id,
    });

    return {
      success: true,
      redirectUrl,
      referenceId,
      checkoutId: checkout.uuid ?? checkout.id,
      currency,
      amount,
    };
  } catch (error) {
    console.error("[BVNK Checkout] Unexpected failure:", error);
    return {
      success: false,
      error: "Unable to initiate crypto checkout.",
    };
  }
}
