import type { AgentStreamEvent } from "@/lib/agents/streamProtocol";
import { getPrisma } from "@/lib/prisma";

export type SwarmSessionStatus = "COMPLETED" | "FAILED" | "TIMEOUT";

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
 * Persist a finished swarm to Workspace Memory. Fire-and-forget safe —
 * never throws into the SSE path.
 */
export async function persistSwarmSession(input: {
  userId: string;
  orgId?: string | null;
  objective: string;
  events: AgentStreamEvent[];
  status?: SwarmSessionStatus;
}): Promise<void> {
  if (!input.userId.trim() || input.events.length === 0) return;

  try {
    await getPrisma().swarmSession.create({
      data: {
        userId: input.userId,
        orgId: input.orgId ?? null,
        objective: input.objective.slice(0, 4000),
        resultMarkdown: buildResultMarkdown(input.events),
        kernelLogs: JSON.stringify(input.events),
        status: input.status ?? "COMPLETED",
      },
    });
  } catch (error) {
    console.error("[swarm-session] persist failed", error);
  }
}
