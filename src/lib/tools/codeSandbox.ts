export type CodeSandboxResult = {
  success: boolean;
  blocked: boolean;
  language: string;
  stdout: string[];
  stderr: string[];
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

function synthesizeStdout(code: string, language: string): string[] {
  const lines = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  const logs: string[] = [
    `[sandbox] boot language=${language}`,
    "[sandbox] isolating worker heap…",
  ];

  for (const line of lines.slice(0, 4)) {
    logs.push(`[trace] ${line.slice(0, 96)}`);
  }

  if (/console\.log|print\(|println!|System\.out/.test(code)) {
    logs.push("[stdout] hello from ScaleSystems sandbox");
  } else {
    logs.push("[stdout] execution completed with exit code 0");
  }

  logs.push("[sandbox] tearing down ephemeral isolate");
  return logs;
}

/**
 * Safe mock/sandboxed code runner for serverless environments.
 * Never executes untrusted code against the host; simulates stdout/stderr and metrics,
 * while intercepting malicious filesystem / credential patterns.
 */
export async function runCodeInSandbox(
  codeInput: string,
  options?: { signal?: AbortSignal; languageHint?: string }
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

  // Artificial scheduling delay so the SSE timeline feels like a real worker.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 350 + Math.min(code.length / 40, 500));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  }).catch(() => undefined);

  const language = options?.languageHint ?? detectLanguage(code);
  const stdout = synthesizeStdout(code, language);
  const linesOfCode = countLines(code);
  const simulatedOps = Math.max(12, linesOfCode * 17);
  const durationMs = Date.now() - started;

  return {
    success: true,
    blocked: false,
    language,
    stdout,
    stderr: [],
    metrics: {
      durationMs,
      linesOfCode,
      simulatedOps,
    },
    preview: `Sandbox ok — ${language} · ${linesOfCode} loc · ${simulatedOps} ops · ${durationMs}ms`,
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
