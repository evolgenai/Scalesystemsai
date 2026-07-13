import { NextRequest, NextResponse } from "next/server";

// Stub endpoint for future user registration. This is intentionally a
// placeholder so the module compiles cleanly; it does not yet persist users.

type RegisterRequest = {
  name?: string;
  email?: string;
  password?: string;
};

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  let body: RegisterRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Both email and password are required." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: "User registration is not implemented yet.",
      code: "NOT_IMPLEMENTED",
    },
    { status: 501 }
  );
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
