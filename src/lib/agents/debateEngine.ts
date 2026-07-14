import { generateGeminiText } from "@/lib/agents/geminiOrchestrator";

export type DebateRole = "creator" | "critic";

export type DebateTurn = {
  role: DebateRole;
  text: string;
  engine: "gemini" | "heuristic";
};

export const CREATOR_SYSTEM_INSTRUCTION = [
  "You are the Creator agent in a ScaleSystems debate panel.",
  "Be optimistic, functional, and feature-heavy.",
  "Propose a bold, delivery-oriented approach that maximizes capability and operator value.",
  "Keep the argument concrete (3–6 short paragraphs or bullets). No orchestration metadata.",
].join(" ");

export const CRITIC_SYSTEM_INSTRUCTION = [
  "You are the Critic agent in a ScaleSystems debate panel.",
  "Be risk-focused, security-centric, and performance-first.",
  "Challenge the Creator proposal: call out failure modes, abuse paths, cost, and reliability debt.",
  "Keep the rebuttal concrete (3–6 short paragraphs or bullets). No orchestration metadata.",
].join(" ");

function heuristicCreator(objective: string): string {
  return [
    `**Creator proposal for:** ${objective.slice(0, 160)}`,
    "",
    "- Ship a feature-forward path that solves the operator goal with clear UX wins.",
    "- Prefer fast iteration, helpful defaults, and expandable capabilities.",
    "- Accept controlled risk in favor of momentum and demonstrable value.",
  ].join("\n");
}

function heuristicCritic(objective: string, creatorText: string): string {
  return [
    `**Critic rebuttal for:** ${objective.slice(0, 160)}`,
    "",
    "- Threat-model the Creator plan for security, abuse, and data exposure.",
    "- Demand performance budgets, failure isolation, and explicit rollback paths.",
    `- Counterpoint to Creator brief: ${creatorText.slice(0, 280)}${creatorText.length > 280 ? "…" : ""}`,
  ].join("\n");
}

/**
 * Turn-based Creator → Critic debate (two SSE-ready turns).
 * Final synthesis is deferred until a human vote selects the winning path.
 */
export async function runDebateTurns(
  objective: string,
  signal: AbortSignal,
  personaInstruction?: string
): Promise<DebateTurn[]> {
  const trimmed = objective.trim() || "General swarm objective";
  const turns: DebateTurn[] = [];
  const basePersona = personaInstruction?.trim();

  let creatorText: string;
  let creatorEngine: "gemini" | "heuristic" = "heuristic";
  try {
    creatorText = await generateGeminiText(
      [
        "Argue as the Creator for the operator objective.",
        "Return only the proposal content (markdown allowed).",
        "",
        `Objective: ${trimmed}`,
      ].join("\n"),
      signal,
      {
        json: false,
        maxOutputTokens: 512,
        systemInstruction: [CREATOR_SYSTEM_INSTRUCTION, basePersona]
          .filter(Boolean)
          .join("\n\n"),
      }
    );
    creatorEngine = "gemini";
  } catch {
    creatorText = heuristicCreator(trimmed);
  }

  turns.push({
    role: "creator",
    text: creatorText.trim() || heuristicCreator(trimmed),
    engine: creatorEngine,
  });

  if (signal.aborted) return turns;

  let criticText: string;
  let criticEngine: "gemini" | "heuristic" = "heuristic";
  try {
    criticText = await generateGeminiText(
      [
        "Argue as the Critic against the Creator proposal.",
        "Return only the rebuttal content (markdown allowed).",
        "",
        `Objective: ${trimmed}`,
        "",
        "Creator proposal:",
        turns[0]!.text.slice(0, 3500),
      ].join("\n"),
      signal,
      {
        json: false,
        maxOutputTokens: 512,
        systemInstruction: [CRITIC_SYSTEM_INSTRUCTION, basePersona]
          .filter(Boolean)
          .join("\n\n"),
      }
    );
    criticEngine = "gemini";
  } catch {
    criticText = heuristicCritic(trimmed, turns[0]!.text);
  }

  turns.push({
    role: "critic",
    text: criticText.trim() || heuristicCritic(trimmed, turns[0]!.text),
    engine: criticEngine,
  });

  return turns;
}

/**
 * Post-vote synthesis biased toward the winning role's strategy.
 */
export async function synthesizeWinningConsensus(input: {
  objective: string;
  vote: DebateRole;
  turns: DebateTurn[];
  signal: AbortSignal;
  personaInstruction?: string;
}): Promise<string> {
  const winner = input.turns.find((t) => t.role === input.vote);
  const loser = input.turns.find((t) => t.role !== input.vote);
  const winnerPrompt =
    input.vote === "creator"
      ? CREATOR_SYSTEM_INSTRUCTION
      : CRITIC_SYSTEM_INSTRUCTION;

  try {
    const text = await generateGeminiText(
      [
        `The operator voted for the **${input.vote}** strategy.`,
        "Produce the final Actual Results Pane answer that adopts the winning stance.",
        "Acknowledge one valid point from the opposing side, then deliver a decisive recommendation.",
        "Do NOT mention swarm routing, heuristics, or meta orchestration.",
        "",
        `Objective: ${input.objective}`,
        "",
        `Winning (${input.vote}) argument:`,
        (winner?.text ?? "").slice(0, 3500),
        "",
        `Opposing argument:`,
        (loser?.text ?? "").slice(0, 2000),
      ].join("\n"),
      input.signal,
      {
        json: false,
        maxOutputTokens: 640,
        systemInstruction: [winnerPrompt, input.personaInstruction]
          .filter(Boolean)
          .join("\n\n"),
      }
    );
    if (text.trim()) return text.trim();
  } catch {
    // Fall through.
  }

  return [
    `## Consensus (${input.vote})`,
    "",
    winner?.text?.trim() || `_No ${input.vote} brief was available._`,
    "",
    "---",
    "",
    `_Operator selected the ${input.vote} path._`,
  ].join("\n");
}
