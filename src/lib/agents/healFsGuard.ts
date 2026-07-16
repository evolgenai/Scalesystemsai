import path from "node:path";

const BLOCKED_SEGMENTS = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "credentials.json",
]);

/**
 * Heal sandbox root — always under process.cwd().
 * Override with HEAL_SANDBOX_DIR (repo-relative), default: project root.
 */
export function getHealSandboxRoot(): string {
  const cwd = path.resolve(process.cwd());
  const configured = process.env.HEAL_SANDBOX_DIR?.trim();
  if (!configured) return cwd;

  const resolved = path.resolve(cwd, configured.replace(/^[/\\]+/, ""));
  const rel = path.relative(cwd, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("HEAL_SANDBOX_DIR escapes project root.");
  }
  return resolved;
}

/**
 * Resolve a path that must stay inside the heal sandbox.
 * Rejects absolute escapes, `..` traversal, and sensitive env files.
 */
export function resolveSafeProjectPath(inputPath: string): string {
  const root = getHealSandboxRoot();
  const trimmed = inputPath.trim().replace(/^[/\\]+/, "");
  if (!trimmed) {
    throw new Error("Empty path is not allowed.");
  }

  const resolved = path.resolve(root, trimmed);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes heal sandbox — write blocked.");
  }

  // Also ensure we never leave the real project cwd even if sandbox misconfigured.
  const cwd = path.resolve(process.cwd());
  const fromCwd = path.relative(cwd, resolved);
  if (fromCwd.startsWith("..") || path.isAbsolute(fromCwd)) {
    throw new Error("Path escapes project root — write blocked.");
  }

  const base = path.basename(resolved).toLowerCase();
  if (BLOCKED_SEGMENTS.has(base) || base.startsWith(".env")) {
    throw new Error("Writes to environment/credential files are blocked.");
  }

  return resolved;
}

export function toProjectRelative(absPath: string): string {
  const root = path.resolve(process.cwd());
  return path.relative(root, absPath).split(path.sep).join("/");
}

/** Format a tool call log line: `toolName arg`. */
export function formatToolCallLog(
  toolName: string,
  args: unknown
): string {
  const target = extractPathArg(args);
  return target ? `${toolName} ${target}` : toolName;
}

function extractPathArg(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const record = args as Record<string, unknown>;
  for (const key of [
    "path",
    "filePath",
    "file",
    "filename",
    "target",
    "targetFile",
    "uri",
  ]) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
