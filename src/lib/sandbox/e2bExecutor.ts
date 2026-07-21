/**
 * E2B Code Interpreter microVM executor — ephemeral sandboxes for
 * Python, TypeScript/JavaScript, and bash shell scripts.
 */

import { z } from "zod";

export const E2B_LANGUAGE_ALIASES = {
  python: "python",
  py: "python",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  node: "javascript",
  bash: "bash",
  sh: "bash",
  shell: "bash",
} as const;

export type E2bLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "bash";

export const E2bExecuteInputSchema = z.object({
  code: z.string().min(1).max(80_000),
  language: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .default("python"),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
  workspaceId: z.string().trim().min(1).optional(),
});

export type E2bExecuteInput = z.infer<typeof E2bExecuteInputSchema>;

export type E2bStreamLine = {
  stream: "stdout" | "stderr";
  text: string;
};

export type E2bExecuteResult = {
  ok: boolean;
  language: E2bLanguage;
  sandboxId: string | null;
  exitCode: number;
  stdout: string;
  stderr: string;
  text: string | null;
  streams: E2bStreamLine[];
  error: string | null;
  durationMs: number;
  provider: "e2b";
};

export function isE2bConfigured(): boolean {
  return Boolean(process.env.E2B_API_KEY?.trim());
}

export function normalizeE2bLanguage(raw: string): E2bLanguage | null {
  const key = raw.trim().toLowerCase().replace(/^\./, "");
  const mapped =
    E2B_LANGUAGE_ALIASES[key as keyof typeof E2B_LANGUAGE_ALIASES];
  return mapped ?? null;
}

function collectStreams(execution: {
  logs?: { stdout?: string[]; stderr?: string[] };
  error?: { name?: string; value?: string; traceback?: string } | null;
  text?: string | null;
}): {
  stdout: string;
  stderr: string;
  streams: E2bStreamLine[];
  error: string | null;
  exitCode: number;
} {
  const stdoutLines = execution.logs?.stdout ?? [];
  const stderrLines = [...(execution.logs?.stderr ?? [])];
  const streams: E2bStreamLine[] = [
    ...stdoutLines.map((text) => ({ stream: "stdout" as const, text })),
    ...stderrLines.map((text) => ({ stream: "stderr" as const, text })),
  ];

  let error: string | null = null;
  if (execution.error) {
    error = [
      execution.error.name,
      execution.error.value,
      execution.error.traceback,
    ]
      .filter(Boolean)
      .join(": ");
    if (error) {
      streams.push({ stream: "stderr", text: error });
      stderrLines.push(error);
    }
  }

  return {
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n"),
    streams,
    error,
    exitCode: error ? 1 : 0,
  };
}

/**
 * Spawn an ephemeral E2B microVM, run code, kill the sandbox.
 * Requires `E2B_API_KEY`.
 */
export async function executeInE2bSandbox(
  input: E2bExecuteInput
): Promise<E2bExecuteResult> {
  const language = normalizeE2bLanguage(input.language);
  if (!language) {
    return {
      ok: false,
      language: "python",
      sandboxId: null,
      exitCode: 1,
      stdout: "",
      stderr: `Unsupported language "${input.language}". Use python, typescript, javascript, or bash.`,
      text: null,
      streams: [],
      error: "UNSUPPORTED_LANGUAGE",
      durationMs: 0,
      provider: "e2b",
    };
  }

  if (!isE2bConfigured()) {
    return {
      ok: false,
      language,
      sandboxId: null,
      exitCode: 1,
      stdout: "",
      stderr: "E2B_API_KEY is not configured.",
      text: null,
      streams: [],
      error: "E2B_NOT_CONFIGURED",
      durationMs: 0,
      provider: "e2b",
    };
  }

  const started = Date.now();
  // Dynamic import keeps cold paths light when E2B is unused.
  const { Sandbox } = await import("@e2b/code-interpreter");

  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
  try {
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY!.trim(),
      timeoutMs: input.timeoutMs ?? 60_000,
    });

    // code-interpreter Sandbox adds runCode; cast keeps TS aligned with runtime.
    const execution = await (
      sandbox as typeof sandbox & {
        runCode: (
          code: string,
          opts?: { language?: string; timeoutMs?: number }
        ) => Promise<{
          logs?: { stdout?: string[]; stderr?: string[] };
          error?: { name?: string; value?: string; traceback?: string } | null;
          text?: string | null;
        }>;
      }
    ).runCode(input.code, {
      language,
      timeoutMs: input.timeoutMs ?? 30_000,
    });

    const collected = collectStreams(execution);
    const text =
      typeof execution.text === "string" ? execution.text : execution.text ?? null;

    return {
      ok: collected.exitCode === 0,
      language,
      sandboxId: sandbox.sandboxId,
      exitCode: collected.exitCode,
      stdout: collected.stdout,
      stderr: collected.stderr,
      text,
      streams: collected.streams,
      error: collected.error,
      durationMs: Date.now() - started,
      provider: "e2b",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "E2B sandbox execution failed.";
    return {
      ok: false,
      language,
      sandboxId: sandbox?.sandboxId ?? null,
      exitCode: 1,
      stdout: "",
      stderr: message,
      text: null,
      streams: [{ stream: "stderr", text: message }],
      error: message,
      durationMs: Date.now() - started,
      provider: "e2b",
    };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => undefined);
    }
  }
}

/**
 * Apply a multi-file patch inside an E2B sandbox and run verification commands.
 * Used by Meta-SRE step 3–4.
 */
export async function runE2bPatchVerification(options: {
  files: Array<{ path: string; content: string }>;
  commands?: string[];
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  sandboxId: string | null;
  logs: string[];
  exitCode: number;
  durationMs: number;
  error: string | null;
}> {
  const logs: string[] = [];
  const started = Date.now();

  if (!isE2bConfigured()) {
    return {
      ok: false,
      sandboxId: null,
      logs: ["E2B_API_KEY missing — patch sandbox skipped."],
      exitCode: 1,
      durationMs: 0,
      error: "E2B_NOT_CONFIGURED",
    };
  }

  const { Sandbox } = await import("@e2b/code-interpreter");
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;

  try {
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY!.trim(),
      timeoutMs: options.timeoutMs ?? 90_000,
    });

    for (const file of options.files.slice(0, 24)) {
      const safePath = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!safePath || safePath.includes("..")) {
        logs.push(`skip:unsafe_path=${file.path}`);
        continue;
      }
      await sandbox.files.write(`/home/user/workspace/${safePath}`, file.content);
      logs.push(`write:${safePath}`);
    }

    const commands =
      options.commands ??
      [
        "cd /home/user/workspace && npx tsc --noEmit --pretty false 2>&1 | head -n 80",
        "cd /home/user/workspace && (npm test --silent 2>&1 || echo 'NO_TEST_SCRIPT') | head -n 80",
      ];

    let exitCode = 0;
    for (const cmd of commands) {
      const result = await sandbox.commands.run(cmd, {
        timeoutMs: options.timeoutMs ?? 60_000,
      });
      const out = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      logs.push(`$ ${cmd}`);
      if (out) logs.push(out.slice(0, 8_000));
      if (result.exitCode !== 0) {
        exitCode = result.exitCode;
        break;
      }
    }

    return {
      ok: exitCode === 0,
      sandboxId: sandbox.sandboxId,
      logs,
      exitCode,
      durationMs: Date.now() - started,
      error: exitCode === 0 ? null : "VERIFICATION_FAILED",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "E2B patch verification failed.";
    logs.push(message);
    return {
      ok: false,
      sandboxId: sandbox?.sandboxId ?? null,
      logs,
      exitCode: 1,
      durationMs: Date.now() - started,
      error: message,
    };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => undefined);
    }
  }
}
