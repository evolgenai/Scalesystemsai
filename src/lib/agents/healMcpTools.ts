import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tool, type Tool } from "ai";
import { z } from "zod";
import {
  formatToolCallLog,
  resolveSafeProjectPath,
  toProjectRelative,
} from "@/lib/agents/healFsGuard";
import { createScaleMcpClient } from "@/lib/mcp/createClient";
import type { MCPClient } from "@ai-sdk/mcp";
import { decryptSecret, isEncryptedSecret } from "@/lib/security/crypto";
import { getPrisma } from "@/lib/prisma";
import {
  createEstateIotTools,
  isMeerendalWorkspace,
} from "@/lib/mcp/estateIotTools";

const WRITE_TOOL_NAME_RE =
  /write_?file|apply_?patch|edit_?file|create_?file|update_?file|save_?file|patch_?file/i;

export type ToolCallLog = string;

export type HealToolLogger = {
  toolCalls: ToolCallLog[];
  push: (line: string) => void;
};

export function createToolLogger(): HealToolLogger {
  const toolCalls: ToolCallLog[] = [];
  return {
    toolCalls,
    push(line: string) {
      toolCalls.push(line);
    },
  };
}

/** Local sandboxed FS tools — always available to the healer. */
export function createLocalHealFsTools(logger: HealToolLogger): Record<string, Tool> {
  return {
    write_file: tool({
      description:
        "Write or overwrite a file INSIDE the Scale Systems heal sandbox only. Use repo-relative paths.",
      inputSchema: z.object({
        path: z.string().describe("Repo-relative file path"),
        content: z.string().describe("Full file contents to write"),
      }),
      execute: async ({ path: relPath, content }) => {
        logger.push(formatToolCallLog("write_file", { path: relPath }));
        const abs = resolveSafeProjectPath(relPath);
        await mkdir(/* turbopackIgnore: true */ path.dirname(abs), {
          recursive: true,
        });
        await writeFile(/* turbopackIgnore: true */ abs, content, "utf8");
        return {
          ok: true,
          path: toProjectRelative(abs),
          bytes: Buffer.byteLength(content, "utf8"),
        };
      },
    }),
    apply_patch: tool({
      description:
        "Apply a minimal unified diff to an existing file inside the heal sandbox.",
      inputSchema: z.object({
        path: z.string().describe("Repo-relative file path"),
        patch: z.string().describe("Unified diff or replacement snippet"),
        fallbackContent: z
          .string()
          .optional()
          .describe("If file missing or patch cannot apply, write this full content"),
      }),
      execute: async ({ path: relPath, patch, fallbackContent }) => {
        logger.push(formatToolCallLog("apply_patch", { path: relPath }));
        const abs = resolveSafeProjectPath(relPath);
        let existing = "";
        try {
          existing = await readFile(/* turbopackIgnore: true */ abs, "utf8");
        } catch {
          if (!fallbackContent) {
            return { ok: false, error: "File not found and no fallbackContent." };
          }
          await mkdir(/* turbopackIgnore: true */ path.dirname(abs), {
            recursive: true,
          });
          await writeFile(
            /* turbopackIgnore: true */ abs,
            fallbackContent,
            "utf8"
          );
          return {
            ok: true,
            path: toProjectRelative(abs),
            mode: "created_fallback",
          };
        }

        const next = applySimpleUnifiedDiff(existing, patch);
        if (next === null) {
          if (fallbackContent) {
            await writeFile(
              /* turbopackIgnore: true */ abs,
              fallbackContent,
              "utf8"
            );
            return {
              ok: true,
              path: toProjectRelative(abs),
              mode: "fallback_full_write",
            };
          }
          return { ok: false, error: "Could not apply patch." };
        }

        await writeFile(/* turbopackIgnore: true */ abs, next, "utf8");
        return {
          ok: true,
          path: toProjectRelative(abs),
          mode: "patched",
        };
      },
    }),
    read_file: tool({
      description: "Read a UTF-8 file inside the heal sandbox (repo-relative path).",
      inputSchema: z.object({
        path: z.string().describe("Repo-relative file path"),
      }),
      execute: async ({ path: relPath }) => {
        logger.push(formatToolCallLog("read_file", { path: relPath }));
        const abs = resolveSafeProjectPath(relPath);
        try {
          const content = await readFile(/* turbopackIgnore: true */ abs, "utf8");
          return {
            ok: true,
            path: toProjectRelative(abs),
            content: content.slice(0, 100_000),
          };
        } catch {
          return { ok: false, error: "File not found." };
        }
      },
    }),
  };
}

function applySimpleUnifiedDiff(source: string, patch: string): string | null {
  const plusLines = patch
    .split(/\r?\n/)
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));

  if (plusLines.length === 0) {
    if (!patch.trim()) return null;
    return `${source.trimEnd()}\n\n${patch.trim()}\n`;
  }

  const injection = plusLines.join("\n");
  if (source.includes(injection)) return source;
  return `${source.trimEnd()}\n${injection}\n`;
}

function guardPathArgs(args: unknown): void {
  if (!args || typeof args !== "object") return;
  const record = args as Record<string, unknown>;
  for (const key of ["path", "filePath", "file", "filename", "target", "targetFile"]) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) {
      resolveSafeProjectPath(v);
    }
  }
}

/** Intercept MCP tool execute: log + sandbox path guard for write tools. */
function wrapMcpTool(
  name: string,
  original: Tool,
  logger: HealToolLogger
): Tool {
  const execute = original.execute;
  if (!execute) return original;

  const isWrite = WRITE_TOOL_NAME_RE.test(name);

  return {
    ...original,
    execute: async (args: unknown, options: unknown) => {
      logger.push(formatToolCallLog(name, args));
      if (isWrite) {
        try {
          guardPathArgs(args);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Sandbox path rejected.";
          return { ok: false, blocked: true, error: message };
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return execute(args as any, options as any);
    },
  } as Tool;
}

export type HealMcpSession = {
  clients: MCPClient[];
  tools: Record<string, Tool>;
  hostsConnected: number;
  toolNames: string[];
  logger: HealToolLogger;
  workspaceName: string | null;
  estateToolsEnabled: boolean;
};

/**
 * Connect active McpHost rows (optionally workspace-scoped) and merge AI SDK tools.
 * Meerendal Estate workspaces also receive mock IoT MCP tools.
 * Caller MUST close via `closeHealMcpSession`.
 */
export async function openHealMcpSession(options?: {
  workspaceId?: string | null;
}): Promise<HealMcpSession> {
  const logger = createToolLogger();
  const tools: Record<string, Tool> = { ...createLocalHealFsTools(logger) };
  const clients: MCPClient[] = [];

  let workspaceName: string | null = null;
  if (options?.workspaceId) {
    try {
      const ws = await getPrisma().workspace.findUnique({
        where: { id: options.workspaceId },
        select: { name: true },
      });
      workspaceName = ws?.name ?? null;
    } catch {
      workspaceName = null;
    }
  }

  const estateToolsEnabled = isMeerendalWorkspace(workspaceName);
  if (estateToolsEnabled) {
    Object.assign(
      tools,
      createEstateIotTools(logger, { workspaceId: options?.workspaceId })
    );
  }

  let hosts: Array<{
    id: string;
    url: string;
    transport: "HTTP" | "SSE";
    authTokenCipher: string | null;
  }> = [];

  try {
    hosts = await getPrisma().mcpHost.findMany({
      where: {
        isActive: true,
        ...(options?.workspaceId
          ? { workspaceId: options.workspaceId }
          : {}),
      },
      take: 5,
      select: {
        id: true,
        url: true,
        transport: true,
        authTokenCipher: true,
      },
    });
  } catch (err) {
    console.warn("[healMcp] host lookup skipped:", err);
  }

  for (const host of hosts) {
    try {
      let authToken: string | undefined;
      if (host.authTokenCipher && isEncryptedSecret(host.authTokenCipher)) {
        authToken = decryptSecret(host.authTokenCipher);
      } else if (host.authTokenCipher) {
        authToken = host.authTokenCipher;
      }

      const client = await createScaleMcpClient({
        url: host.url,
        transport: host.transport === "SSE" ? "sse" : "http",
        authToken,
        clientName: `scalesystems-heal-${host.id.slice(0, 8)}`,
      });
      clients.push(client);

      const mcpTools = await client.tools();
      for (const [name, mcpTool] of Object.entries(mcpTools)) {
        const keyed = `mcp_${host.id.slice(0, 8)}_${name}`;
        tools[keyed] = wrapMcpTool(name, mcpTool as Tool, logger);
        if (!(name in tools)) {
          tools[name] = wrapMcpTool(name, mcpTool as Tool, logger);
        }
      }
    } catch (err) {
      console.warn(
        `[healMcp] skip host ${host.id} (${host.url}):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    clients,
    tools,
    hostsConnected: clients.length,
    toolNames: Object.keys(tools),
    logger,
    workspaceName,
    estateToolsEnabled,
  };
}

export async function closeHealMcpSession(session: HealMcpSession): Promise<void> {
  await Promise.all(
    session.clients.map((c) => c.close().catch(() => undefined))
  );
}
