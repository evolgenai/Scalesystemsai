import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getMaxAgentsForTier } from "@/lib/billing/tiers";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { ScaleAgentOrchestrator } from "@/lib/agents/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORBIDDEN_BODY = {
  error: "Forbidden",
  message: "SUPER_ADMIN role required to deploy agent fleets.",
};

async function resolveFleetOwnerId(
  profile: Awaited<ReturnType<typeof resolveRequestUser>>
): Promise<string> {
  if (profile.id) return profile.id;

  const prisma = getPrisma();
  const overlord = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });

  if (overlord) return overlord.id;

  const email =
    profile.email ??
    process.env.DEV_USER_EMAIL?.trim() ??
    "overlord@scalesystems.ai";

  const created = await prisma.user.upsert({
    where: { email },
    update: {
      role: "SUPER_ADMIN",
      tier: profile.tier,
      maxAgents: profile.maxAgents,
    },
    create: {
      email,
      password: "fleet-admin-bootstrap",
      role: "SUPER_ADMIN",
      tier: profile.tier,
      maxAgents: getMaxAgentsForTier(profile.tier),
    },
    select: { id: true },
  });

  return created.id;
}

export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);

  if (!profile.isSuperAdmin) {
    return NextResponse.json(FORBIDDEN_BODY, { status: 403 });
  }

  try {
    const ownerId = await resolveFleetOwnerId(profile);
    const prisma = getPrisma();

    const activeFleet = await prisma.agent.count({
      where: { ownerId, status: { in: ["ACTIVE", "EXECUTING", "PLANNING"] } },
    });

    const totalFleet = await prisma.agent.count({
      where: { ownerId },
    });

    return NextResponse.json({
      activeFleet,
      totalFleet,
      maxAgents: profile.maxAgents,
      tier: profile.tier,
      ownerId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Fleet stats unavailable",
        message:
          error instanceof Error ? error.message : "Failed to read fleet ledger.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);

  if (!profile.isSuperAdmin) {
    return NextResponse.json(FORBIDDEN_BODY, { status: 403 });
  }

  let count = 100;

  try {
    const body = (await request.json()) as { count?: number };
    if (typeof body.count === "number" && body.count > 0) {
      count = Math.floor(body.count);
    }
  } catch {
    // Default batch size when body is empty.
  }

  try {
    const ownerId = await resolveFleetOwnerId(profile);
    const deployment = await ScaleAgentOrchestrator.spawnAgentFleet(
      ownerId,
      count
    );

    return NextResponse.json({
      success: true,
      manifest: {
        requested: count,
        provisioned: deployment.created,
        capped: deployment.capped,
        agentIds: deployment.agentIds,
        ownerId,
        tier: profile.tier,
        maxAgents: profile.maxAgents,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Fleet deployment failed.",
      },
      { status: 500 }
    );
  }
}
