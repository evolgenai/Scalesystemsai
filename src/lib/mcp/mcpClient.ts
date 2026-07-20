/**
 * Scale Systems MCP Client — protocol-compliant wrapper over streamable HTTP / SSE.
 * Ingests community MCP JSON tool schemas and exposes them to the multi-agent SRE loop.
 */

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { Tool } from "ai";
import { z } from "zod";
import {
  createScaleMcpClient,
  listMcpToolDescriptors,
  type CreateScaleMcpClientOptions,
} from "@/lib/mcp/createClient";
import type { McpToolDescriptor, McpTransportType } from "@/lib/mcp/types";
import { assertMcpTargetUrl } from "@/lib/security/ssrf";

export const McpClientConnectSchema = z.object({
  url: z.string().url(),
  transport: z.enum(["http", "sse"]).optional(),
  authToken: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  clientName: z.string().min(1).max(128).optional(),
  /** Runtime-scoped credential id — never a master env key. */
  runtimeTokenId: z.string().min(8).max(128).optional(),
});

export type McpClientConnectInput = z.infer<typeof McpClientConnectSchema>;

export type ScaleMcpSessionState = {
  url: string;
  transport: McpTransportType;
  connected: boolean;
  toolCount: number;
  tools: McpToolDescriptor[];
  clientName: string;
};

export type CallMcpToolResult = {
  ok: boolean;
  toolName: string;
  result?: unknown;
  error?: string;
};

/**
 * Compliant MCP client session for Scale Systems agents.
 * Always pair with `close()` / `Symbol.asyncDispose` so transports do not leak.
 */
export class ScaleMcpClient {
  private client: MCPClient | null = null;
  private descriptors: McpToolDescriptor[] = [];
  private url = "";
  private transport: McpTransportType = "http";
  private clientName = "scalesystems-mcp-client";
  private closed = false;

  get state(): ScaleMcpSessionState {
    return {
      url: this.url,
      transport: this.transport,
      connected: Boolean(this.client) && !this.closed,
      toolCount: this.descriptors.length,
      tools: this.descriptors,
      clientName: this.clientName,
    };
  }

  /** Connect and cache JSON Schema tool descriptors from the remote MCP host. */
  async connect(input: McpClientConnectInput): Promise<ScaleMcpSessionState> {
    if (this.client) {
      throw new Error("MCP client already connected — call close() first.");
    }

    const parsed = McpClientConnectSchema.parse(input);
    const url = assertMcpTargetUrl(parsed.url).toString();
    const transport = parsed.transport ?? "http";
    this.clientName =
      parsed.clientName?.trim() || "scalesystems-mcp-client";

    // authToken is forwarded only over the encrypted transport header; never logged.
    this.client = await createScaleMcpClient({
      url,
      transport,
      authToken: parsed.authToken,
      headers: parsed.headers,
      clientName: this.clientName,
    });

    this.url = url;
    this.transport = transport;
    this.closed = false;
    this.descriptors = await listMcpToolDescriptors(this.client);
    return this.state;
  }

  /** Re-list tools (JSON schemas) without reconnecting. */
  async refreshTools(): Promise<McpToolDescriptor[]> {
    this.assertOpen();
    this.descriptors = await listMcpToolDescriptors(this.client!);
    return this.descriptors;
  }

  listCachedTools(): McpToolDescriptor[] {
    return [...this.descriptors];
  }

  /**
   * Invoke a remote MCP tool by name with JSON-serializable arguments.
   * Returns a structured envelope — never throws transport secrets.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<CallMcpToolResult> {
    this.assertOpen();
    const toolName = name.trim();
    if (!toolName) {
      return { ok: false, toolName: name, error: "Tool name required." };
    }

    try {
      const tools = await this.client!.tools();
      const match = tools[toolName];
      if (!match?.execute) {
        return {
          ok: false,
          toolName,
          error: `MCP tool not found: ${toolName}`,
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await match.execute(args as any, {
        toolCallId: `mcp-${Date.now()}`,
        messages: [],
      } as any);
      return { ok: true, toolName, result };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "MCP tool invocation failed.";
      return { ok: false, toolName, error: message };
    }
  }

  /** AI SDK tool map for the active multi-agent SRE / healer loop. */
  async toolsForSreLoop(): Promise<Record<string, Tool>> {
    this.assertOpen();
    const tools = await this.client!.tools();
    return tools as Record<string, Tool>;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const c = this.client;
    this.client = null;
    this.descriptors = [];
    if (c) {
      await c.close().catch(() => undefined);
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private assertOpen(): void {
    if (!this.client || this.closed) {
      throw new Error("MCP client is not connected.");
    }
  }
}

export type IngestCommunityMcpOptions = CreateScaleMcpClientOptions & {
  /** Prefix applied to tool keys when merging into an SRE tool bag. */
  toolKeyPrefix?: string;
};

/**
 * One-shot ingest: connect → harvest JSON schemas → close.
 * Safe for discovery probes from the SRE control plane.
 */
export async function ingestCommunityMcpSchemas(
  options: IngestCommunityMcpOptions
): Promise<{
  url: string;
  transport: McpTransportType;
  tools: McpToolDescriptor[];
}> {
  const session = new ScaleMcpClient();
  try {
    const state = await session.connect({
      url: options.url,
      transport: options.transport,
      authToken: options.authToken,
      headers: options.headers,
      clientName: options.clientName,
    });
    return {
      url: state.url,
      transport: state.transport,
      tools: state.tools,
    };
  } finally {
    await session.close();
  }
}

/**
 * Open a live MCP session for the SRE loop and return AI SDK tools + descriptors.
 * Caller MUST `await close()` when the healer / remediation loop terminates.
 */
export async function openSreMcpSession(
  options: IngestCommunityMcpOptions
): Promise<{
  session: ScaleMcpClient;
  tools: Record<string, Tool>;
  descriptors: McpToolDescriptor[];
  close: () => Promise<void>;
}> {
  const session = new ScaleMcpClient();
  await session.connect({
    url: options.url,
    transport: options.transport,
    authToken: options.authToken,
    headers: options.headers,
    clientName: options.clientName ?? "scalesystems-sre-mcp",
  });

  const rawTools = await session.toolsForSreLoop();
  const prefix = options.toolKeyPrefix?.trim();
  const tools: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(rawTools)) {
    const key = prefix ? `${prefix}${name}` : name;
    tools[key] = tool;
  }

  return {
    session,
    tools,
    descriptors: session.listCachedTools(),
    close: () => session.close(),
  };
}

/** Low-level escape hatch — prefer ScaleMcpClient for new callers. */
export async function createRawMcpTransport(
  options: CreateScaleMcpClientOptions
): Promise<MCPClient> {
  return createMCPClient({
    clientName: options.clientName ?? "scalesystems-mcp-raw",
    transport: {
      type: options.transport ?? "http",
      url: assertMcpTargetUrl(options.url).toString(),
      headers: options.authToken
        ? {
            ...(options.headers ?? {}),
            Authorization: `Bearer ${options.authToken.trim()}`,
          }
        : options.headers,
      redirect: "error",
    },
  });
}
