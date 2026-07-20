/**
 * Simulated TypeScript validation + self-refining correction loop.
 * Max 3 automated writer correction cycles before Validator handoff.
 */

export const MAX_CORRECTION_CYCLES = 3 as const;

export type TsDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  filePath: string;
  line?: number;
  column?: number;
};

export type ValidationResult = {
  ok: boolean;
  diagnostics: TsDiagnostic[];
  checkedAt: string;
};

export type FileAdjustment = {
  targetFile: string;
  /** Unified diff or proposed file body. */
  patch: string;
  explanation?: string;
  filesWritten?: string[];
};

export type WriterCorrectionContext = {
  attempt: number;
  maxAttempts: typeof MAX_CORRECTION_CYCLES;
  previous: FileAdjustment;
  diagnostics: TsDiagnostic[];
  /** Inject into Writer Agent system/user prompt. */
  promptInjection: string;
};

export type WriterCorrectionFn = (
  ctx: WriterCorrectionContext
) => Promise<FileAdjustment>;

export type SelfRefiningLoopResult = {
  adjustment: FileAdjustment;
  validation: ValidationResult;
  attempts: number;
  exhausted: boolean;
  cycleLogs: string[];
};

const DANGEROUS_PATTERNS: Array<{ re: RegExp; code: string; message: string }> = [
  {
    re: /\bany\b(?!\s*:)/,
    code: "TS_ANY_LEAK",
    message: "Untyped `any` usage detected — prefer explicit types.",
  },
  {
    re: /\beval\s*\(/,
    code: "TS_EVAL_BLOCKED",
    message: "eval() is forbidden in heal patches.",
  },
  {
    re: /\bnew\s+Function\s*\(/,
    code: "TS_FUNCTION_CTOR",
    message: "Function constructor is forbidden in heal patches.",
  },
  {
    re: /process\.env\.[A-Z0-9_]*SECRET|process\.env\.[A-Z0-9_]*KEY/i,
    code: "TS_SECRET_REF",
    message: "Direct secret env reads in patches are blocked.",
  },
  {
    re: /\.\.\/\.\.\//,
    code: "TS_PATH_ESCAPE",
    message: "Parent-directory traversal in patch content is blocked.",
  },
];

const SYNTAX_HEURISTICS: Array<{ re: RegExp; code: string; message: string }> = [
  {
    re: /\bimport\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s+[^;]*\bimport\b/,
    code: "TS1005",
    message: "Malformed import/type declaration.",
  },
  {
    re: /:\s*undefined\s*=/,
    code: "TS2322",
    message: "Type annotation conflict (`undefined` assigned incorrectly).",
  },
  {
    re: /\bas\s+unknown\s+as\s+any\b/,
    code: "TS_DOUBLE_CAST",
    message: "Double cast through unknown→any is rejected.",
  },
  {
    re: /@ts-ignore|@ts-nocheck/,
    code: "TS_SUPPRESS",
    message: "TypeScript suppression comments are not allowed in heal patches.",
  },
];

function lineOf(haystack: string, index: number): number {
  if (index < 0) return 1;
  return haystack.slice(0, index).split("\n").length;
}

/**
 * Simulate TypeScript validation against a proposed file adjustment.
 * Does not invoke tsc — heuristic + structural checks for the heal loop.
 */
export async function validateTypeScriptAdjustment(
  adjustment: FileAdjustment
): Promise<ValidationResult> {
  const diagnostics: TsDiagnostic[] = [];
  const body = adjustment.patch ?? "";
  const filePath = adjustment.targetFile?.trim() || "unknown.ts";

  if (!filePath || filePath === "unknown.ts") {
    diagnostics.push({
      code: "TS_NO_TARGET",
      severity: "error",
      message: "targetFile is required for validation.",
      filePath,
    });
  }

  if (!/\.(ts|tsx|mts|cts)$/i.test(filePath) && !filePath.includes("/")) {
    diagnostics.push({
      code: "TS_BAD_EXT",
      severity: "warning",
      message: "Target does not look like a TypeScript source path.",
      filePath,
    });
  }

  if (!body.trim()) {
    diagnostics.push({
      code: "TS_EMPTY_PATCH",
      severity: "error",
      message: "Proposed patch is empty.",
      filePath,
    });
  }

  // Unbalanced braces in added lines (rough syntax gate).
  const added = body
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");

  const open = (added.match(/\{/g) ?? []).length;
  const close = (added.match(/\}/g) ?? []).length;
  if (Math.abs(open - close) > 2) {
    diagnostics.push({
      code: "TS1005",
      severity: "error",
      message: `Unbalanced braces in patch (+lines): open=${open} close=${close}.`,
      filePath,
      line: 1,
    });
  }

  const openParen = (added.match(/\(/g) ?? []).length;
  const closeParen = (added.match(/\)/g) ?? []).length;
  if (Math.abs(openParen - closeParen) > 2) {
    diagnostics.push({
      code: "TS1005",
      severity: "error",
      message: `Unbalanced parentheses in patch (+lines).`,
      filePath,
      line: 1,
    });
  }

  const scanTarget = added || body;
  for (const rule of DANGEROUS_PATTERNS) {
    const m = scanTarget.match(rule.re);
    if (m && m.index !== undefined) {
      diagnostics.push({
        code: rule.code,
        severity: "error",
        message: rule.message,
        filePath,
        line: lineOf(scanTarget, m.index),
      });
    }
  }

  for (const rule of SYNTAX_HEURISTICS) {
    const m = scanTarget.match(rule.re);
    if (m && m.index !== undefined) {
      diagnostics.push({
        code: rule.code,
        severity: "error",
        message: rule.message,
        filePath,
        line: lineOf(scanTarget, m.index),
      });
    }
  }

  // Diff header sanity for unified patches.
  if (body.includes("--- ") || body.includes("+++ ")) {
    if (!body.includes(`--- a/${filePath}`) && !body.includes(`--- a/`)) {
      diagnostics.push({
        code: "TS_DIFF_HEADER",
        severity: "warning",
        message: "Unified diff missing expected --- a/<path> header.",
        filePath,
      });
    }
  }

  const errors = diagnostics.filter((d) => d.severity === "error");
  return {
    ok: errors.length === 0,
    diagnostics,
    checkedAt: new Date().toISOString(),
  };
}

export function formatDiagnosticsForPrompt(
  diagnostics: TsDiagnostic[]
): string {
  if (!diagnostics.length) return "(no diagnostics)";
  return diagnostics
    .map((d) => {
      const loc =
        d.line !== undefined
          ? `${d.filePath}:${d.line}${d.column !== undefined ? `:${d.column}` : ""}`
          : d.filePath;
      return `[${d.severity.toUpperCase()}] ${d.code} @ ${loc} — ${d.message}`;
    })
    .join("\n");
}

export function buildWriterPromptInjection(
  diagnostics: TsDiagnostic[],
  attempt: number,
  maxAttempts: number
): string {
  return [
    "=== SELF-REFINING CORRECTION FEEDBACK (INJECTED) ===",
    `Correction cycle ${attempt}/${maxAttempts}. Previous patch failed TypeScript validation.`,
    "Exact validation errors:",
    formatDiagnosticsForPrompt(diagnostics),
    "Revise the patch to eliminate every ERROR diagnostic. Keep the fix minimal and typed.",
    "Do not introduce @ts-ignore, eval, or secret env reads.",
    "=== END CORRECTION FEEDBACK ===",
  ].join("\n");
}

/**
 * Validate → on failure, prompt-inject errors into Writer → retry.
 * Hard escape: MAX_CORRECTION_CYCLES (3). Then caller routes to Validator.
 */
export async function runSelfRefiningExecutionLoop(options: {
  initial: FileAdjustment;
  correctWriter: WriterCorrectionFn;
  maxCycles?: typeof MAX_CORRECTION_CYCLES | 1 | 2 | 3;
}): Promise<SelfRefiningLoopResult> {
  const maxCycles = Math.min(
    Math.max(options.maxCycles ?? MAX_CORRECTION_CYCLES, 1),
    MAX_CORRECTION_CYCLES
  ) as 1 | 2 | 3;

  const cycleLogs: string[] = [];
  let current = options.initial;
  let attempts = 0;
  let lastValidation = await validateTypeScriptAdjustment(current);

  cycleLogs.push(
    `validate:attempt=0 ok=${lastValidation.ok} errors=${lastValidation.diagnostics.filter((d) => d.severity === "error").length}`
  );

  while (!lastValidation.ok && attempts < maxCycles) {
    attempts += 1;
    const promptInjection = buildWriterPromptInjection(
      lastValidation.diagnostics,
      attempts,
      maxCycles
    );
    cycleLogs.push(`writer:correction_cycle=${attempts}`);

    current = await options.correctWriter({
      attempt: attempts,
      maxAttempts: MAX_CORRECTION_CYCLES,
      previous: current,
      diagnostics: lastValidation.diagnostics,
      promptInjection,
    });

    lastValidation = await validateTypeScriptAdjustment(current);
    cycleLogs.push(
      `validate:attempt=${attempts} ok=${lastValidation.ok} errors=${lastValidation.diagnostics.filter((d) => d.severity === "error").length}`
    );

    if (attempts >= maxCycles) break;
  }

  return {
    adjustment: current,
    validation: lastValidation,
    attempts,
    exhausted: !lastValidation.ok && attempts >= maxCycles,
    cycleLogs,
  };
}
