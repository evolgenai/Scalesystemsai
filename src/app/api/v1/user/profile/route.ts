import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);

  return NextResponse.json({
    id: profile.id,
    email: profile.email,
    role: profile.role,
    tier: profile.tier,
    plan: profile.plan,
    maxAgents: profile.maxAgents,
    isSuperAdmin: profile.isSuperAdmin,
  });
}
