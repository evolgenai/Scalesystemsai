import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  generateVerificationCode,
  verificationExpiry,
} from "@/lib/auth/verificationCodes";
import { sendVerificationEmail } from "@/lib/mail/sendVerification";
import { sendVerificationSms } from "@/lib/mail/sendSms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestCodesBody = {
  email?: string;
  purpose?: "signup" | "reset";
};

/**
 * POST /api/auth/request-codes
 * Regenerates dual email + phone verification codes for an account.
 */
export async function POST(request: Request) {
  let body: RequestCodesBody;
  try {
    body = (await request.json()) as RequestCodesBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const purpose = body.purpose === "signup" ? "signup" : "reset";
  if (!email) {
    return NextResponse.json(
      { success: false, error: "email is required." },
      { status: 400 }
    );
  }

  const user = await getPrisma().user.findUnique({
    where: { email },
    select: { id: true, email: true, phone: true },
  });

  if (!user) {
    // Avoid account enumeration.
    return NextResponse.json({
      success: true,
      message: "If the account exists, verification codes were dispatched.",
    });
  }

  if (!user.phone) {
    return NextResponse.json(
      {
        success: false,
        error: "Account is missing a phone number for dual-channel verification.",
      },
      { status: 400 }
    );
  }

  const emailCode = generateVerificationCode();
  const phoneCode = generateVerificationCode();
  const expiresAt = verificationExpiry(15);

  await getPrisma().user.update({
    where: { id: user.id },
    data: {
      emailCode,
      phoneCode,
      emailCodeExpiresAt: expiresAt,
      phoneCodeExpiresAt: expiresAt,
    },
  });

  const [emailSend, smsSend] = await Promise.all([
    sendVerificationEmail({ to: user.email, code: emailCode, purpose }),
    sendVerificationSms({ to: user.phone, code: phoneCode, purpose }),
  ]);

  return NextResponse.json({
    success: true,
    verification: {
      emailSent: emailSend.sent,
      smsSent: smsSend.sent,
      emailProvider: emailSend.provider,
      smsProvider: smsSend.provider,
    },
    message: "Dual-channel verification codes dispatched.",
  });
}
