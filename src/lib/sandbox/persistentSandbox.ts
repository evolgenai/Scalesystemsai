/**
 * Stateful sandbox lifecycle — create / reconnect-exec / kill.
 * Prefers E2B Sandbox.connect(sandboxId); falls back to in-memory store.
 */

import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { isE2bConfigured } from "@/lib/sandbox/e2bExecutor";
import {
  createPersistentSandbox as createMemorySandbox,
  execPersistentSandbox as execMemorySandbox,
  getPersistentSandboxView,
  terminatePersistentSandbox as terminateMemorySandbox,
} from "@/lib/sandbox/persistentSandboxStore";

export const PERSISTENT_SANDBOX_DEFAULT_TIMEOUT_MS = 3_600_000 as const;
export const PERSISTENT_SANDBOX_MAX_TIMEOUT_MS = 86_400_000 as const;
export const PERSISTENT_SANDBOX_DEFAULT_CWD = "/home/user/workspace" as const;

export const PersistentSandboxCreateSchema = z.object({
  action: z.literal("create"),
  workspaceId: z.string().trim().min(1).optional(),
  timeoutMs: z
    .number()
    .int()
    .min(60_000)
    .max(PERSISTENT_SANDBOX_MAX_TIMEOUT_MS)
    .optional(),
  cwd: z.string().trim().min(1).max(512).optional(),
  label: z.string().trim().min(1).max(120).optional(),
});

export const PersistentSandboxExecSchema = z.object({
  action: z.literal("exec"),
  sandboxId: z.string().trim().min(1).max(128),
  workspaceId: z.string().trim().min(1).optional(),
  command: z.string().max(32_000).optional(),
  code: z.string().max(80_000).optional(),
  language: z.enum(["javascript", "python", "bash"]).optional(),
  cwd: z.string().trim().min(1).max(512).optional(),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
});

export const PersistentSandboxKillSchema = z.object({
  action: z.literal("kill"),
  sandboxId: z.string().trim().min(1).max(128),
  workspaceId: z.string().trim().min(1).optional(),
});

export const PersistentSandboxBodySchema = z.discriminatedUnion("action", [
  PersistentSandboxCreateSchema,
  PersistentSandboxExecSchema,
  PersistentSandboxKillSchema,
]);

export type PersistentSandboxBody = z.infer<typeof PersistentSandboxBodySchema>;

export type PersistentSandboxRecord = {
  id: string;
  sandboxId: string;
  workspaceId: string;
  status: "ACTIVE" | "TERMINATED";
  cwd: string;
  timeoutMs: number;
  label: string | null;
  lastActiveAt: string;
  terminatedAt: string | null;
  createdAt: string;
  provider?: "e2b" | "memory";
  uptimeMs?: number;
  processCount?: number;
};

function toRecord(row: {
  id: string;
  sandboxId: string;
  workspaceId: string;
  status: "ACTIVE" | "TERMINATED";
  cwd: string;
  timeoutMs: number;
  label: string | null;
  lastActiveAt: Date;
  terminatedAt: Date | null;
  createdAt: Date;
}): PersistentSandboxRecord {
  return {
    id: row.id,
    sandboxId: row.sandboxId,
    workspaceId: row.workspaceId,
    status: row.status,
    cwd: row.cwd,
    timeoutMs: row.timeoutMs,
    label: row.label,
    lastActiveAt: row.lastActiveAt.toISOString(),
    terminatedAt: row.terminatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    provider: "e2b",
    uptimeMs: Date.now() - row.createdAt.getTime(),
  };
}

function memoryToRecord(
  sandboxId: string,
  workspaceId: string,
  label?: string | null
): PersistentSandboxRecord | null {
  const view = getPersistentSandboxView(sandboxId);
  if (!view) return null;
  return {
    id: sandboxId,
    sandboxId,
    workspaceId,
    status: "ACTIVE",
    cwd: view.cwd,
    timeoutMs: PERSISTENT_SANDBOX_DEFAULT_TIMEOUT_MS,
    label: label ?? null,
    lastActiveAt: new Date(view.lastActiveAt).toISOString(),
    terminatedAt: null,
    createdAt: new Date(view.createdAt).toISOString(),
    provider: "memory",
    uptimeMs: view.uptimeMs,
    processCount: view.processCount,
  };
}

async function loadE2bSandbox() {
  const { Sandbox } = await import("@e2b/code-interpreter");
  return Sandbox;
}

export async function createPersistentSandbox(input: {
  workspaceId: string;
  timeoutMs?: number;
  cwd?: string;
  label?: string;
}): Promise<
  | { ok: true; record: PersistentSandboxRecord }
  | { ok: false; error: string; code: string }
> {
  const timeoutMs = input.timeoutMs ?? PERSISTENT_SANDBOX_DEFAULT_TIMEOUT_MS;
  const cwd = (input.cwd?.trim() || PERSISTENT_SANDBOX_DEFAULT_CWD).replace(
    /\\/g,
    "/"
  );

  if (!isE2bConfigured()) {
    const mem = createMemorySandbox(input.workspaceId);
    mem.cwd = cwd.startsWith("/") ? cwd : `/${cwd}`;
    const record = memoryToRecord(mem.sandboxId, input.workspaceId, input.label);
    if (!record) {
      return {
        ok: false,
        error: "Failed to create memory sandbox.",
        code: "PERSISTENT_CREATE_FAILED",
      };
    }
    return { ok: true, record };
  }

  const Sandbox = await loadE2bSandbox();
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;

  try {
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY!.trim(),
      timeoutMs,
    });

    await sandbox.commands.run(`mkdir -p ${JSON.stringify(cwd)}`, {
      timeoutMs: 30_000,
    });

    const row = await getPrisma().persistentSandbox.create({
      data: {
        sandboxId: sandbox.sandboxId,
        workspaceId: input.workspaceId,
        status: "ACTIVE",
        cwd,
        timeoutMs,
        label: input.label?.trim() || null,
        lastActiveAt: new Date(),
      },
    });

    return { ok: true, record: toRecord(row) };
  } catch (err) {
    if (sandbox) {
      await sandbox.kill().catch(() => undefined);
    }
    const mem = createMemorySandbox(input.workspaceId);
    const record = memoryToRecord(mem.sandboxId, input.workspaceId, input.label);
    if (record) return { ok: true, record };
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to create persistent E2B sandbox.",
      code: "PERSISTENT_CREATE_FAILED",
    };
  }
}

export async function execPersistentSandbox(input: {
  workspaceId: string;
  sandboxId: string;
  command?: string;
  code?: string;
  language?: "javascript" | "python" | "bash";
  cwd?: string;
  timeoutMs?: number;
}): Promise<
  | {
      ok: true;
      record: PersistentSandboxRecord;
      exitCode: number;
      stdout: string;
      stderr: string;
      cwd: string;
      durationMs: number;
    }
  | { ok: false; error: string; code: string; status?: number }
> {
  const command = input.command?.trim() || "";
  const code = input.code?.trim() || "";
  if (!command && !code) {
    return {
      ok: false,
      error: "command or code is required.",
      code: "COMMAND_REQUIRED",
      status: 400,
    };
  }

  if (input.sandboxId.startsWith("psb_") || !isE2bConfigured()) {
    const result = await execMemorySandbox({
      sandboxId: input.sandboxId,
      command: command || undefined,
      code: code || undefined,
      language: input.language ?? (code ? "javascript" : "bash"),
    });
    const record = memoryToRecord(input.sandboxId, input.workspaceId);
    if (!record && result.exitCode !== 0 && /not found/i.test(result.stderr)) {
      return {
        ok: false,
        error: result.stderr || "Sandbox not found or terminated.",
        code: "SANDBOX_NOT_FOUND",
        status: 404,
      };
    }
    return {
      ok: true,
      record:
        record ??
        ({
          id: input.sandboxId,
          sandboxId: input.sandboxId,
          workspaceId: input.workspaceId,
          status: "ACTIVE",
          cwd: result.cwd,
          timeoutMs: PERSISTENT_SANDBOX_DEFAULT_TIMEOUT_MS,
          label: null,
          lastActiveAt: new Date().toISOString(),
          terminatedAt: null,
          createdAt: new Date().toISOString(),
          provider: "memory",
          uptimeMs: result.uptimeMs,
        } satisfies PersistentSandboxRecord),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      cwd: result.cwd,
      durationMs: result.durationMs,
    };
  }

  const prisma = getPrisma();
  const row = await prisma.persistentSandbox.findUnique({
    where: { sandboxId: input.sandboxId },
  });

  if (!row || row.workspaceId !== input.workspaceId) {
    return {
      ok: false,
      error: "Persistent sandbox not found in this workspace.",
      code: "SANDBOX_NOT_FOUND",
      status: 404,
    };
  }

  if (row.status !== "ACTIVE") {
    return {
      ok: false,
      error: "Sandbox is terminated.",
      code: "SANDBOX_TERMINATED",
      status: 409,
    };
  }

  const cwd = (input.cwd?.trim() || row.cwd).replace(/\\/g, "/");
  const started = Date.now();
  const Sandbox = await loadE2bSandbox();

  let shellCommand = command;
  if (!shellCommand && code) {
    shellCommand =
      input.language === "python"
        ? `python3 - <<'PY'\n${code}\nPY`
        : `node -e ${JSON.stringify(code)}`;
  }

  try {
    const sandbox = await Sandbox.connect(input.sandboxId, {
      apiKey: process.env.E2B_API_KEY!.trim(),
    });

    const result = await sandbox.commands.run(shellCommand, {
      cwd,
      timeoutMs: input.timeoutMs ?? 120_000,
    });

    const updated = await prisma.persistentSandbox.update({
      where: { id: row.id },
      data: { cwd, lastActiveAt: new Date() },
    });

    return {
      ok: true,
      record: toRecord(updated),
      exitCode: result.exitCode,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      cwd,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Persistent sandbox exec failed.";
    const gone =
      /not found|does not exist|killed|terminated|paused/i.test(message);

    if (gone) {
      await prisma.persistentSandbox.update({
        where: { id: row.id },
        data: {
          status: "TERMINATED",
          terminatedAt: new Date(),
          lastActiveAt: new Date(),
        },
      });
    }

    return {
      ok: false,
      error: message,
      code: gone ? "SANDBOX_GONE" : "PERSISTENT_EXEC_FAILED",
      status: gone ? 410 : 502,
    };
  }
}

export async function killPersistentSandbox(input: {
  workspaceId: string;
  sandboxId: string;
}): Promise<
  | { ok: true; record: PersistentSandboxRecord; killed: boolean }
  | { ok: false; error: string; code: string; status?: number }
> {
  if (input.sandboxId.startsWith("psb_") || !isE2bConfigured()) {
    const view = getPersistentSandboxView(input.sandboxId);
    const killed = terminateMemorySandbox(input.sandboxId);
    if (!killed && !view) {
      return {
        ok: false,
        error: "Persistent sandbox not found in this workspace.",
        code: "SANDBOX_NOT_FOUND",
        status: 404,
      };
    }
    return {
      ok: true,
      killed: true,
      record: {
        id: input.sandboxId,
        sandboxId: input.sandboxId,
        workspaceId: input.workspaceId,
        status: "TERMINATED",
        cwd: view?.cwd ?? "/workspace",
        timeoutMs: PERSISTENT_SANDBOX_DEFAULT_TIMEOUT_MS,
        label: null,
        lastActiveAt: new Date().toISOString(),
        terminatedAt: new Date().toISOString(),
        createdAt: view
          ? new Date(view.createdAt).toISOString()
          : new Date().toISOString(),
        provider: "memory",
        uptimeMs: view?.uptimeMs ?? 0,
      },
    };
  }

  const prisma = getPrisma();
  const row = await prisma.persistentSandbox.findUnique({
    where: { sandboxId: input.sandboxId },
  });

  if (!row || row.workspaceId !== input.workspaceId) {
    return {
      ok: false,
      error: "Persistent sandbox not found in this workspace.",
      code: "SANDBOX_NOT_FOUND",
      status: 404,
    };
  }

  let killed = false;
  if (isE2bConfigured() && row.status === "ACTIVE") {
    try {
      const Sandbox = await loadE2bSandbox();
      killed = await Sandbox.kill(input.sandboxId, {
        apiKey: process.env.E2B_API_KEY!.trim(),
      });
    } catch {
      killed = false;
    }
  }

  const updated = await prisma.persistentSandbox.update({
    where: { id: row.id },
    data: {
      status: "TERMINATED",
      terminatedAt: new Date(),
      lastActiveAt: new Date(),
    },
  });

  return { ok: true, record: toRecord(updated), killed };
}
