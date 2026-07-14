import { getPrisma } from "@/lib/prisma";
import { generateGeminiText } from "@/lib/agents/geminiOrchestrator";

export type RecalledMemory = {
  id: string;
  fragment: string;
  keywords: string[];
  score: number;
  createdAt: Date;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "be",
  "as",
  "at",
  "by",
  "from",
  "this",
  "that",
  "it",
  "we",
  "our",
  "you",
  "your",
]);

/** Tokenize for BM25/keyword ranking (no embedding API required). */
export function tokenizeMemoryText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .slice(0, 48);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

/**
 * Lightweight BM25-ish score against a document's keyword list + fragment.
 * k1=1.2, b=0.75 with avgDl approximated from candidate set length.
 */
function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDl: number
): number {
  if (queryTokens.length === 0 || docTokens.length === 0) return 0;

  const tf = termFrequency(docTokens);
  const dl = docTokens.length;
  const k1 = 1.2;
  const b = 0.75;
  let score = 0;

  const uniqueQuery = [...new Set(queryTokens)];
  for (const term of uniqueQuery) {
    const f = tf.get(term) ?? 0;
    if (f === 0) continue;
    const idf = Math.log(1 + (1 / (1 + f)));
    const denom = f + k1 * (1 - b + b * (dl / Math.max(avgDl, 1)));
    score += idf * ((f * (k1 + 1)) / denom);
  }

  return score;
}

function memoryScopeWhere(userId: string, orgId: string | null) {
  if (orgId?.trim()) {
    return { orgId: orgId.trim() };
  }
  return { userId, orgId: null };
}

/**
 * Recall top-N WorkspaceMemory fragments for the objective (keyword/BM25).
 * Embedding providers are optional; this path always works without API keys.
 */
export async function recallMemories(
  userId: string,
  orgId: string | null,
  objective: string,
  limit = 3
): Promise<RecalledMemory[]> {
  if (!userId.trim()) return [];

  const queryTokens = tokenizeMemoryText(objective);
  if (queryTokens.length === 0) return [];

  try {
    const rows = await getPrisma().workspaceMemory.findMany({
      where: memoryScopeWhere(userId, orgId),
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        id: true,
        fragment: true,
        keywords: true,
        createdAt: true,
      },
    });

    if (rows.length === 0) return [];

    const docs = rows.map((row) => {
      const fromKeywords = row.keywords.map((k) => k.toLowerCase());
      const fromFragment = tokenizeMemoryText(row.fragment);
      return {
        row,
        tokens: [...fromKeywords, ...fromFragment],
      };
    });

    const avgDl =
      docs.reduce((sum, d) => sum + d.tokens.length, 0) / Math.max(docs.length, 1);

    const scored = docs
      .map(({ row, tokens }) => ({
        id: row.id,
        fragment: row.fragment,
        keywords: row.keywords,
        createdAt: row.createdAt,
        score: bm25Score(queryTokens, tokens, avgDl),
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit));

    return scored;
  } catch (error) {
    console.error("[memory-bank] recall failed", error);
    return [];
  }
}

export function formatRecalledContext(memories: RecalledMemory[]): string {
  if (memories.length === 0) return "";
  const body = memories
    .map((m, i) => `${i + 1}. ${m.fragment.trim()}`)
    .join("\n");
  return `📚 RECALLED CONTEXT FROM PAST SESSIONS:\n${body}`;
}

export async function storeMemory(
  userId: string,
  orgId: string | null,
  conversationSummary: string
): Promise<string | null> {
  const fragment = conversationSummary.trim().slice(0, 2000);
  if (!userId.trim() || !fragment) return null;

  const keywords = tokenizeMemoryText(fragment).slice(0, 24);

  try {
    const row = await getPrisma().workspaceMemory.create({
      data: {
        userId,
        orgId: orgId?.trim() || null,
        fragment,
        keywords,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    console.error("[memory-bank] store failed", error);
    return null;
  }
}

/**
 * One-sentence takeaway for long-term memory. Falls back without API keys.
 */
export async function summarizeRunTakeaway(
  objective: string,
  finalAnswer: string,
  signal: AbortSignal
): Promise<string> {
  const snippet = finalAnswer.trim().slice(0, 1200);
  try {
    const text = await generateGeminiText(
      [
        "Write ONE sentence key takeaway for long-term workspace memory.",
        "No markdown. No quotes. Max 28 words.",
        `Objective: ${objective.slice(0, 240)}`,
        `Final answer: ${snippet}`,
      ].join("\n"),
      signal,
      { json: false, maxOutputTokens: 64 }
    );
    const cleaned = text.replace(/^["']|["']$/g, "").trim();
    if (cleaned) return cleaned.slice(0, 320);
  } catch {
    // Fallback below when Gemini is unavailable.
  }

  const firstSentence =
    snippet.split(/(?<=[.!?])\s+/)[0]?.trim() ||
    `Completed objective: ${objective.slice(0, 120)}`;
  return firstSentence.slice(0, 320);
}

export async function listMemories(
  userId: string,
  orgId: string | null,
  take = 50
) {
  return getPrisma().workspaceMemory.findMany({
    where: memoryScopeWhere(userId, orgId),
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      orgId: true,
      userId: true,
      fragment: true,
      keywords: true,
      createdAt: true,
    },
  });
}

export async function deleteMemoryForUser(input: {
  memoryId: string;
  userId: string;
  orgId: string | null;
}): Promise<"ok" | "not_found" | "forbidden"> {
  const row = await getPrisma().workspaceMemory.findUnique({
    where: { id: input.memoryId },
    select: { id: true, userId: true, orgId: true },
  });
  if (!row) return "not_found";

  if (input.orgId?.trim()) {
    if (row.orgId !== input.orgId.trim()) return "forbidden";
  } else if (row.userId !== input.userId || row.orgId != null) {
    return "forbidden";
  }

  await getPrisma().workspaceMemory.delete({ where: { id: row.id } });
  return "ok";
}
