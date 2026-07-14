import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { resolveOrgContext } from "@/lib/org/orgScope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  let body: { orgId?: string; email?: string; role?: string };
  try {
    body = (await request.json()) as {
      orgId?: string;
      email?: string;
      role?: string;
    };
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const orgId = body.orgId?.trim();
  const email = body.email?.trim().toLowerCase();
  const role =
    body.role === "ADMIN" || body.role === "MEMBER" ? body.role : "MEMBER";

  if (!orgId || !email) {
    return NextResponse.json(
      { success: false, error: "orgId and email are required." },
      { status: 400 }
    );
  }

  const actor = await resolveOrgContext(profile.id, orgId);
  if (!actor || (actor.role !== "OWNER" && actor.role !== "ADMIN")) {
    return NextResponse.json(
      { success: false, error: "Only OWNER or ADMIN can invite members." },
      { status: 403 }
    );
  }

  const prisma = getPrisma();
  const invitee = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!invitee) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No ScaleSystems user is registered with that email. Ask them to sign up first.",
      },
      { status: 404 }
    );
  }

  if (invitee.id === profile.id) {
    return NextResponse.json(
      { success: false, error: "You are already a member of this organization." },
      { status: 400 }
    );
  }

  const alreadyMember = await prisma.orgMembership.findUnique({
    where: { orgId_userId: { orgId: actor.orgId, userId: invitee.id } },
    select: { id: true },
  });
  if (alreadyMember) {
    return NextResponse.json(
      {
        success: false,
        error: "That user is already a member of this organization.",
      },
      { status: 409 }
    );
  }

  try {
    const membership = await prisma.orgMembership.create({
      data: {
        orgId: actor.orgId,
        userId: invitee.id,
        role,
      },
      select: {
        role: true,
        user: { select: { id: true, email: true, name: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return NextResponse.json({
      success: true,
      membership: {
        orgId: membership.organization.id,
        orgName: membership.organization.name,
        role: membership.role,
        user: membership.user,
      },
    });
  } catch (error) {
    console.error("[orgs/invite] failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to invite user." },
      { status: 500 }
    );
  }
}
