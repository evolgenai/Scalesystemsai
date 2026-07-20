import type { SandboxLanguage } from "@/lib/agents/codeSandbox";
import { executeUntrustedAgentCode } from "@/lib/sandbox/containerRegistry";

export type CodeSandboxResult = {
  success: boolean;
  blocked: boolean;
  language: string;
  stdout: string[];
  stderr: string[];
  exitCode: number;
  metrics: {
    durationMs: number;
    linesOfCode: number;
    simulatedOps: number;
  };
  securityWarning?: string;
  preview: string;
};

const MALICIOUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brequire\s*\(\s*['"`]fs['"`]\s*\)/i,
    reason: "Filesystem module access (fs) is blocked in the sandbox.",
  },
  {
    pattern: /\brequire\s*\(\s*['"`]child_process['"`]\s*\)/i,
    reason: "Process spawning (child_process) is blocked in the sandbox.",
  },
  {
    pattern: /\bimport\s+(?:.+\s+from\s+)?['"`]node:fs['"`]/i,
    reason: "Node fs import is blocked in the sandbox.",
  },
  {
    pattern: /\bprocess\.env\b/,
    reason: "Environment variable access is blocked in the sandbox.",
  },
  {
    pattern: /\bprocess\.exit\b/,
    reason: "Process control APIs are blocked in the sandbox.",
  },
  {
    pattern: /\beval\s*\(/,
    reason: "Dynamic eval() is blocked in the sandbox.",
  },
  {
    pattern: /\bnew\s+Function\s*\(/,
    reason: "Dynamic Function constructors are blocked in the sandbox.",
  },
  {
    pattern: /(?:^|[^\w])\/(?:etc|proc|sys|var\/run)\//i,
    reason: "Absolute system path access is blocked.",
  },
  {
    pattern: /[A-Za-z]:\\(?:Windows|Users|Program Files)/i,
    reason: "Local Windows system path access is blocked.",
  },
  {
    pattern: /\b(?:api[_-]?key|secret[_-]?key|private[_-]?key|aws_secret|GEMINI_API_KEY)\b/i,
    reason: "Credential/key material references are blocked.",
  },
  {
    pattern: /\bDeno\.env\b|\bBun\.env\b/,
    reason: "Runtime environment introspection is blocked.",
  },
];

function detectLanguage(code: string): string {
  if (/^\s*</.test(code) || /<\/?[a-z]/i.test(code)) return "html";
  if (/\bdef\s+\w+\s*\(|\bprint\s*\(/.test(code)) return "python";
  if (/\bpackage\s+main\b|\bfunc\s+main\s*\(/.test(code)) return "go";
  if (/\binterface\s+\w+|System\.out\.println/.test(code)) return "java";
  if (/\bfn\s+main\s*\(|\blet\s+mut\b/.test(code)) return "rust";
  return "typescript";
}

function countLines(code: string): number {
  return code.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

/** Pull the first fenced code block from operator text, if present. */
export function extractCodeFromText(text: string): string | null {
  const fenced = text.match(/```(?:[a-zA-Z0-9_+-]+)?\s*([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return null;
}

/**
 * Isolated code runner — prefers ephemeral Docker containers via the registry,
 * with local sandbox fallback when CONTAINER_REGISTRY_URL is unset.
 */
export async function runCodeInSandbox(
  codeInput: string,
  options?: {
    signal?: AbortSignal;
    languageHint?: string;
    preferredRegion?: string;
    agentId?: string;
    sessionId?: string;
  }
): Promise<CodeSandboxResult> {
  const started = Date.now();
  const code = codeInput.trim();

  if (!code) {
    return {
      success: false,
      blocked: false,
      language: options?.languageHint ?? "typescript",
      stdout: [],
      stderr: ["No code provided to sandbox."],
      exitCode: 1,
      metrics: { durationMs: 0, linesOfCode: 0, simulatedOps: 0 },
      preview: "Sandbox refused empty payload.",
    };
  }

  if (options?.signal?.aborted) {
    return {
      success: false,
      blocked: false,
      language: options.languageHint ?? detectLanguage(code),
      stdout: [],
      stderr: ["Sandbox aborted by client signal."],
      exitCode: 130,
      metrics: {
        durationMs: Date.now() - started,
        linesOfCode: countLines(code),
        simulatedOps: 0,
      },
      preview: "Sandbox aborted.",
    };
  }

  for (const rule of MALICIOUS_PATTERNS) {
    if (rule.pattern.test(code)) {
      const warning = `SECURITY INTERCEPT — ${rule.reason}`;
      return {
        success: false,
        blocked: true,
        language: options?.languageHint ?? detectLanguage(code),
        stdout: ["[sandbox] scanning payload…", "[sandbox] threat signature matched"],
        stderr: [warning],
        exitCode: 1,
        metrics: {
          durationMs: Date.now() - started,
          linesOfCode: countLines(code),
          simulatedOps: 0,
        },
        securityWarning: warning,
        preview: warning,
      };
    }
  }

  const language = options?.languageHint ?? detectLanguage(code);
  const linesOfCode = countLines(code);

  const sandboxLang: SandboxLanguage | null =
    language === "python" || language === "py"
      ? "python"
      : /javascript|typescript|js|ts/.test(language)
        ? "javascript"
        : /console\.|=>|const |let |var /.test(code)
          ? "javascript"
          : /\bprint\s*\(|\bdef\s+/.test(code)
            ? "python"
            : "javascript";

  const isolated = await executeUntrustedAgentCode({
    code,
    language: sandboxLang,
    signal: options?.signal,
    preferredRegion: options?.preferredRegion,
    agentId: options?.agentId,
    sessionId: options?.sessionId,
  });

  const durationMs = isolated.durationMs || Date.now() - started;
  const blocked =
    isolated.mode === "blocked" ||
    isolated.stderr.startsWith("SECURITY INTERCEPT");
  const stdout = isolated.stdout ? isolated.stdout.split(/\r?\n/) : [];
  const stderr = isolated.stderr ? isolated.stderr.split(/\r?\n/) : [];

  if (blocked) {
    return {
      success: false,
      blocked: true,
      language: sandboxLang,
      stdout: ["[sandbox] scanning payload…", "[sandbox] threat signature matched"],
      stderr,
      exitCode: isolated.exitCode,
      metrics: {
        durationMs,
        linesOfCode,
        simulatedOps: 0,
      },
      securityWarning: isolated.stderr,
      preview: isolated.stderr,
    };
  }

  const success = isolated.exitCode === 0;
  const modeTag =
    isolated.mode === "remote-container" ? "container" : "local";
  return {
    success,
    blocked: false,
    language: sandboxLang,
    stdout: stdout.length ? stdout : success ? ["[stdout] (empty)"] : [],
    stderr,
    exitCode: isolated.exitCode,
    metrics: {
      durationMs,
      linesOfCode,
      simulatedOps: Math.max(12, linesOfCode * 17),
    },
    preview: success
      ? `Sandbox ok (${modeTag}) — ${sandboxLang} · exit ${isolated.exitCode} · ${durationMs}ms\n${isolated.stdout.slice(0, 500)}`
      : `Sandbox error (${modeTag}) — ${sandboxLang} · exit ${isolated.exitCode}\n${isolated.stderr.slice(0, 500)}`,
  };
}

/** Generate a tiny safe snippet when the objective asks to run code but no block is provided. */
export function synthesizeDemoSnippet(objective: string): string {
  const lower = objective.toLowerCase();
  if (/python/.test(lower)) {
    return [
      "def score_leads(rows):",
      "    return [r for r in rows if r.get('intent', 0) >= 0.7]",
      "",
      "print(score_leads([{'intent': 0.9}, {'intent': 0.2}]))",
    ].join("\n");
  }

  return [
    "type Lead = { intent: number };",
    "const score = (rows: Lead[]) => rows.filter((r) => r.intent >= 0.7);",
    "console.log(score([{ intent: 0.91 }, { intent: 0.2 }]));",
  ].join("\n");
}
