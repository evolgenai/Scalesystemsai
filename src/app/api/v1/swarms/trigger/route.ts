import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth/apiTokenEngine";
import { createLiveSwarmSession } from "@/lib/agents/swarmSessionControl";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolvePersonaLabel(
  persona: string | undefined,
  userId: string,
  orgId: string | null
): Promise<string | null> {
  const key = persona?.trim();
  if (!key) return null;

  try {
    const custom = await getPrisma().workspacePersona.findFirst({
      where: {
        AND: [
          orgId ? { orgId } : { userId, orgId: null },
          { OR: [{ id: key }, { name: { equals: key, mode: "insensitive" } }] },
        ],
      },
      select: { name: true },
    });
    if (custom) return custom.name.slice(0, 64);
  } catch {
    // Fall through to raw persona label.
  }

  return key.slice(0, 64);
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.message },
      { status: auth.status }
    );
  }

  let body: { objective?: string; persona?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const objective = body.objective?.trim();
  if (!objective) {
    return NextResponse.json(
      { success: false, error: "objective is required." },
      { status: 400 }
    );
  }

  const { userId, orgId } = auth.context;
  const personaLabel = await resolvePersonaLabel(body.persona, userId, orgId);

  const sessionId = await createLiveSwarmSession({
    userId,
    orgId,
    objective,
    persona: personaLabel,
  });

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "Failed to initialize swarm session." },
      { status: 500 }
    );
  }

  const streamParams = new URLSearchParams({
    objective,
    sessionId,
  });
  if (personaLabel) streamParams.set("persona", personaLabel);
  if (orgId) streamParams.set("orgId", orgId);

  return NextResponse.json({
    success: true,
    sessionId,
    status: "ACTIVE",
    persona: personaLabel,
    streamEndpoint: `/api/agents/stream?${streamParams.toString()}`,
  });
}
