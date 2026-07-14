import { getPrisma } from "@/lib/prisma";
import { withSecureTransaction } from "@/lib/db/secureTransaction";
import {
  extractOrgIdFromRequest,
  resolveOrgContext,
} from "@/lib/org/orgScope";

export type LiveSwarmSessionStatus =
  | "ACTIVE"
  | "PAUSED"
  | "PENDING_CONSENSUS"
  | "COMPLETED"
  | "FAILED"
  | "TIMEOUT";

export type SwarmSessionLoopState = {
  id: string;
  status: LiveSwarmSessionStatus;
  interventionDirective: string | null;
  consensusVote: string | null;
  userId: string;
  orgId: string | null;
};

export function formatInterventionOverride(directive: string): string {
  const cleaned = directive.trim().slice(0, 4000);
  return `⚠️ OPERATOR INTERVENTION DIRECTIVE: ${cleaned}. Pivot execution immediately to satisfy this request.`;
}

/**
 * Open a live SwarmSession so the SSE loop can poll PAUSED/ACTIVE and HITL
 * directives while tools run.
 */
export async function createLiveSwarmSession(input: {
  userId: string;
  orgId?: string | null;
  objective: string;
}): Promise<string | null> {
  if (!input.userId.trim()) return null;
  try {
    const row = await getPrisma().swarmSession.create({
      data: {
        userId: input.userId,
        orgId: input.orgId ?? null,
        objective: input.objective.slice(0, 4000),
        resultMarkdown: "",
        kernelLogs: "[]",
        status: "ACTIVE",
        interventionDirective: null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    console.error("[swarm-session] create live failed", error);
    return null;
  }
}

/**
 * Prefer an existing SwarmSession when the client passes `sessionId`
 * (same org / personal owner). Falls back to creating a new live row.
 */
export async function resolveLiveSwarmSessionId(input: {
  userId: string;
  orgId?: string | null;
  objective: string;
  sessionId?: string | null;
}): Promise<string | null> {
  const requested = input.sessionId?.trim();
  if (!requested || !input.userId.trim()) {
    return createLiveSwarmSession(input);
  }

  try {
    const row = await getPrisma().swarmSession.findUnique({
      where: { id: requested },
      select: { id: true, userId: true, orgId: true },
    });

    if (row) {
      const scopedOrg = input.orgId?.trim() || null;
      const allowed = scopedOrg
        ? row.orgId === scopedOrg
        : row.userId === input.userId && row.orgId == null;

      if (allowed) {
        await getPrisma().swarmSession.update({
          where: { id: row.id },
          data: {
            status: "ACTIVE",
            objective: input.objective.slice(0, 4000),
          },
        });
        return row.id;
      }
    }
  } catch (error) {
    console.error("[swarm-session] resolve live failed", error);
  }

  return createLiveSwarmSession(input);
}

export async function getSwarmSessionLoopState(
  sessionId: string
): Promise<SwarmSessionLoopState | null> {
  const row = await getPrisma().swarmSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      interventionDirective: true,
      consensusVote: true,
      userId: true,
      orgId: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as LiveSwarmSessionStatus,
    interventionDirective: row.interventionDirective,
    consensusVote: row.consensusVote,
    userId: row.userId,
    orgId: row.orgId,
  };
}

/**
 * Read + clear the pending directive atomically so it is only applied once.
 */
export async function consumeInterventionDirective(
  sessionId: string
): Promise<string | null> {
  return withSecureTransaction(async (tx) => {
    const row = await tx.swarmSession.findUnique({
      where: { id: sessionId },
      select: { interventionDirective: true },
    });
    if (!row?.interventionDirective?.trim()) return null;

    const directive = row.interventionDirective.trim();
    await tx.swarmSession.update({
      where: { id: sessionId },
      data: { interventionDirective: null },
    });
    return directive;
  });
}

export async function markPendingConsensus(
  sessionId: string
): Promise<void> {
  await getPrisma().swarmSession.update({
    where: { id: sessionId },
    data: {
      status: "PENDING_CONSENSUS" satisfies LiveSwarmSessionStatus,
      consensusVote: null,
    },
  });
}

/**
 * Wait helper: consume winning vote once status is ACTIVE with consensusVote set.
 */
export async function consumeConsensusVote(
  sessionId: string
): Promise<"creator" | "critic" | null> {
  return withSecureTransaction(async (tx) => {
    const row = await tx.swarmSession.findUnique({
      where: { id: sessionId },
      select: { consensusVote: true, status: true },
    });
    const vote = row?.consensusVote?.trim().toLowerCase();
    if (vote !== "creator" && vote !== "critic") return null;
    if (row?.status === "PENDING_CONSENSUS") return null;

    await tx.swarmSession.update({
      where: { id: sessionId },
      data: { consensusVote: null },
    });
    return vote;
  });
}

export async function appendSessionKernelNote(
  sessionId: string,
  note: string
): Promise<void> {
  try {
    const row = await getPrisma().swarmSession.findUnique({
      where: { id: sessionId },
      select: { kernelLogs: true },
    });
    if (!row) return;

    let logs: unknown[] = [];
    try {
      const parsed = JSON.parse(row.kernelLogs) as unknown;
      if (Array.isArray(parsed)) logs = parsed;
    } catch {
      logs = [];
    }

    logs.push({
      type: "log",
      message: note,
      stage: "hitl",
      timestamp: new Date().toISOString(),
    });

    await getPrisma().swarmSession.update({
      where: { id: sessionId },
      data: { kernelLogs: JSON.stringify(logs).slice(0, 500_000) },
    });
  } catch (error) {
    console.error("[swarm-session] append kernel note failed", error);
  }
}

/**
 * Authorize mutate access: personal owner, or active org member when scoped.
 */
export async function assertSwarmSessionAccess(
  request: Request,
  userId: string,
  session: { userId: string; orgId: string | null }
): Promise<{ ok: true } | { ok: false; status: 403; message: string }> {
  const headerOrgId = extractOrgIdFromRequest(request);

  if (headerOrgId) {
    const membership = await resolveOrgContext(userId, headerOrgId);
    if (!membership) {
      return {
        ok: false,
        status: 403,
        message:
          "Organization membership is required to intervene on this session.",
      };
    }
    if (!session.orgId || session.orgId !== membership.orgId) {
      return {
        ok: false,
        status: 403,
        message: "Session does not belong to the active organization.",
      };
    }
    return { ok: true };
  }

  if (session.orgId) {
    // Org-owned session without x-org-id: require membership on that org.
    const membership = await resolveOrgContext(userId, session.orgId);
    if (!membership) {
      return {
        ok: false,
        status: 403,
        message: "You are not a member of the session organization.",
      };
    }
    return { ok: true };
  }

  if (session.userId !== userId) {
    return {
      ok: false,
      status: 403,
      message: "Only the session owner may intervene in personal mode.",
    };
  }

  return { ok: true };
}
