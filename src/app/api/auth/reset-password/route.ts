import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { isCodeActive } from "@/lib/auth/verificationCodes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResetBody = {
  email?: string;
  emailCode?: string;
  phoneCode?: string;
  newPassword?: string;
  password?: string;
};

/**
 * POST /api/auth/reset-password
 * Requires BOTH active emailCode and phoneCode before updating password.
 */
export async function POST(request: Request) {
  let body: ResetBody;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const emailCode = body.emailCode?.trim();
  const phoneCode = body.phoneCode?.trim();
  const newPassword = body.newPassword ?? body.password ?? "";

  if (!email || !emailCode || !phoneCode || !newPassword) {
    return NextResponse.json(
      {
        success: false,
        error:
          "email, emailCode, phoneCode, and newPassword are all required.",
      },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const user = await getPrisma().user.findUnique({
    where: { email },
    select: {
      id: true,
      emailCode: true,
      emailCodeExpiresAt: true,
      phoneCode: true,
      phoneCodeExpiresAt: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Account not found." },
      { status: 404 }
    );
  }

  const emailOk = isCodeActive(
    user.emailCode,
    user.emailCodeExpiresAt,
    emailCode
  );
  const phoneOk = isCodeActive(
    user.phoneCode,
    user.phoneCodeExpiresAt,
    phoneCode
  );

  if (!emailOk || !phoneOk) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Both email and phone verification codes must be valid and unexpired.",
        emailCodeValid: emailOk,
        phoneCodeValid: phoneOk,
      },
      { status: 403 }
    );
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await getPrisma().user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      emailCode: null,
      phoneCode: null,
      emailCodeExpiresAt: null,
      phoneCodeExpiresAt: null,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    message: "Password updated. Dual-channel verification codes cleared.",
  });
}
