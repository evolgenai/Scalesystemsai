import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  listUserOrganizations,
  slugifyOrgName,
} from "@/lib/org/orgScope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required.", organizations: [] },
      { status: 401 }
    );
  }

  try {
    const organizations = await listUserOrganizations(profile.id);
    return NextResponse.json({ success: true, organizations });
  } catch (error) {
    console.error("[orgs] list failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to load organizations.", organizations: [] },
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

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const name = body.name?.trim();
  if (!name || name.length < 2) {
    return NextResponse.json(
      { success: false, error: "Organization name must be at least 2 characters." },
      { status: 400 }
    );
  }

  const prisma = getPrisma();
  let slug = slugifyOrgName(name);
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  try {
    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name, slug },
        select: { id: true, name: true, slug: true },
      });
      await tx.orgMembership.create({
        data: {
          orgId: created.id,
          userId: profile.id!,
          role: "OWNER",
        },
      });
      return created;
    });

    return NextResponse.json({
      success: true,
      organization: { ...org, role: "OWNER" as const },
    });
  } catch (error) {
    console.error("[orgs] create failed", error);
    return NextResponse.json(
      { success: false, error: "Unable to create organization." },
      { status: 500 }
    );
  }
}
