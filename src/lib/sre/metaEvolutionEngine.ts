/**
 * Meta-SRE evolution dispatcher — evaluates self-remediation patches against
 * sandboxed compilation gates before any live commit / push is allowed.
 */

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Limits & constants                                                         */
/* -------------------------------------------------------------------------- */

export const META_EVOLUTION_LIMITS = {
  maxFiles: 24,
  maxPatchChars: 200_000,
  maxFileChars: 80_000,
  maxTitleChars: 256,
  maxSummaryChars: 4_000,
  sandboxTimeoutMs: 45_000,
  protocol: "scalesystems.sre.meta-evolution/v1",
} as const;

const PLATFORM_REPO = {
  owner: "scalesystems",
  repo: "scalesystemsai",
  defaultBranch: "main",
  isolationPrefix: "meta-sre/sandbox",
} as const;

const BLOCKED_PATH_RE =
  /(^|\/)(\.env|\.env\..+|credentials\.json|.*\.pem|.*\.key|secrets\/)/i;

const DANGEROUS_PATCH_RE: Array<{ re: RegExp; code: string; message: string }> =
  [
    {
      re: /\beval\s*\(/,
      code: "META_EVAL_BLOCKED",
      message: "eval() is forbidden in meta-evolution patches.",
    },
    {
      re: /\bnew\s+Function\s*\(/,
      code: "META_FUNCTION_CTOR",
      message: "Function constructor is forbidden in meta-evolution patches.",
    },
    {
      re: /\bchild_process\b|node:child_process/,
      code: "META_CHILD_PROCESS",
      message: "Process spawn primitives are blocked in meta patches.",
    },
    {
      re: /process\.env\.[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD)/i,
      code: "META_SECRET_REF",
      message: "Direct secret env reads are blocked in meta patches.",
    },
    {
      re: /\.\.\/\.\.\//,
      code: "META_PATH_ESCAPE",
      message: "Parent-directory traversal in patch content is blocked.",
    },
  ];

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

export const MetaEvolutionFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(512)
    .refine(
      (p) => !p.includes("..") && !p.startsWith("/") && !p.includes("\\"),
      { message: "Path must be repo-relative without traversal." }
    )
    .refine((p) => !BLOCKED_PATH_RE.test(p), {
      message: "Writes to credential/env files are blocked.",
    }),
  content: z.string().max(META_EVOLUTION_LIMITS.maxFileChars),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});

export const MetaEvolutionRequestSchema = z.object({
  workspaceId: z.string().uuid().optional().nullable(),
  /** Autonomous remediation loop identifier. */
  runId: z.string().min(8).max(128).optional(),
  trigger: z
    .enum([
      "autonomous_patch",
      "manual_hook",
      "scheduler",
      "chaos_feedback",
      "pool_failover",
    ])
    .default("autonomous_patch"),
  severity: z.enum(["critical", "high", "medium", "low"]).default("high"),
  title: z.string().min(8).max(META_EVOLUTION_LIMITS.maxTitleChars),
  summary: z.string().min(1).max(META_EVOLUTION_LIMITS.maxSummaryChars),
  targetFiles: z
    .array(MetaEvolutionFileSchema)
    .min(1)
    .max(META_EVOLUTION_LIMITS.maxFiles),
  /** Dry-run always discards commits; production still requires sandbox pass. */
  dryRun: z.boolean().default(true),
  /** Force sandbox failure for chaos / drill harnesses. */
  forceSandboxFail: z.boolean().default(false),
});

export type MetaEvolutionRequest = z.infer<typeof MetaEvolutionRequestSchema>;
export type MetaEvolutionFile = z.infer<typeof MetaEvolutionFileSchema>;

/* -------------------------------------------------------------------------- */
/* Result types                                                               */
/* -------------------------------------------------------------------------- */

export type MetaEvolutionPhase =
  | "isolate_repo"
  | "safety_scan"
  | "sandbox_build"
  | "commit_gate"
  | "discard"
  | "complete";

export type SandboxBuildDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  filePath?: string;
  line?: number;
};

export type SandboxBuildResult = {
  ok: boolean;
  containerId: string;
  image: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  diagnostics: SandboxBuildDiagnostic[];
  checkedAt: string;
};

export type IsolatedRepoConfig = {
  owner: string;
  repo: string;
  baseBranch: string;
  isolationBranch: string;
  sandboxRoot: string;
  commitAllowed: false;
  pushAllowed: false;
  configHash: string;
};

export type MetaEvolutionDiscard = {
  discarded: true;
  reason: string;
  code: string;
  commitSha: null;
  pushAttempted: false;
};

export type MetaEvolutionOk = {
  ok: true;
  workspaceId: string;
  runId: string;
  trigger: MetaEvolutionRequest["trigger"];
  phases: MetaEvolutionPhase[];
  isolation: IsolatedRepoConfig;
  sandbox: SandboxBuildResult;
  commitGate: {
    passed: true;
    /** Live push is never executed by this scaffold — only gated. */
    pushExecuted: false;
    pendingCommit: {
      branch: string;
      filesChanged: string[];
      message: string;
    } | null;
  };
  discarded: null;
};

export type MetaEvolutionFailure = {
  ok: false;
  workspaceId: string;
  runId: string;
  trigger: MetaEvolutionRequest["trigger"];
  phases: MetaEvolutionPhase[];
  isolation: IsolatedRepoConfig | null;
  sandbox: SandboxBuildResult | null;
  commitGate: {
    passed: false;
    pushExecuted: false;
    pendingCommit: null;
  };
  discarded: MetaEvolutionDiscard;
  error: string;
  code: string;
};

export type MetaEvolutionResult = MetaEvolutionOk | MetaEvolutionFailure;

export type ContainedResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: string; cause?: unknown };

/* -------------------------------------------------------------------------- */
/* Containment helpers                                                        */
/* -------------------------------------------------------------------------- */

export async function withSandboxContainment<T>(
  label: string,
  fn: () => Promise<T>
): Promise<ContainedResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unknown sandbox failure.";
    console.error(`[meta-evolution] ${label} contained:`, cause);
    return {
      ok: false,
      error: message,
      code: "META_SANDBOX_CONTAINED",
      cause,
    };
  }
}

export function withSyncContainment<T>(
  label: string,
  fn: () => T
): ContainedResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unknown sync failure.";
    console.error(`[meta-evolution] ${label} contained:`, cause);
    return {
      ok: false,
      error: message,
      code: "META_SYNC_CONTAINED",
      cause,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Isolation + safety                                                         */
/* -------------------------------------------------------------------------- */

function newRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  return `meta-${stamp}-${randomBytes(4).toString("hex")}`;
}

function hashPayload(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}

/**
 * Mock isolation of Scale Systems' own repository configuration.
 * Never mutates disk or opens network sockets — returns a sealed sandbox descriptor.
 */
export function isolatePlatformRepoConfig(
  workspaceId: string,
  runId: string
): IsolatedRepoConfig {
  const isolationBranch = `${PLATFORM_REPO.isolationPrefix}/${workspaceId.slice(0, 8)}-${runId.slice(-8)}`;
  const sandboxRoot = `/tmp/ss-meta-sandbox/${workspaceId}/${runId}`;
  const configHash = hashPayload([
    PLATFORM_REPO.owner,
    PLATFORM_REPO.repo,
    PLATFORM_REPO.defaultBranch,
    isolationBranch,
    sandboxRoot,
    workspaceId,
    runId,
  ]);

  return {
    owner: PLATFORM_REPO.owner,
    repo: PLATFORM_REPO.repo,
    baseBranch: PLATFORM_REPO.defaultBranch,
    isolationBranch,
    sandboxRoot,
    commitAllowed: false,
    pushAllowed: false,
    configHash,
  };
}

function scanPatchSafety(
  files: MetaEvolutionFile[]
): SandboxBuildDiagnostic[] {
  const diagnostics: SandboxBuildDiagnostic[] = [];
  let totalChars = 0;

  for (const file of files) {
    totalChars += file.content.length;
    if (BLOCKED_PATH_RE.test(file.path)) {
      diagnostics.push({
        code: "META_BLOCKED_PATH",
        severity: "error",
        message: `Blocked path: ${file.path}`,
        filePath: file.path,
      });
    }
    for (const rule of DANGEROUS_PATCH_RE) {
      const m = file.content.match(rule.re);
      if (m && m.index !== undefined) {
        const line = file.content.slice(0, m.index).split("\n").length;
        diagnostics.push({
          code: rule.code,
          severity: "error",
          message: rule.message,
          filePath: file.path,
          line,
        });
      }
    }
    const open = (file.content.match(/\{/g) ?? []).length;
    const close = (file.content.match(/\}/g) ?? []).length;
    if (Math.abs(open - close) > 3) {
      diagnostics.push({
        code: "META_BRACE_IMBALANCE",
        severity: "error",
        message: `Unbalanced braces (open=${open} close=${close}).`,
        filePath: file.path,
      });
    }
  }

  if (totalChars > META_EVOLUTION_LIMITS.maxPatchChars) {
    diagnostics.push({
      code: "META_PATCH_TOO_LARGE",
      severity: "error",
      message: `Aggregate patch exceeds ${META_EVOLUTION_LIMITS.maxPatchChars} chars.`,
    });
  }

  return diagnostics;
}

/**
 * Simulated container sandbox validator build check.
 * Structural health only — does not execute untrusted code or push commits.
 */
export async function runSandboxValidatorBuild(input: {
  isolation: IsolatedRepoConfig;
  files: MetaEvolutionFile[];
  forceFail?: boolean;
  signal?: AbortSignal;
}): Promise<SandboxBuildResult> {
  const started = Date.now();
  const containerId = `ss-meta-${randomBytes(6).toString("hex")}`;
  const image = "ghcr.io/scalesystems/meta-sre-validator:nodejs20";
  const diagnostics: SandboxBuildDiagnostic[] = [...scanPatchSafety(input.files)];

  if (input.signal?.aborted) {
    return {
      ok: false,
      containerId,
      image,
      durationMs: Date.now() - started,
      exitCode: 130,
      stdout: "",
      stderr: "Sandbox aborted by caller signal.",
      diagnostics: [
        ...diagnostics,
        {
          code: "META_SANDBOX_ABORTED",
          severity: "error",
          message: "Sandbox aborted by caller signal.",
        },
      ],
      checkedAt: new Date().toISOString(),
    };
  }

  // Yield so the event loop can process abort / timeouts in serverless hosts.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  if (input.forceFail) {
    diagnostics.push({
      code: "META_FORCE_FAIL",
      severity: "error",
      message: "forceSandboxFail=true — simulated compilation failure.",
    });
  }

  // Mock tsc structural gate: TypeScript-looking files must declare exports or imports.
  for (const file of input.files) {
    if (/\.(ts|tsx|mts|cts)$/i.test(file.path)) {
      const body = file.content.trim();
      if (body && !/\b(import|export|declare)\b/.test(body)) {
        diagnostics.push({
          code: "META_TS_NO_MODULE",
          severity: "warning",
          message: "TypeScript file lacks import/export/declare — structural smell.",
          filePath: file.path,
        });
      }
      if (/\bas\s+any\b/.test(body)) {
        diagnostics.push({
          code: "META_TS_ANY",
          severity: "error",
          message: "`as any` fails the meta-SRE type integrity gate.",
          filePath: file.path,
        });
      }
    }
  }

  const errors = diagnostics.filter((d) => d.severity === "error");
  const ok = errors.length === 0;
  const durationMs = Date.now() - started;

  return {
    ok,
    containerId,
    image,
    durationMs,
    exitCode: ok ? 0 : 1,
    stdout: ok
      ? [
          `Isolated ${input.isolation.owner}/${input.isolation.repo}@${input.isolation.baseBranch}`,
          `Sandbox root: ${input.isolation.sandboxRoot}`,
          `Config hash: ${input.isolation.configHash}`,
          `Files checked: ${input.files.length}`,
          "Simulated build: PASS",
        ].join("\n")
      : [
          `Isolated ${input.isolation.owner}/${input.isolation.repo}`,
          `Files checked: ${input.files.length}`,
          "Simulated build: FAIL",
          ...errors.map((e) => `${e.code}: ${e.message}`),
        ].join("\n"),
    stderr: ok
      ? ""
      : errors.map((e) => `${e.filePath ?? "?"}:${e.line ?? 0} ${e.code} ${e.message}`).join("\n"),
    diagnostics,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Intercept a failed sandbox build — discard patch before any commit/push.
 */
export function discardFailedMetaPatch(
  reason: string,
  code: string
): MetaEvolutionDiscard {
  return {
    discarded: true,
    reason,
    code,
    commitSha: null,
    pushAttempted: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

export type ExecuteMetaEvolutionInput = {
  workspaceId: string;
  request: MetaEvolutionRequest;
  signal?: AbortSignal;
};

/**
 * Full meta-evolution pipeline:
 * isolate platform repo → safety scan → sandbox build → commit gate.
 * Failed compilation always discards; live push is never performed by this scaffold.
 */
export async function executeMetaEvolutionRun(
  input: ExecuteMetaEvolutionInput
): Promise<MetaEvolutionResult> {
  const { workspaceId, request, signal } = input;
  const runId = request.runId?.trim() || newRunId();
  const phases: MetaEvolutionPhase[] = [];

  const isolationContained = withSyncContainment("isolate_repo", () =>
    isolatePlatformRepoConfig(workspaceId, runId)
  );
  if (!isolationContained.ok) {
    phases.push("isolate_repo", "discard");
    return {
      ok: false,
      workspaceId,
      runId,
      trigger: request.trigger,
      phases,
      isolation: null,
      sandbox: null,
      commitGate: {
        passed: false,
        pushExecuted: false,
        pendingCommit: null,
      },
      discarded: discardFailedMetaPatch(
        isolationContained.error,
        isolationContained.code
      ),
      error: isolationContained.error,
      code: isolationContained.code,
    };
  }

  const isolation = isolationContained.value;
  phases.push("isolate_repo");

  phases.push("safety_scan");
  const safetyDiagnostics = scanPatchSafety(request.targetFiles);
  const safetyErrors = safetyDiagnostics.filter((d) => d.severity === "error");
  if (safetyErrors.length > 0) {
    phases.push("discard");
    const reason = safetyErrors.map((e) => e.message).join("; ");
    return {
      ok: false,
      workspaceId,
      runId,
      trigger: request.trigger,
      phases,
      isolation,
      sandbox: null,
      commitGate: {
        passed: false,
        pushExecuted: false,
        pendingCommit: null,
      },
      discarded: discardFailedMetaPatch(reason, "META_SAFETY_REJECTED"),
      error: reason,
      code: "META_SAFETY_REJECTED",
    };
  }

  phases.push("sandbox_build");
  const sandboxContained = await withSandboxContainment(
    "sandbox_build",
    () =>
      runSandboxValidatorBuild({
        isolation,
        files: request.targetFiles,
        forceFail: request.forceSandboxFail,
        signal,
      })
  );

  if (!sandboxContained.ok) {
    phases.push("discard");
    return {
      ok: false,
      workspaceId,
      runId,
      trigger: request.trigger,
      phases,
      isolation,
      sandbox: null,
      commitGate: {
        passed: false,
        pushExecuted: false,
        pendingCommit: null,
      },
      discarded: discardFailedMetaPatch(
        sandboxContained.error,
        sandboxContained.code
      ),
      error: sandboxContained.error,
      code: sandboxContained.code,
    };
  }

  const sandbox = sandboxContained.value;
  phases.push("commit_gate");

  if (!sandbox.ok) {
    phases.push("discard");
    const reason =
      sandbox.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.message)
        .join("; ") || "Sandbox compilation check failed.";
    return {
      ok: false,
      workspaceId,
      runId,
      trigger: request.trigger,
      phases,
      isolation,
      sandbox,
      commitGate: {
        passed: false,
        pushExecuted: false,
        pendingCommit: null,
      },
      discarded: discardFailedMetaPatch(reason, "META_SANDBOX_BUILD_FAILED"),
      error: reason,
      code: "META_SANDBOX_BUILD_FAILED",
    };
  }

  // Commit gate passed — still never push from this scaffold.
  // dryRun keeps pendingCommit descriptive only.
  phases.push("complete");
  const filesChanged = request.targetFiles.map((f) => f.path);

  return {
    ok: true,
    workspaceId,
    runId,
    trigger: request.trigger,
    phases,
    isolation,
    sandbox,
    commitGate: {
      passed: true,
      pushExecuted: false,
      pendingCommit: request.dryRun
        ? null
        : {
            branch: isolation.isolationBranch,
            filesChanged,
            message: `meta-sre: ${request.title}`.slice(0, 500),
          },
    },
    discarded: null,
  };
}
