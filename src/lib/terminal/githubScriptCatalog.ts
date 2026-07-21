/**
 * Allowlisted GitHub script targets for the Virtual Terminal script-runner.
 * Only catalog entries may execute — never arbitrary remote shell.
 */

import type { SandboxLanguage } from "@/lib/agents/codeSandbox";

export const SCRIPT_RUNNER_GAS_COST = 100 as const;

export type GithubScriptTarget = {
  id: string;
  /** Canonical target key, e.g. github:blackeye */
  target: string;
  title: string;
  language: SandboxLanguage;
  /** Gas charged per isolated session. */
  gasCost: number;
  /** Sandboxed source — no network, no subprocess, no host FS. */
  source: string;
};

const CATALOG: Record<string, GithubScriptTarget> = {
  "github:blackeye": {
    id: "blackeye",
    target: "github:blackeye",
    title: "GitHub Script · blackeye",
    language: "python",
    gasCost: SCRIPT_RUNNER_GAS_COST,
    source: `
print("[blackeye] session boot · isolated sandbox")
print("[blackeye] repo sync · main@a4f2")
print("[blackeye] scanning allowlisted targets…")
for i, name in enumerate(["auth", "webhooks", "agents"], 1):
    print(f"[blackeye] probe {i}/3 · module={name} · ok")
print("[blackeye] synthesis complete · exit=0")
`.trim(),
  },
  "github:custom-automation": {
    id: "custom-automation",
    target: "github:custom-automation",
    title: "GitHub Script · custom-automation",
    language: "python",
    gasCost: SCRIPT_RUNNER_GAS_COST,
    source: `
print("[custom-automation] wrapper session · python isolate")
print("[custom-automation] loading playbook stubs…")
steps = ["validate", "stage", "execute", "report"]
for step in steps:
    print(f"[custom-automation] step={step} · status=ok")
print("[custom-automation] pipeline finished · exit=0")
`.trim(),
  },
  "github:recon": {
    id: "recon",
    target: "github:recon",
    title: "GitHub Script · recon",
    language: "python",
    gasCost: SCRIPT_RUNNER_GAS_COST,
    source: `
print("[recon] surface map · sandbox mode")
print("[recon] inventory nodes · spatial universe")
for node in ["web-scraper", "llm-router", "vault-core"]:
    print(f"[recon] node={node} · reachable=true")
print("[recon] report sealed · exit=0")
`.trim(),
  },
  "github:slack": {
    id: "slack",
    target: "github:slack",
    title: "GitHub Script · slack bridge",
    language: "javascript",
    gasCost: SCRIPT_RUNNER_GAS_COST,
    source: `
console.log("[slack] bridge boot · sealed vm");
console.log("[slack] channel=#ops · dry-run");
console.log("[slack] dispatch mock event · ok");
console.log("[slack] session closed · exit=0");
`.trim(),
  },
};

/** Normalize `github:blackeye`, `gh:blackeye`, `blackeye` → catalog key. */
export function normalizeScriptTarget(raw: string): string {
  let t = raw.trim().toLowerCase();
  if (!t) return "";
  t = t.replace(/^gh:/, "github:");
  if (!t.startsWith("github:")) {
    t = `github:${t.replace(/^github[_-]?/, "")}`;
  }
  return t;
}

export function resolveGithubScript(
  rawTarget: string
): GithubScriptTarget | null {
  const key = normalizeScriptTarget(rawTarget);
  return CATALOG[key] ?? null;
}

export function listGithubScriptTargets(): GithubScriptTarget[] {
  return Object.values(CATALOG);
}

/**
 * Shell-style session banner wrapping the sandboxed payload.
 * Printed as log preamble before language execution (not host shell).
 */
export function buildShellWrapperPreamble(script: GithubScriptTarget): string[] {
  return [
    `[shell] isolated wrapper · target=${script.target}`,
    `[shell] language=${script.language} · gas=${script.gasCost}`,
    `[shell] security=allowlist · network=denied · subprocess=denied`,
    `[shell] launching ${script.title}…`,
  ];
}
