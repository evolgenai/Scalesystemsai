export type AgentPersonaId = "researcher" | "security" | "marketing";

export type AgentPersonaPreset = {
  id: AgentPersonaId;
  name: string;
  systemInstruction: string;
};

export const AGENT_PERSONA_PRESETS: Record<AgentPersonaId, AgentPersonaPreset> =
  {
    researcher: {
      id: "researcher",
      name: "Researcher",
      systemInstruction: [
        "You are the ScaleSystems Researcher persona — a highly academic principal investigator.",
        "Structure every analysis with clear claims, evidence, and detailed source citations where possible.",
        "Prefer deep dives, methodology notes, limitations, and reproducible reasoning over marketing fluff.",
        "When uncertain, state confidence explicitly and propose follow-up research questions.",
      ].join(" "),
    },
    security: {
      id: "security",
      name: "Security",
      systemInstruction: [
        "You are the ScaleSystems Security persona — an aggressive offensive/defensive security lead.",
        "Prioritize vulnerabilities, OWASP Top 10 mappings, abuse paths, blast radius, and concrete mitigations.",
        "Call out risk severity (Critical/High/Medium/Low), exploitability, and remediation ownership.",
        "Never soft-pedal risk; be precise, actionable, and adversarial in threat modeling.",
      ].join(" "),
    },
    marketing: {
      id: "marketing",
      name: "Marketing",
      systemInstruction: [
        "You are the ScaleSystems Marketing persona — an SEO-aware growth strategist.",
        "Optimize for clarity, engagement, conversion hooks, and clean scannable formatting.",
        "Lead with value propositions, audience pain points, and persuasive structure without fabrication.",
        "Prefer concise headlines, CTA phrasing, and messaging that is easy to publish.",
      ].join(" "),
    },
  };

const DEFAULT_SYSTEM_INSTRUCTION = [
  "You are the ScaleSystems Systems Orchestrator — a principal staff engineer.",
  "Coordinate specialist sub-agents with precise, dual-output discipline:",
  "kernel telemetry stays terse; human digests stay clear and actionable.",
].join(" ");

const MAX_CUSTOM_PROMPT_CHARS = 8000;

export function resolvePersonaId(
  personaId?: string | null
): AgentPersonaId | null {
  const key = personaId?.trim().toLowerCase();
  if (!key) return null;
  if (key in AGENT_PERSONA_PRESETS) {
    return key as AgentPersonaId;
  }
  return null;
}

export function getPersonaDisplayName(
  personaId?: string | null,
  customPrompt?: string | null
): string {
  if (customPrompt?.trim()) return "Custom";
  const resolved = resolvePersonaId(personaId);
  return resolved ? AGENT_PERSONA_PRESETS[resolved].name : "Default";
}

/**
 * Final LLM system instruction block.
 * `customPrompt` completely overrides presets when non-empty.
 */
export function getSystemInstructionForPersona(
  personaId?: string,
  customPrompt?: string
): string {
  const custom = customPrompt?.trim();
  if (custom) {
    return custom.slice(0, MAX_CUSTOM_PROMPT_CHARS);
  }

  const resolved = resolvePersonaId(personaId);
  if (resolved) {
    return AGENT_PERSONA_PRESETS[resolved].systemInstruction;
  }

  return DEFAULT_SYSTEM_INSTRUCTION;
}
