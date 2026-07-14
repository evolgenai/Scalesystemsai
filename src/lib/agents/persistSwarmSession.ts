import type { AgentStreamEvent } from "@/lib/agents/streamProtocol";
import { getPrisma } from "@/lib/prisma";
import type { LiveSwarmSessionStatus } from "@/lib/agents/swarmSessionControl";

export type SwarmSessionStatus =
  | LiveSwarmSessionStatus
  | "COMPLETED"
  | "FAILED"
  | "TIMEOUT";

/**
 * Collapse result/summary frames into a single left-pane markdown document.
 */
export function buildResultMarkdown(events: AgentStreamEvent[]): string {
  const chunks: string[] = [];

  for (const event of events) {
    if (event.resultMarkdown?.trim()) {
      chunks.push(event.resultMarkdown.trim());
      continue;
    }
    if (event.type === "result" || event.type === "summary") {
      const text = event.message.trim();
      if (text) chunks.push(text);
    }
  }

  return chunks.length > 0
    ? chunks.join("\n\n---\n\n")
    : "_No digests were captured for this run._";
}

/**
 * Persist a finished swarm to Workspace Memory. Updates an existing live
 * session when `sessionId` is provided; otherwise creates a row.
 * Fire-and-forget safe — never throws into the SSE path.
 */
export async function persistSwarmSession(input: {
  userId: string;
  orgId?: string | null;
  sessionId?: string | null;
  objective: string;
  events: AgentStreamEvent[];
  status?: SwarmSessionStatus;
  durationMs?: number;
  creditsUsed?: number;
  tokensUsed?: number;
  persona?: string | null;
  hitlUsed?: boolean;
}): Promise<void> {
  if (!input.userId.trim() || input.events.length === 0) return;

  const kernelLogs = JSON.stringify(input.events);
  const tokensUsed =
    input.tokensUsed ??
    Math.max(1, Math.ceil(kernelLogs.length / 4));

  const data = {
    objective: input.objective.slice(0, 4000),
    resultMarkdown: buildResultMarkdown(input.events),
    kernelLogs,
    status: input.status ?? "COMPLETED",
    interventionDirective: null,
    consensusVote: null,
    durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
    creditsUsed: Math.max(0, Math.round(input.creditsUsed ?? 1)),
    tokensUsed,
    persona: input.persona?.trim()?.slice(0, 64) || null,
    ...(input.hitlUsed ? { hitlUsed: true } : {}),
  };

  try {
    if (input.sessionId?.trim()) {
      await getPrisma().swarmSession.update({
        where: { id: input.sessionId.trim() },
        data,
      });
      return;
    }

    await getPrisma().swarmSession.create({
      data: {
        userId: input.userId,
        orgId: input.orgId ?? null,
        hitlUsed: Boolean(input.hitlUsed),
        ...data,
      },
    });
  } catch (error) {
    console.error("[swarm-session] persist failed", error);
  }
}
