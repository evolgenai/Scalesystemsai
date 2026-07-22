/**
 * In-process persistent workspace sandbox registry.
 * Keeps cwd / env / virtual FS / command history alive across exec calls.
 */

import { randomBytes } from "node:crypto";
import {
  executeCodeInSandbox,
  type SandboxLanguage,
} from "@/lib/agents/codeSandbox";

export type PersistentSandboxLanguage = SandboxLanguage | "bash";

export type PersistentSandboxRecord = {
  sandboxId: string;
  workspaceId: string;
  createdAt: number;
  lastActiveAt: number;
  cwd: string;
  env: Record<string, string>;
  files: Record<string, string>;
  history: string[];
  processCount: number;
  status: "running" | "terminated";
};

export type PersistentExecResult = {
  sandboxId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  cwd: string;
  uptimeMs: number;
};

const TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 64;
const store = new Map<string, PersistentSandboxRecord>();

function mintId(): string {
  return `psb_${randomBytes(10).toString("hex")}`;
}

function purgeExpired(now = Date.now()): void {
  for (const [id, rec] of store) {
    if (
      rec.status === "terminated" ||
      now - rec.lastActiveAt > TTL_MS
    ) {
      store.delete(id);
    }
  }
  while (store.size > MAX_SESSIONS) {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, rec] of store) {
      if (rec.lastActiveAt < oldestAt) {
        oldestAt = rec.lastActiveAt;
        oldestId = id;
      }
    }
    if (!oldestId) break;
    store.delete(oldestId);
  }
}

function resolvePath(cwd: string, target: string): string {
  const raw = target.trim() || ".";
  if (raw.startsWith("/")) return normalizePath(raw);
  return normalizePath(`${cwd}/${raw}`);
}

function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return `/${out.join("/")}`;
}

function listDir(files: Record<string, string>, cwd: string): string[] {
  const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  const names = new Set<string>();
  for (const key of Object.keys(files)) {
    if (!key.startsWith(prefix) && key !== cwd) continue;
    const rest = key === cwd ? "" : key.slice(prefix.length);
    if (!rest) continue;
    const name = rest.split("/")[0];
    if (name) names.add(name);
  }
  return [...names].sort();
}

function publicView(rec: PersistentSandboxRecord) {
  return {
    sandboxId: rec.sandboxId,
    workspaceId: rec.workspaceId,
    status: rec.status,
    cwd: rec.cwd,
    createdAt: rec.createdAt,
    lastActiveAt: rec.lastActiveAt,
    uptimeMs: Date.now() - rec.createdAt,
    processCount: rec.processCount,
    fileCount: Object.keys(rec.files).length,
  };
}

export function createPersistentSandbox(workspaceId: string): PersistentSandboxRecord {
  purgeExpired();
  const now = Date.now();
  const rec: PersistentSandboxRecord = {
    sandboxId: mintId(),
    workspaceId,
    createdAt: now,
    lastActiveAt: now,
    cwd: "/workspace",
    env: {
      HOME: "/workspace",
      USER: "sandbox",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      PS1: "root@persistent:~# ",
    },
    files: {
      "/workspace/README.md":
        "# Persistent Workspace Sandbox\nState survives across commands until Terminate.\n",
    },
    history: [],
    processCount: 0,
    status: "running",
  };
  store.set(rec.sandboxId, rec);
  return rec;
}

export function getPersistentSandbox(
  sandboxId: string
): PersistentSandboxRecord | null {
  purgeExpired();
  const rec = store.get(sandboxId);
  if (!rec || rec.status !== "running") return null;
  return rec;
}

export function getPersistentSandboxView(sandboxId: string) {
  const rec = getPersistentSandbox(sandboxId);
  return rec ? publicView(rec) : null;
}

export function terminatePersistentSandbox(sandboxId: string): boolean {
  const rec = store.get(sandboxId);
  if (!rec) return false;
  rec.status = "terminated";
  store.delete(sandboxId);
  return true;
}

function runBuiltin(
  rec: PersistentSandboxRecord,
  command: string
): PersistentExecResult | null {
  const started = Date.now();
  const trimmed = command.trim();
  if (!trimmed) {
    return {
      sandboxId: rec.sandboxId,
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 0,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  const [bin, ...args] = trimmed.split(/\s+/);
  const argLine = trimmed.slice(bin!.length).trim();

  if (bin === "pwd") {
    return {
      sandboxId: rec.sandboxId,
      stdout: `${rec.cwd}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "cd") {
    const target = args[0] ?? "/workspace";
    const next = resolvePath(rec.cwd, target);
    const isDir =
      next === "/workspace" ||
      Object.keys(rec.files).some(
        (f) => f === next || f.startsWith(`${next}/`)
      ) ||
      next.startsWith("/workspace");
    if (!isDir) {
      return {
        sandboxId: rec.sandboxId,
        stdout: "",
        stderr: `cd: no such file or directory: ${target}\n`,
        exitCode: 1,
        durationMs: Date.now() - started,
        cwd: rec.cwd,
        uptimeMs: Date.now() - rec.createdAt,
      };
    }
    rec.cwd = next === "/" ? "/workspace" : next;
    return {
      sandboxId: rec.sandboxId,
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "ls") {
    const target = args[0] ? resolvePath(rec.cwd, args[0]) : rec.cwd;
    const names = listDir(rec.files, target);
    return {
      sandboxId: rec.sandboxId,
      stdout: `${names.join("\n")}${names.length ? "\n" : ""}`,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "cat") {
    const target = args[0];
    if (!target) {
      return {
        sandboxId: rec.sandboxId,
        stdout: "",
        stderr: "cat: missing operand\n",
        exitCode: 1,
        durationMs: Date.now() - started,
        cwd: rec.cwd,
        uptimeMs: Date.now() - rec.createdAt,
      };
    }
    const path = resolvePath(rec.cwd, target);
    const body = rec.files[path];
    if (body == null) {
      return {
        sandboxId: rec.sandboxId,
        stdout: "",
        stderr: `cat: ${target}: No such file or directory\n`,
        exitCode: 1,
        durationMs: Date.now() - started,
        cwd: rec.cwd,
        uptimeMs: Date.now() - rec.createdAt,
      };
    }
    return {
      sandboxId: rec.sandboxId,
      stdout: body.endsWith("\n") ? body : `${body}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "export" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) {
    const assign = bin === "export" ? argLine : trimmed;
    const eq = assign.indexOf("=");
    if (eq > 0) {
      const key = assign.slice(0, eq).trim();
      let val = assign.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      rec.env[key] = val;
    }
    return {
      sandboxId: rec.sandboxId,
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "env" || bin === "printenv") {
    const lines = Object.entries(rec.env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`);
    return {
      sandboxId: rec.sandboxId,
      stdout: `${lines.join("\n")}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "echo") {
    let out = argLine.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key: string) =>
      rec.env[key] ?? ""
    );
    out = out.replace(/^["']|["']$/g, "");
    return {
      sandboxId: rec.sandboxId,
      stdout: `${out}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "uname") {
    return {
      sandboxId: rec.sandboxId,
      stdout: "ScaleSystems PersistentSandbox 1.0\n",
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  if (bin === "uptime") {
    const sec = Math.floor((Date.now() - rec.createdAt) / 1000);
    return {
      sandboxId: rec.sandboxId,
      stdout: `up ${sec}s · processes=${rec.processCount}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  // printf-style write: write PATH <<EOF ... (simplified: write PATH CONTENT)
  if (bin === "write" || bin === "tee") {
    const pathArg = args[0];
    if (!pathArg) {
      return {
        sandboxId: rec.sandboxId,
        stdout: "",
        stderr: `${bin}: missing path\n`,
        exitCode: 1,
        durationMs: Date.now() - started,
        cwd: rec.cwd,
        uptimeMs: Date.now() - rec.createdAt,
      };
    }
    const path = resolvePath(rec.cwd, pathArg);
    const content = trimmed.replace(/^(write|tee)\s+\S+\s*/, "");
    rec.files[path] = content;
    return {
      sandboxId: rec.sandboxId,
      stdout: bin === "tee" ? `${content}\n` : "",
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  return null;
}

function wrapStatefulCode(
  rec: PersistentSandboxRecord,
  code: string,
  language: PersistentSandboxLanguage
): { runnable: string; language: SandboxLanguage } {
  const envJson = JSON.stringify(rec.env);
  const filesJson = JSON.stringify(rec.files);
  const cwdJson = JSON.stringify(rec.cwd);

  if (language === "python") {
    return {
      language: "python",
      runnable: `
import json, os
__PSB_ENV = json.loads(${JSON.stringify(envJson)})
__PSB_FILES = json.loads(${JSON.stringify(filesJson)})
__PSB_CWD = ${cwdJson}
os.environ.update({k: str(v) for k, v in __PSB_ENV.items()})
# --- user code ---
${code}
`.trim(),
    };
  }

  // javascript (and bash→js wrapper path)
  return {
    language: "javascript",
    runnable: `
const __PSB_ENV = ${envJson};
const __PSB_FILES = ${filesJson};
const __PSB_CWD = ${cwdJson};
Object.assign(globalThis, { __PSB_ENV, __PSB_FILES, __PSB_CWD });
// --- user code ---
${code}
`.trim(),
  };
}

export async function execPersistentSandbox(options: {
  sandboxId: string;
  command?: string;
  code?: string;
  language?: PersistentSandboxLanguage;
  signal?: AbortSignal;
}): Promise<PersistentExecResult> {
  const rec = getPersistentSandbox(options.sandboxId);
  if (!rec) {
    return {
      sandboxId: options.sandboxId,
      stdout: "",
      stderr: "Sandbox not found or terminated.\n",
      exitCode: 1,
      durationMs: 0,
      cwd: "/",
      uptimeMs: 0,
    };
  }

  const started = Date.now();
  rec.lastActiveAt = started;
  rec.processCount += 1;

  const command = (options.command ?? "").trim();
  const code = (options.code ?? "").trim();
  const language: PersistentSandboxLanguage =
    options.language ??
    (code ? "javascript" : "bash");

  if (command) {
    rec.history.push(command);
    const builtin = runBuiltin(rec, command);
    if (builtin) {
      rec.lastActiveAt = Date.now();
      return builtin;
    }
  }

  const payload = code || command;
  if (!payload) {
    return {
      sandboxId: rec.sandboxId,
      stdout: "",
      stderr: "No command or code provided.\n",
      exitCode: 1,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }

  // Persist shell "node -e" / python one-liners via sandbox runner
  let runnableCode = payload;
  let runLang: SandboxLanguage = language === "bash" ? "javascript" : language;

  if (language === "bash" && !code) {
    // Non-builtin shell → echo through JS for visibility + state stamp
    runnableCode = `console.log(${JSON.stringify(`[persistent:${rec.sandboxId}] $ ${command}`)});
console.log("cwd=" + ${JSON.stringify(rec.cwd)});
console.log("(command delegated — use python/javascript payload for heavy compute)");`;
    runLang = "javascript";
  } else {
    const wrapped = wrapStatefulCode(rec, payload, language === "bash" ? "javascript" : language);
    runnableCode = wrapped.runnable;
    runLang = wrapped.language;
  }

  try {
    const result = await executeCodeInSandbox(runnableCode, runLang, {
      signal: options.signal,
    });
    rec.lastActiveAt = Date.now();

    // Allow user code to mutate virtual FS via printed markers
    const fsSync = /__PSB_WRITE__:(\/[^\n]+)\n([\s\S]*?)__PSB_END__/g;
    let match: RegExpExecArray | null;
    const stdout = result.stdout;
    while ((match = fsSync.exec(stdout)) !== null) {
      const path = match[1]!;
      const body = match[2] ?? "";
      rec.files[path] = body;
    }

    return {
      sandboxId: rec.sandboxId,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  } catch (err) {
    return {
      sandboxId: rec.sandboxId,
      stdout: "",
      stderr:
        err instanceof Error
          ? `${err.message}\n`
          : "Persistent sandbox execution failed.\n",
      exitCode: 1,
      durationMs: Date.now() - started,
      cwd: rec.cwd,
      uptimeMs: Date.now() - rec.createdAt,
    };
  }
}
