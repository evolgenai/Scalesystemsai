/**
 * GitHub PR remediation engine — branch + commit hotfix + open structured PR.
 * Master GITHUB_TOKEN stays server-side; never logged or returned in responses.
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";

const BLOCKED_PATH_RE =
  /(^|\/)(\.env|\.env\..+|credentials\.json|.*\.pem|.*\.key)$/i;

export const GitPrFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(512)
    .refine((p) => !p.includes("..") && !p.startsWith("/") && !p.includes("\\"), {
      message: "Path must be repo-relative without traversal.",
    })
    .refine((p) => !BLOCKED_PATH_RE.test(p), {
      message: "Writes to credential/env files are blocked.",
    }),
  content: z.string().max(1_000_000),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});

export const GitPrRemediationSchema = z.object({
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9-]+$/),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/),
  baseBranch: z.string().min(1).max(255).default("main"),
  branchName: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9._\-\/]+$/)
    .optional(),
  title: z.string().min(8).max(256),
  body: z.string().min(1).max(65_536),
  files: z.array(GitPrFileSchema).min(1).max(40),
  commitMessage: z.string().min(8).max(500).optional(),
  draft: z.boolean().default(false),
  loopId: z.string().min(8).max(128),
  validatorApproved: z.literal(true),
  severity: z.enum(["critical", "high", "medium"]).default("critical"),
  errorSummary: z.string().max(2000).optional(),
});

export type GitPrRemediationInput = z.infer<typeof GitPrRemediationSchema>;

export type GitPrRemediationResult = {
  ok: true;
  owner: string;
  repo: string;
  baseBranch: string;
  headBranch: string;
  commitSha: string;
  prNumber: number;
  prUrl: string;
  filesChanged: string[];
  loopId: string;
};

export type GitPrRemediationFailure = {
  ok: false;
  error: string;
  code: string;
  status?: number;
};

type GhJson = Record<string, unknown>;

function resolveGitHubToken(): string {
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_APP_TOKEN?.trim() ||
    "";
  if (!token) {
    throw Object.assign(new Error("GitHub token not configured on server."), {
      code: "GITHUB_TOKEN_MISSING",
      status: 503,
    });
  }
  return token;
}

function defaultBranchName(loopId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const nonce = randomBytes(3).toString("hex");
  const safeLoop = loopId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
  return `hotfix/heal-${safeLoop || "loop"}-${stamp}-${nonce}`;
}

async function gh<T extends GhJson>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "scalesystems-remediation",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: T = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = { message: text.slice(0, 500) } as unknown as T;
    }
  }

  if (!res.ok) {
    const message =
      typeof data.message === "string"
        ? data.message
        : `GitHub API ${res.status}`;
    // Never include Authorization or token material in thrown errors.
    throw Object.assign(new Error(message), {
      code: "GITHUB_API_ERROR",
      status: res.status,
    });
  }

  return { status: res.status, data };
}

function contentToBase64(content: string, encoding: "utf-8" | "base64"): string {
  if (encoding === "base64") return content.replace(/\s+/g, "");
  return Buffer.from(content, "utf8").toString("base64");
}

/**
 * Isolate hotfix → commit verified patch files → open structured Pull Request.
 */
export async function executeGitPrRemediation(
  input: GitPrRemediationInput
): Promise<GitPrRemediationResult | GitPrRemediationFailure> {
  let parsed: GitPrRemediationInput;
  try {
    parsed = GitPrRemediationSchema.parse(input);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid remediation payload."
        : "Invalid remediation payload.";
    return { ok: false, error: message, code: "INVALID_BODY", status: 400 };
  }

  if (!parsed.validatorApproved) {
    return {
      ok: false,
      error: "Validator must approve before PR remediation.",
      code: "VALIDATOR_NOT_APPROVED",
      status: 403,
    };
  }

  let token: string;
  try {
    token = resolveGitHubToken();
  } catch (err) {
    const e = err as Error & { code?: string; status?: number };
    return {
      ok: false,
      error: e.message,
      code: e.code ?? "GITHUB_TOKEN_MISSING",
      status: e.status ?? 503,
    };
  }

  const headBranch = parsed.branchName?.trim() || defaultBranchName(parsed.loopId);
  const commitMessage =
    parsed.commitMessage?.trim() ||
    `fix: automated hotfix (${parsed.severity}) — ${parsed.title.slice(0, 72)}`;

  const repoPath = `/repos/${parsed.owner}/${parsed.repo}`;

  try {
    const ref = await gh<{ object?: { sha?: string } }>(
      token,
      "GET",
      `${repoPath}/git/ref/heads/${encodeURIComponent(parsed.baseBranch)}`
    );
    const baseSha = ref.data.object?.sha;
    if (!baseSha) {
      return {
        ok: false,
        error: `Base branch not found: ${parsed.baseBranch}`,
        code: "BASE_BRANCH_MISSING",
        status: 404,
      };
    }

    const baseCommit = await gh<{ tree?: { sha?: string } }>(
      token,
      "GET",
      `${repoPath}/git/commits/${baseSha}`
    );
    const baseTreeSha = baseCommit.data.tree?.sha;
    if (!baseTreeSha) {
      return {
        ok: false,
        error: "Unable to resolve base tree.",
        code: "BASE_TREE_MISSING",
        status: 502,
      };
    }

    const treeItems: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      content: string;
    }> = [];

    for (const file of parsed.files) {
      treeItems.push({
        path: file.path.replace(/^\/+/, ""),
        mode: "100644",
        type: "blob",
        content:
          file.encoding === "base64"
            ? Buffer.from(file.content.replace(/\s+/g, ""), "base64").toString(
                "utf8"
              )
            : file.content,
      });
    }

    const tree = await gh<{ sha?: string }>(token, "POST", `${repoPath}/git/trees`, {
      base_tree: baseTreeSha,
      tree: treeItems.map((t) => ({
        path: t.path,
        mode: t.mode,
        type: t.type,
        content: t.content,
      })),
    });

    if (!tree.data.sha) {
      return {
        ok: false,
        error: "Failed to create git tree.",
        code: "TREE_CREATE_FAILED",
        status: 502,
      };
    }

    const commit = await gh<{ sha?: string }>(
      token,
      "POST",
      `${repoPath}/git/commits`,
      {
        message: commitMessage,
        tree: tree.data.sha,
        parents: [baseSha],
      }
    );

    const commitSha = commit.data.sha;
    if (!commitSha) {
      return {
        ok: false,
        error: "Failed to create commit.",
        code: "COMMIT_CREATE_FAILED",
        status: 502,
      };
    }

    await gh(token, "POST", `${repoPath}/git/refs`, {
      ref: `refs/heads/${headBranch}`,
      sha: commitSha,
    });

    const prBody = [
      parsed.body.trim(),
      "",
      "---",
      "### Scale Systems · Autonomous Remediation",
      `- **Loop ID:** \`${parsed.loopId}\``,
      `- **Severity:** ${parsed.severity}`,
      `- **Validator:** approved`,
      parsed.errorSummary
        ? `- **Failure summary:** ${parsed.errorSummary.slice(0, 500)}`
        : null,
      `- **Files:** ${parsed.files.map((f) => `\`${f.path}\``).join(", ")}`,
      "",
      "_This PR was opened by the Scale Systems healer remediation engine after a validator-approved hotfix._",
    ]
      .filter(Boolean)
      .join("\n");

    const pr = await gh<{
      number?: number;
      html_url?: string;
    }>(token, "POST", `${repoPath}/pulls`, {
      title: parsed.title,
      head: headBranch,
      base: parsed.baseBranch,
      body: prBody,
      draft: parsed.draft,
    });

    if (!pr.data.number || !pr.data.html_url) {
      return {
        ok: false,
        error: "Pull request created without number/url.",
        code: "PR_CREATE_INCOMPLETE",
        status: 502,
      };
    }

    return {
      ok: true,
      owner: parsed.owner,
      repo: parsed.repo,
      baseBranch: parsed.baseBranch,
      headBranch,
      commitSha,
      prNumber: pr.data.number,
      prUrl: pr.data.html_url,
      filesChanged: parsed.files.map((f) => f.path),
      loopId: parsed.loopId,
    };
  } catch (err) {
    const e = err as Error & { code?: string; status?: number };
    console.error(
      "[remediation/git-pr] failed:",
      e.code ?? "UNKNOWN",
      e.message
    );
    return {
      ok: false,
      error: e.message || "GitHub remediation failed.",
      code: e.code ?? "GITHUB_REMEDIATION_FAILED",
      status: e.status ?? 502,
    };
  }
}

/** Unused helper retained for callers that prefer Contents API single-file writes. */
export function encodeFileContent(
  content: string,
  encoding: "utf-8" | "base64" = "utf-8"
): string {
  return contentToBase64(content, encoding);
}
