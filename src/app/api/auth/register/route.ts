import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { trackServerFunnel } from "@/lib/analytics/serverFunnel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RegisterRequest = {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RegisterRequest;

  try {
    body = (await request.json()) as RegisterRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const firstName = body.firstName?.trim() || "";
  const lastName = body.lastName?.trim() || "";
  const name =
    body.name?.trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim();

  if (!email || !password) {
    trackServerFunnel({
      event: "auth_failure",
      metadata: { mode: "signup", reason: "missing_fields" },
    });
    return NextResponse.json(
      { success: false, error: "Both email and password are required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Name is required." },
      { status: 400 }
    );
  }

  try {
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      trackServerFunnel({
        event: "auth_failure",
        metadata: { mode: "signup", reason: "email_taken" },
      });
      return NextResponse.json(
        { success: false, error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        plan: "FREE",
      },
      select: { id: true, email: true, name: true },
    });

    trackServerFunnel({
      event: "auth_success",
      metadata: { mode: "signup" },
    });

    const [given, ...rest] = (user.name ?? name).split(" ");
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: firstName || given || "Operator",
        lastName: lastName || rest.join(" "),
        name: user.name ?? name,
      },
    });
  } catch (error) {
    trackServerFunnel({
      event: "auth_failure",
      metadata: { mode: "signup", reason: "server_error" },
    });
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to register user.",
      },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: "Method not allowed. This endpoint only accepts POST requests.",
      code: "METHOD_NOT_ALLOWED",
    },
    { status: 405 }
  );
}
