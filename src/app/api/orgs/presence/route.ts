import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";
import {
  listActivePresence,
  upsertPresence,
} from "@/lib/org/presenceManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PresencePostBody = {
  currentActivity?: string;
  name?: string;
};

function forbidden(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: "ORG_ACCESS_DENIED",
      presence: [] as unknown[],
    },
    { status: 403 }
  );
}

/**
 * GET /api/orgs/presence
 * Lists active collaborators in the org (excluding the caller).
 * Requires `x-org-id`.
 */
export async function GET(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required.", presence: [] },
      { status: 401 }
    );
  }

  const orgKey = extractOrgIdFromRequest(request);
  if (!orgKey) {
    return forbidden("x-org-id header is required.");
  }

  const membership = await resolveOrgContext(profile.id, orgKey);
  if (!membership) {
    return forbidden("You are not a member of this organization.");
  }

  const presence = listActivePresence(membership.orgId, {
    excludeUserId: profile.id,
  }).map((entry) => ({
    userId: entry.userId,
    name: entry.name,
    lastActive: entry.lastActive.toISOString(),
    currentActivity: entry.currentActivity,
  }));

  return NextResponse.json({
    success: true,
    orgId: membership.orgId,
    presence,
  });
}

/**
 * POST /api/orgs/presence — heartbeat
 * Header: x-org-id (required)
 * Body: { currentActivity?, name? }
 */
export async function POST(request: Request) {
  const profile = await resolveRequestUser(request);
  if (!profile.id) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 }
    );
  }

  const orgKey = extractOrgIdFromRequest(request);
  if (!orgKey) {
    return forbidden("x-org-id header is required.");
  }

  const membership = await resolveOrgContext(profile.id, orgKey);
  if (!membership) {
    return forbidden("You are not a member of this organization.");
  }

  let body: PresencePostBody = {};
  try {
    body = (await request.json()) as PresencePostBody;
  } catch {
    // Empty body is fine — activity defaults to "online".
  }

  const displayName =
    body.name?.trim() ||
    profile.email?.split("@")[0] ||
    profile.id;

  const entry = upsertPresence({
    orgId: membership.orgId,
    userId: profile.id,
    name: displayName,
    currentActivity: body.currentActivity,
  });

  const peers = listActivePresence(membership.orgId, {
    excludeUserId: profile.id,
  }).map((peer) => ({
    userId: peer.userId,
    name: peer.name,
    lastActive: peer.lastActive.toISOString(),
    currentActivity: peer.currentActivity,
  }));

  return NextResponse.json({
    success: true,
    orgId: membership.orgId,
    self: {
      userId: entry.userId,
      name: entry.name,
      lastActive: entry.lastActive.toISOString(),
      currentActivity: entry.currentActivity,
    },
    presence: peers,
  });
}
