/**
 * Isolated code runner.
 * JavaScript: sealed `node:vm` (5s timeout, no I/O).
 * Python: local `python`/`python3` via `execFile` + stdin (`python -`),
 *         optional E2B/Pyodide hook override.
 *
 * Node-only — must never be imported from Client Components.
 * Node builtins are loaded lazily so Turbopack NFT does not over-trace.
 */

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

const JS_BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brequire\s*\(/i, reason: "require() is blocked in the sandbox." },
  { pattern: /\bimport\s*\(/i, reason: "dynamic import() is blocked." },
  {
    pattern: /\bfrom\s+['"`]|^\s*import\s+/m,
    reason: "Module imports are blocked in the JS sandbox.",
  },
  { pattern: /\bprocess\b/, reason: "process access is blocked." },
  { pattern: /\bglobalThis\b|\bglobal\b/, reason: "Global object access is blocked." },
  { pattern: /\bfetch\s*\(/i, reason: "Network fetch is blocked." },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b/, reason: "Network APIs are blocked." },
  {
    pattern: /\bchild_process\b|\bnode:fs\b|\bnode:net\b|\bnode:http\b/i,
    reason: "Node host modules are blocked.",
  },
  { pattern: /\beval\s*\(/, reason: "eval() is blocked." },
  { pattern: /\bnew\s+Function\s*\(/, reason: "Function constructor is blocked." },
  { pattern: /\bFunction\s*\(/, reason: "Function constructor is blocked." },
  { pattern: /\bWebAssembly\b/, reason: "WebAssembly is blocked." },
  { pattern: /\bDeno\b|\bBun\b/, reason: "Alternate runtimes are blocked." },
  { pattern: /\b__dirname\b|\b__filename\b/, reason: "Filesystem introspection is blocked." },
  {
    pattern: /\b(?:api[_-]?key|secret[_-]?key|GEMINI_API_KEY|AWS_SECRET)\b/i,
    reason: "Credential references are blocked.",
  },
];

/** Host-escape guards for Python — multi-line scripts + imports are allowed. */
const PY_BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(?:os\.system|subprocess|popen|pty\.spawn)\b/i,
    reason: "Process spawning APIs are blocked in the Python sandbox.",
  },
  {
    pattern: /\b(?:ctypes|cffi|multiprocessing)\b/i,
    reason: "Low-level process/memory modules are blocked.",
  },
  {
    pattern: /\b(?:socket|http\.client|urllib\.request|requests\.|aiohttp)\b/i,
    reason: "Network modules are blocked in the Python sandbox.",
  },
  {
    pattern: /(?:^|[^\w])\/(?:etc|proc|sys)\//i,
    reason: "Absolute system path access is blocked.",
  },
  {
    pattern: /\b(?:api[_-]?key|secret[_-]?key|GEMINI_API_KEY|AWS_SECRET)\b/i,
    reason: "Credential references are blocked.",
  },
];

let pythonHook: PythonSandboxHook | null = null;

/** Optional E2B / Pyodide / remote isolate registration. */
export function registerPythonSandboxHook(hook: PythonSandboxHook | null): void {
  pythonHook = hook;
}

function securityScan(
  code: string,
  language: SandboxLanguage
): string | null {
  const rules = language === "python" ? PY_BLOCKED_PATTERNS : JS_BLOCKED_PATTERNS;
  for (const rule of rules) {
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

function resolvePythonBinary(): "python" | "python3" {
  // Keep this a static literal union so NFT cannot treat the argv0 as an
  // open-ended filesystem path (PYTHON_PATH overrides are applied at spawn).
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Run multi-line Python via local interpreter.
 * Uses `execFile` (argv array) — never `shell: true` / string interpolation.
 * Code is fed on stdin (`python -`) so we never touch the filesystem.
 */
async function executePythonLocal(
  code: string,
  signal?: AbortSignal
): Promise<SandboxExecutionResult> {
  if (signal?.aborted) {
    return { stdout: "", stderr: "Aborted", exitCode: 130 };
  }

  const { execFile } = await import(
    /* turbopackIgnore: true */ "node:child_process"
  );
  const preferred = process.env.PYTHON_PATH?.trim();
  const bin = preferred && preferred.length > 0 ? preferred : resolvePythonBinary();

  try {
    return await new Promise<SandboxExecutionResult>((resolve) => {
      const child = execFile(
        /* turbopackIgnore: true */ bin,
        ["-B", "-"],
        {
          timeout: TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          shell: false,
          input: code,
          env: {
            PATH: process.env.PATH,
            SYSTEMROOT: process.env.SYSTEMROOT,
            PYTHONIOENCODING: "utf-8",
            PYTHONDONTWRITEBYTECODE: "1",
            PYTHONWARNINGS: "ignore",
            PYTHONNOUSERSITE: "1",
          },
        },
        (error, stdout, stderr) => {
          const out = String(stdout ?? "").replace(/\r\n/g, "\n").trimEnd();
          const err = String(stderr ?? "").replace(/\r\n/g, "\n").trimEnd();

          if (!error) {
            resolve({ stdout: out, stderr: err, exitCode: 0 });
            return;
          }

          const nodeErr = error as NodeJS.ErrnoException & {
            killed?: boolean;
            code?: string | number;
          };

          if (nodeErr.code === "ENOENT") {
            resolve({
              stdout: out,
              stderr: `Python runtime not found (${bin}). Set PYTHON_PATH to your interpreter.`,
              exitCode: 127,
            });
            return;
          }

          if (nodeErr.killed || nodeErr.code === "ETIMEDOUT") {
            resolve({
              stdout: out,
              stderr: err || `Sandbox timeout after ${TIMEOUT_MS}ms`,
              exitCode: 124,
            });
            return;
          }

          const exitCode =
            typeof nodeErr.code === "number" ? nodeErr.code : 1;

          resolve({
            stdout: out,
            stderr: err || error.message,
            exitCode,
          });
        }
      );

      const onAbort = () => {
        try {
          child.kill();
        } catch {
          // ignore
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      child.on("close", () => {
        signal?.removeEventListener("abort", onAbort);
      });
    });
  } catch (error) {
    return {
      stdout: "",
      stderr:
        error instanceof Error
          ? error.message
          : "Python sandbox execution failed.",
      exitCode: 1,
    };
  }
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
    const vm = await import(/* turbopackIgnore: true */ "node:vm");
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

  return executePythonLocal(code, signal);
}

/**
 * Execute untrusted code in an isolated context.
 * Python uses argv-safe `execFile` (never a shell string).
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

  const lang = normalizeLanguage(language);
  const blockReason = securityScan(trimmed, lang);
  if (blockReason) {
    return {
      stdout: "",
      stderr: `SECURITY INTERCEPT — ${blockReason}`,
      exitCode: 1,
    };
  }

  if (lang === "python") {
    return executePython(trimmed, options?.signal);
  }
  return executeJavaScript(trimmed, options?.signal);
}
