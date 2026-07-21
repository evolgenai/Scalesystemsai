/**
 * Python ScaleAgent SDK bridge — parses Virtual Terminal agent aliases and
 * injects a sandboxed Python stub so `ScaleAgent('alias')` scripts execute.
 *
 * Supported DSL:
 *   agent = ScaleAgent('deployer')
 *   agent.learn_skill('@vercel')
 *   agent.run()
 */

import {
  getSkill,
  listBuiltinSkills,
  normalizeSkillId,
  type BuiltinSkillDefinition,
  type BuiltinSkillId,
} from "@/lib/skills/skillRegistry";

export type ScaleAgentAlias = {
  variable: string;
  alias: string;
  line: number;
};

export type ScaleAgentLearnCall = {
  variable: string;
  skillId: string;
  line: number;
};

export type ScaleAgentRunCall = {
  variable: string;
  line: number;
};

export type ParsedScaleAgentScript = {
  hasScaleAgent: boolean;
  aliases: ScaleAgentAlias[];
  learnCalls: ScaleAgentLearnCall[];
  runCalls: ScaleAgentRunCall[];
  /** Unique skill ids referenced via learn_skill. */
  skillsLearned: string[];
  /** Skills that will execute because learn + run share an alias variable. */
  skillsInvoked: string[];
};

const ALIAS_RE =
  /^\s*([A-Za-z_][\w]*)\s*=\s*ScaleAgent\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
const LEARN_RE =
  /^\s*([A-Za-z_][\w]*)\s*\.\s*learn_skill\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
const RUN_RE = /^\s*([A-Za-z_][\w]*)\s*\.\s*run\s*\(\s*\)/gm;

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

/**
 * Parse ScaleAgent aliases from a Python payload without executing it.
 */
export function parseScaleAgentScript(code: string): ParsedScaleAgentScript {
  const aliases: ScaleAgentAlias[] = [];
  const learnCalls: ScaleAgentLearnCall[] = [];
  const runCalls: ScaleAgentRunCall[] = [];

  for (const match of code.matchAll(ALIAS_RE)) {
    aliases.push({
      variable: match[1]!,
      alias: match[2]!.trim(),
      line: lineNumberAt(code, match.index ?? 0),
    });
  }

  for (const match of code.matchAll(LEARN_RE)) {
    learnCalls.push({
      variable: match[1]!,
      skillId: normalizeSkillId(match[2]!),
      line: lineNumberAt(code, match.index ?? 0),
    });
  }

  for (const match of code.matchAll(RUN_RE)) {
    runCalls.push({
      variable: match[1]!,
      line: lineNumberAt(code, match.index ?? 0),
    });
  }

  const skillsLearned = [
    ...new Set(learnCalls.map((c) => c.skillId).filter(Boolean)),
  ];

  const runVars = new Set(runCalls.map((c) => c.variable));
  const skillsInvoked = [
    ...new Set(
      learnCalls
        .filter((c) => runVars.has(c.variable))
        .map((c) => c.skillId)
        .filter(Boolean)
    ),
  ];

  const hasScaleAgent =
    aliases.length > 0 ||
    learnCalls.length > 0 ||
    runCalls.length > 0 ||
    /\bScaleAgent\b/.test(code);

  return {
    hasScaleAgent,
    aliases,
    learnCalls,
    runCalls,
    skillsLearned,
    skillsInvoked,
  };
}

export type SkillInvokePlan = {
  skillId: BuiltinSkillId;
  definition: BuiltinSkillDefinition;
  alias: string | null;
  variable: string;
};

/**
 * Resolve learn+run pairs into concrete skill invoke plans.
 */
export function planSkillInvocations(
  parsed: ParsedScaleAgentScript
): { plans: SkillInvokePlan[]; unknownSkills: string[] } {
  const aliasByVar = new Map(parsed.aliases.map((a) => [a.variable, a.alias]));
  const runVars = new Set(parsed.runCalls.map((c) => c.variable));
  const plans: SkillInvokePlan[] = [];
  const unknownSkills: string[] = [];
  const seen = new Set<string>();

  for (const learn of parsed.learnCalls) {
    if (!runVars.has(learn.variable)) continue;
    const skill = getSkill(learn.skillId);
    if (!skill) {
      unknownSkills.push(learn.skillId);
      continue;
    }
    const key = `${learn.variable}:${skill.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push({
      skillId: skill.id,
      definition: skill,
      alias: aliasByVar.get(learn.variable) ?? null,
      variable: learn.variable,
    });
  }

  return { plans, unknownSkills: [...new Set(unknownSkills)] };
}

/**
 * Inject a sandboxed ScaleAgent Python stub ahead of user code.
 * Skill handlers emit structured `__SS_SKILL__` JSON lines for the host to parse.
 *
 * When `equippedSkills` is empty/undefined, learn_skill allows any built-in
 * (discoverability in the Virtual Terminal). When non-empty, only installed
 * skills (or explicitly `allowedSkills`) may be learned.
 */
export function injectScaleAgentPythonStub(
  userCode: string,
  options?: {
    equippedSkills?: string[];
    allowedSkills?: string[];
    enforceEquip?: boolean;
  }
): string {
  const catalog = listBuiltinSkills().map((s) => ({
    id: s.id,
    name: s.name,
    methods: s.pythonMethods,
    capabilities: s.capabilities,
  }));
  const equipped = (options?.equippedSkills ?? []).map(normalizeSkillId);
  const allowed = (options?.allowedSkills ?? equipped).map(normalizeSkillId);
  const enforceEquip = options?.enforceEquip === true && equipped.length > 0;

  const stub = `
# --- ScaleSystems ScaleAgent SDK (sandbox stub) ---
import json as _ss_json

_SS_EQUIPPED = ${JSON.stringify(equipped)}
_SS_ALLOWED = ${JSON.stringify(allowed)}
_SS_CATALOG = ${JSON.stringify(catalog)}
_SS_ENFORCE = ${enforceEquip ? "True" : "False"}

class ScaleAgent:
    def __init__(self, alias):
        self.alias = str(alias)
        self.skills = []
        self._ran = False
        print(f"[ScaleAgent] initialized alias={self.alias!r}")

    def learn_skill(self, skill_id):
        sid = str(skill_id).strip()
        if not sid.startswith("@"):
            sid = "@" + sid
        catalog = {s["id"]: s for s in _SS_CATALOG}
        if sid not in catalog:
            raise ValueError(f"Unknown skill: {sid}")
        if _SS_ENFORCE and sid not in _SS_EQUIPPED and sid not in _SS_ALLOWED:
            raise PermissionError(
                f"Skill {sid} is not installed on this agent. "
                "POST /api/skills/install first."
            )
        if sid not in self.skills:
            self.skills.append(sid)
        meta = catalog[sid]
        print(f"[ScaleAgent] learned {sid} methods={meta['methods']}")
        print("__SS_SKILL__" + _ss_json.dumps({
            "event": "learn",
            "alias": self.alias,
            "skillId": sid,
            "methods": meta["methods"],
            "capabilities": meta["capabilities"],
        }))
        return self

    def run(self):
        self._ran = True
        results = []
        catalog = {s["id"]: s for s in _SS_CATALOG}
        for sid in self.skills:
            meta = catalog.get(sid, {"name": sid, "methods": [], "capabilities": []})
            action = {
                "event": "invoke",
                "alias": self.alias,
                "skillId": sid,
                "name": meta.get("name", sid),
                "methods": meta.get("methods", []),
                "capabilities": meta.get("capabilities", []),
                "status": "ok",
                "result": _ss_simulate_skill(sid, self.alias),
            }
            results.append(action)
            print("__SS_SKILL__" + _ss_json.dumps(action))
            print(f"[ScaleAgent] ran {sid} → {action['result'].get('summary', 'ok')}")
        if not self.skills:
            print(f"[ScaleAgent] run() with no skills on alias={self.alias!r}")
            print("__SS_SKILL__" + _ss_json.dumps({
                "event": "invoke",
                "alias": self.alias,
                "skillId": None,
                "status": "noop",
                "result": {"summary": "no skills equipped"},
            }))
        return results

def _ss_simulate_skill(skill_id, alias):
    if skill_id == "@vercel":
        return {
            "summary": f"Queued Vercel deploy for robot '{alias}'",
            "deploymentId": f"dpl_sim_{alias}",
            "domains": [],
        }
    if skill_id == "@playwright":
        return {
            "summary": f"Headless scrape session ready for '{alias}'",
            "browser": "chromium-headless",
            "pagesVisited": 0,
        }
    if skill_id == "@github":
        return {
            "summary": f"GitHub automation online for '{alias}'",
            "openPrs": 0,
            "issuesHandled": 0,
        }
    if skill_id == "@stripe":
        return {
            "summary": f"Payment link factory ready for '{alias}'",
            "paymentLinks": [],
        }
    return {"summary": f"Invoked {skill_id}"}
# --- end ScaleAgent stub ---
`.trimStart();

  return `${stub}\n${userCode}`;
}

export type ParsedSkillEvent = {
  event: "learn" | "invoke";
  alias?: string;
  skillId?: string | null;
  status?: string;
  result?: Record<string, unknown>;
  methods?: string[];
  capabilities?: string[];
  name?: string;
};

/** Extract structured skill events emitted by the Python stub. */
export function extractSkillEventsFromStdout(stdout: string): {
  events: ParsedSkillEvent[];
  cleanStdout: string;
} {
  const events: ParsedSkillEvent[] = [];
  const lines = stdout.split(/\r?\n/);
  const kept: string[] = [];

  for (const line of lines) {
    if (line.startsWith("__SS_SKILL__")) {
      try {
        const payload = JSON.parse(line.slice("__SS_SKILL__".length)) as ParsedSkillEvent;
        events.push(payload);
      } catch {
        kept.push(line);
      }
      continue;
    }
    kept.push(line);
  }

  return { events, cleanStdout: kept.join("\n").trimEnd() };
}
