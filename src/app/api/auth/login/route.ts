import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { trackServerFunnel } from "@/lib/analytics/serverFunnel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LoginRequest = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: LoginRequest;
  try {
    body = (await request.json()) as LoginRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Email and password are required." },
      { status: 400 }
    );
  }

  try {
    const user = await getPrisma().user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true },
    });

    if (!user) {
      trackServerFunnel({
        event: "auth_failure",
        metadata: { mode: "signin", reason: "not_found" },
      });
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      trackServerFunnel({
        event: "auth_failure",
        metadata: { mode: "signin", reason: "bad_password" },
      });
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    trackServerFunnel({
      event: "auth_success",
      metadata: { mode: "signin" },
    });

    const parts = (user.name ?? "Operator").trim().split(/\s+/);
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: parts[0] || "Operator",
        lastName: parts.slice(1).join(" "),
        name: user.name ?? "Operator",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unable to sign in.",
      },
      { status: 500 }
    );
  }
}
