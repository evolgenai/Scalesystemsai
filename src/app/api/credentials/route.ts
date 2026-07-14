import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { extractOrgIdFromRequest } from "@/lib/org/orgScope";
import {
  listDeveloperCredentials,
  upsertDeveloperCredential,
} from "@/lib/db/developerCredentials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required.", credentials: [] },
      { status: 401 }
    );
  }

  const orgId = extractOrgIdFromRequest(request);
  try {
    const credentials = await listDeveloperCredentials(profile.id, orgId);
    return NextResponse.json({ success: true, credentials });
  } catch (error) {
    console.error("[credentials] list failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to load credentials.", credentials: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  let body: { provider?: string; secret?: string; label?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const provider = body.provider?.trim();
  const secret = body.secret?.trim();
  if (!provider || !secret) {
    return NextResponse.json(
      { success: false, error: "provider and secret are required." },
      { status: 400 }
    );
  }

  const orgId = extractOrgIdFromRequest(request);
  try {
    const credential = await upsertDeveloperCredential({
      userId: profile.id,
      orgId,
      provider,
      secret,
      label: body.label,
    });
    return NextResponse.json({ success: true, credential });
  } catch (error) {
    console.error("[credentials] upsert failed", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to store credential.",
      },
      { status: 400 }
    );
  }
}
