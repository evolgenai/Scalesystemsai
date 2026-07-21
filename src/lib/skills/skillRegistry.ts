/**
 * Built-in @skills registry for ScaleAgent robots.
 * Skills are modular capability packs equipped via POST /api/skills/install.
 */

export type SkillCapability =
  | "deploy"
  | "domains"
  | "browser"
  | "scrape"
  | "pull_requests"
  | "issues"
  | "payments"
  | "payment_links";

export type SkillGasKind = "ai_agent" | "scraper" | "webhook_trigger";

export type BuiltinSkillId =
  | "@vercel"
  | "@playwright"
  | "@github"
  | "@stripe";

export type BuiltinSkillDefinition = {
  id: BuiltinSkillId;
  name: string;
  description: string;
  version: string;
  /** Gas charged when the skill is invoked via agent.run() / learn+run. */
  invokeGas: number;
  /** Gas charged once when installing onto an agent. */
  installGas: number;
  gasKind: SkillGasKind;
  capabilities: SkillCapability[];
  /** Python SDK methods exposed on ScaleAgent after learn_skill. */
  pythonMethods: string[];
};

export const BUILTIN_SKILLS: Record<BuiltinSkillId, BuiltinSkillDefinition> = {
  "@vercel": {
    id: "@vercel",
    name: "Vercel Deploy",
    description: "Deployment triggers and domain management for Vercel projects.",
    version: "1.0.0",
    invokeGas: 40,
    installGas: 10,
    gasKind: "ai_agent",
    capabilities: ["deploy", "domains"],
    pythonMethods: ["deploy", "list_domains", "bind_domain"],
  },
  "@playwright": {
    id: "@playwright",
    name: "Playwright Browser",
    description: "Headless browser scraping and DOM extraction.",
    version: "1.0.0",
    invokeGas: 50,
    installGas: 10,
    gasKind: "scraper",
    capabilities: ["browser", "scrape"],
    pythonMethods: ["goto", "extract", "screenshot"],
  },
  "@github": {
    id: "@github",
    name: "GitHub Automation",
    description: "Automated pull requests and issue handling.",
    version: "1.0.0",
    invokeGas: 35,
    installGas: 10,
    gasKind: "ai_agent",
    capabilities: ["pull_requests", "issues"],
    pythonMethods: ["open_pr", "comment_issue", "list_issues"],
  },
  "@stripe": {
    id: "@stripe",
    name: "Stripe Payments",
    description: "Payment link generation and checkout helpers.",
    version: "1.0.0",
    invokeGas: 30,
    installGas: 10,
    gasKind: "ai_agent",
    capabilities: ["payments", "payment_links"],
    pythonMethods: ["create_payment_link", "list_products"],
  },
};

export const BUILTIN_SKILL_IDS = Object.keys(BUILTIN_SKILLS) as BuiltinSkillId[];

/** Base gas for a sandboxed Python terminal evaluation (no ScaleAgent DSL). */
export const PYTHON_TERMINAL_BASE_GAS = 15 as const;

/** Extra gas when ScaleAgent aliases are parsed and executed. */
export const SCALE_AGENT_PARSE_GAS = 10 as const;

export function normalizeSkillId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function isBuiltinSkillId(id: string): id is BuiltinSkillId {
  return id in BUILTIN_SKILLS;
}

export function getSkill(id: string): BuiltinSkillDefinition | null {
  const normalized = normalizeSkillId(id);
  if (!isBuiltinSkillId(normalized)) return null;
  return BUILTIN_SKILLS[normalized];
}

export function listBuiltinSkills(): BuiltinSkillDefinition[] {
  return BUILTIN_SKILL_IDS.map((id) => BUILTIN_SKILLS[id]);
}

export function skillGasNodeType(skillId: string): string {
  const normalized = normalizeSkillId(skillId).replace("@", "");
  return `skill_${normalized || "unknown"}`;
}

/**
 * Calculate total gas for a Python terminal run given skills learned/invoked.
 */
export function calculateTerminalGas(input: {
  hasScaleAgent: boolean;
  skillsInvoked: string[];
}): { total: number; breakdown: Array<{ kind: string; amount: number }> } {
  const breakdown: Array<{ kind: string; amount: number }> = [
    { kind: "python_terminal", amount: PYTHON_TERMINAL_BASE_GAS },
  ];
  let total = PYTHON_TERMINAL_BASE_GAS;

  if (input.hasScaleAgent) {
    breakdown.push({ kind: "scale_agent_parse", amount: SCALE_AGENT_PARSE_GAS });
    total += SCALE_AGENT_PARSE_GAS;
  }

  const seen = new Set<string>();
  for (const raw of input.skillsInvoked) {
    const skill = getSkill(raw);
    if (!skill || seen.has(skill.id)) continue;
    seen.add(skill.id);
    breakdown.push({ kind: skillGasNodeType(skill.id), amount: skill.invokeGas });
    total += skill.invokeGas;
  }

  return { total, breakdown };
}
