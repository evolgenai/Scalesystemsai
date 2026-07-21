import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { trackServerFunnel } from "@/lib/analytics/serverFunnel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPERADMIN_EMAIL = "superadmin@scalesystemsai.com";
const SUPERADMIN_USERNAME = "superadmin";
const SUPERADMIN_PASSWORD = "superadmin";

type LoginRequest = {
  email?: string;
  password?: string;
  identifier?: string;
};

function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

function isSuperadminIdentifier(id: string): boolean {
  return id === SUPERADMIN_USERNAME || id === SUPERADMIN_EMAIL;
}

function superadminUserPayload(overrides?: {
  id?: string;
  email?: string;
  name?: string;
}) {
  return {
    id: overrides?.id ?? "local-superadmin",
    email: overrides?.email ?? "Superadmin@scalesystemsai.com",
    firstName: "Superadmin",
    lastName: "",
    name: overrides?.name ?? "Superadmin",
  };
}

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

  const identifier = normalizeIdentifier(
    body.identifier ?? body.email ?? ""
  );
  const password = body.password ?? "";

  if (!identifier || !password) {
    return NextResponse.json(
      {
        success: false,
        error: "Email/username and password are required.",
      },
      { status: 400 }
    );
  }

  // Case-insensitive Superadmin shortcut (email OR username + password).
  if (
    isSuperadminIdentifier(identifier) &&
    password.trim().toLowerCase() === SUPERADMIN_PASSWORD
  ) {
    try {
      const prisma = getPrisma();
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: SUPERADMIN_EMAIL, mode: "insensitive" } },
            { username: { equals: SUPERADMIN_USERNAME, mode: "insensitive" } },
          ],
        },
        select: { id: true, email: true, name: true },
      });
      trackServerFunnel({
        event: "auth_success",
        metadata: { mode: "signin", identity: "superadmin" },
      });
      return NextResponse.json({
        success: true,
        user: superadminUserPayload(
          dbUser
            ? {
                id: dbUser.id,
                email: dbUser.email,
                name: dbUser.name ?? "Superadmin",
              }
            : undefined
        ),
      });
    } catch {
      trackServerFunnel({
        event: "auth_success",
        metadata: { mode: "signin", identity: "superadmin_local" },
      });
      return NextResponse.json({
        success: true,
        user: superadminUserPayload(),
      });
    }
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: "insensitive" } },
          { username: { equals: identifier, mode: "insensitive" } },
          { name: { equals: identifier, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        password: true,
      },
    });

    if (!user) {
      trackServerFunnel({
        event: "auth_failure",
        metadata: { mode: "signin", reason: "not_found" },
      });
      return NextResponse.json(
        { success: false, error: "Invalid email/username or password." },
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
        { success: false, error: "Invalid email/username or password." },
        { status: 401 }
      );
    }

    trackServerFunnel({
      event: "auth_success",
      metadata: { mode: "signin" },
    });

    const parts = (user.name ?? user.username ?? "Operator")
      .trim()
      .split(/\s+/);
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: parts[0] || "Operator",
        lastName: parts.slice(1).join(" "),
        name: user.name ?? user.username ?? "Operator",
      },
    });
  } catch (error) {
    if (
      isSuperadminIdentifier(identifier) &&
      password.trim().toLowerCase() === SUPERADMIN_PASSWORD
    ) {
      return NextResponse.json({
        success: true,
        user: superadminUserPayload(),
      });
    }

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
