/**
 * Isolated code runner — never shells out to the host for arbitrary code.
 * JavaScript runs in `node:vm` with a sealed context (5s timeout, no I/O).
 * Python uses a registered remote hook (E2B/Pyodide) or a restricted expression
 * evaluator for trivial print/math snippets.
 */

import vm from "node:vm";

export type SandboxLanguage = "python" | "javascript";

export type SandboxExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type PythonSandboxHook = (
  code: string,
  signal?: AbortSignal
) => Promise<SandboxExecutionResult>;

const TIMEOUT_MS = 5_000;
const MAX_CODE_CHARS = 12_000;

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brequire\s*\(/i, reason: "require() is blocked in the sandbox." },
  { pattern: /\bimport\s*\(/i, reason: "dynamic import() is blocked." },
  {
    pattern: /\bfrom\s+['"`]|^\s*import\s+/m,
    reason: "Module imports are blocked in the sandbox.",
  },
  { pattern: /\bprocess\b/, reason: "process access is blocked." },
  { pattern: /\bglobalThis\b|\bglobal\b/, reason: "Global object access is blocked." },
  { pattern: /\bfetch\s*\(/i, reason: "Network fetch is blocked." },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b/, reason: "Network APIs are blocked." },
  { pattern: /\bchild_process\b|\bfs\b|\bnet\b|\bdgram\b|\bhttp\b|\bhttps\b/i, reason: "Node host modules are blocked." },
  { pattern: /\beval\s*\(/, reason: "eval() is blocked." },
  { pattern: /\bnew\s+Function\s*\(/, reason: "Function constructor is blocked." },
  { pattern: /\bFunction\s*\(/, reason: "Function constructor is blocked." },
  { pattern: /\bWebAssembly\b/, reason: "WebAssembly is blocked." },
  { pattern: /\bDeno\b|\bBun\b/, reason: "Alternate runtimes are blocked." },
  { pattern: /\b__dirname\b|\b__filename\b/, reason: "Filesystem introspection is blocked." },
  { pattern: /\bopen\s*\(|\bexec\s*\(|\bos\.system\b|\bsubprocess\b|\bpopen\b/i, reason: "Host process/file APIs are blocked." },
  { pattern: /\b(?:api[_-]?key|secret[_-]?key|GEMINI_API_KEY|AWS_SECRET)\b/i, reason: "Credential references are blocked." },
];

let pythonHook: PythonSandboxHook | null = null;

/** Optional E2B / Pyodide / remote isolate registration. */
export function registerPythonSandboxHook(hook: PythonSandboxHook | null): void {
  pythonHook = hook;
}

function securityScan(code: string): string | null {
  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(code)) return rule.reason;
  }
  return null;
}

function normalizeLanguage(
  language: SandboxLanguage | string
): SandboxLanguage {
  const key = language.trim().toLowerCase();
  if (key === "python" || key === "py") return "python";
  return "javascript";
}

async function executeJavaScript(
  code: string,
  signal?: AbortSignal
): Promise<SandboxExecutionResult> {
  if (signal?.aborted) {
    return { stdout: "", stderr: "Aborted", exitCode: 130 };
  }

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const sealed = {
    console: {
      log: (...args: unknown[]) => {
        stdoutLines.push(args.map(stringifyArg).join(" "));
      },
      info: (...args: unknown[]) => {
        stdoutLines.push(args.map(stringifyArg).join(" "));
      },
      warn: (...args: unknown[]) => {
        stderrLines.push(args.map(stringifyArg).join(" "));
      },
      error: (...args: unknown[]) => {
        stderrLines.push(args.map(stringifyArg).join(" "));
      },
    },
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    parseInt,
    parseFloat,
    isFinite,
    isNaN,
    undefined,
  };

  try {
    const script = new vm.Script(code, { filename: "sandbox.js" });
    const context = vm.createContext(sealed, {
      name: "ScaleSystemsSandbox",
      codeGeneration: { strings: false, wasm: false },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Sandbox timeout after ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        script.runInContext(context, {
          timeout: TIMEOUT_MS,
          displayErrors: true,
          breakOnSigint: true,
        });
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve();
      } catch (error) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    });

    return {
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
      exitCode: 0,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sandbox execution failed.";
    return {
      stdout: stdoutLines.join("\n"),
      stderr: [stderrLines.join("\n"), message].filter(Boolean).join("\n"),
      exitCode: 1,
    };
  }
}

function stringifyArg(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Restricted Python-lite: only `print(<arithmetic expression>)` lines.
 * No host Python process, no shell.
 */
function executeRestrictedPythonExpress(code: string): SandboxExecutionResult {
  const lines = code
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (lines.length === 0) {
    return { stdout: "", stderr: "Empty Python payload.", exitCode: 1 };
  }

  const stdout: string[] = [];

  for (const line of lines) {
    const printMatch = line.match(/^print\s*\((.*)\)\s*$/);
    if (!printMatch) {
      return {
        stdout: stdout.join("\n"),
        stderr:
          "Restricted Python sandbox only allows print(<expression>) lines. Register an E2B/Pyodide hook for full Python.",
        exitCode: 1,
      };
    }

    const expr = printMatch[1]!.trim();
    if (!/^[\d\s+\-*/%().]+$/.test(expr)) {
      return {
        stdout: stdout.join("\n"),
        stderr:
          "Restricted Python sandbox only permits numeric arithmetic expressions inside print().",
        exitCode: 1,
      };
    }

    try {
      // Expression already constrained to digits/operators — evaluate in vm.
      const value = vm.runInNewContext(expr, Object.create(null), {
        timeout: 500,
      });
      stdout.push(String(value));
    } catch (error) {
      return {
        stdout: stdout.join("\n"),
        stderr:
          error instanceof Error ? error.message : "Expression evaluation failed.",
        exitCode: 1,
      };
    }
  }

  return { stdout: stdout.join("\n"), stderr: "", exitCode: 0 };
}

async function executePython(
  code: string,
  signal?: AbortSignal
): Promise<SandboxExecutionResult> {
  if (pythonHook) {
    try {
      return await pythonHook(code, signal);
    } catch (error) {
      return {
        stdout: "",
        stderr:
          error instanceof Error
            ? `Python hook failed: ${error.message}`
            : "Python hook failed.",
        exitCode: 1,
      };
    }
  }

  if (process.env.E2B_API_KEY?.trim()) {
    return {
      stdout: "",
      stderr:
        "E2B_API_KEY is set but no Python sandbox hook is registered. Call registerPythonSandboxHook() to bind @e2b/code-interpreter.",
      exitCode: 1,
    };
  }

  return executeRestrictedPythonExpress(code);
}

/**
 * Execute untrusted code in an isolated context.
 * Never invokes a host shell (`sh`/`cmd`) with user-controlled strings.
 */
export async function executeCodeInSandbox(
  code: string,
  language: SandboxLanguage | string,
  options?: { signal?: AbortSignal }
): Promise<SandboxExecutionResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { stdout: "", stderr: "No code provided.", exitCode: 1 };
  }
  if (trimmed.length > MAX_CODE_CHARS) {
    return {
      stdout: "",
      stderr: `Code exceeds ${MAX_CODE_CHARS} character limit.`,
      exitCode: 1,
    };
  }

  const blockReason = securityScan(trimmed);
  if (blockReason) {
    return {
      stdout: "",
      stderr: `SECURITY INTERCEPT — ${blockReason}`,
      exitCode: 1,
    };
  }

  const lang = normalizeLanguage(language);
  if (lang === "python") {
    return executePython(trimmed, options?.signal);
  }
  return executeJavaScript(trimmed, options?.signal);
}
