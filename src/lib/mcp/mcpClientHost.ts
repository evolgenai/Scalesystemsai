/**
 * Native MCP client host — `@modelcontextprotocol/sdk` JSON-RPC 2.0 client
 * for discovering and invoking remote tools (GitHub, databases, web, etc.).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { assertMcpTargetUrl } from "@/lib/security/ssrf";
import type { McpToolDescriptor, McpTransportType } from "@/lib/mcp/types";

export const McpHostConnectSchema = z.object({
  url: z.string().url(),
  transport: z.enum(["http", "sse"]).optional(),
  authToken: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  clientName: z.string().min(1).max(128).optional(),
  clientVersion: z.string().min(1).max(32).optional(),
});

export type McpHostConnectInput = z.infer<typeof McpHostConnectSchema>;

export type McpHostTool = McpToolDescriptor & {
  inputSchema?: unknown;
};

export type McpHostCallResult = {
  ok: boolean;
  toolName: string;
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
  error?: string;
  /** Raw JSON-RPC style envelope for debugging (no secrets). */
  rpc?: {
    jsonrpc: "2.0";
    method: "tools/call";
    result?: unknown;
    error?: { message: string };
  };
};

export type McpHostSessionState = {
  url: string;
  transport: McpTransportType;
  connected: boolean;
  serverName?: string;
  serverVersion?: string;
  toolCount: number;
  tools: McpHostTool[];
  clientName: string;
};

type ConnectedTransport =
  | StreamableHTTPClientTransport
  | SSEClientTransport;

function buildHeaders(
  authToken: string | undefined,
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  const next: Record<string, string> = { ...(headers ?? {}) };
  if (authToken?.trim()) {
    next.Authorization = `Bearer ${authToken.trim()}`;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function toHostTool(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
}): McpHostTool {
  return {
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.inputSchema !== undefined
      ? { inputSchema: tool.inputSchema }
      : {}),
  };
}

/**
 * Internal MCP host client — connect, listTools, callTool over JSON-RPC 2.0.
 * Prefer Streamable HTTP; fall back to legacy SSE when needed.
 */
export class McpClientHost {
  private client: Client | null = null;
  private transport: ConnectedTransport | null = null;
  private tools: McpHostTool[] = [];
  private url = "";
  private transportKind: McpTransportType = "http";
  private clientName = "scalesystems-mcp-host";
  private serverName?: string;
  private serverVersion?: string;
  private closed = false;

  get state(): McpHostSessionState {
    return {
      url: this.url,
      transport: this.transportKind,
      connected: Boolean(this.client) && !this.closed,
      serverName: this.serverName,
      serverVersion: this.serverVersion,
      toolCount: this.tools.length,
      tools: this.tools,
      clientName: this.clientName,
    };
  }

  async connect(input: McpHostConnectInput): Promise<McpHostSessionState> {
    if (this.client) {
      throw new Error("MCP host already connected — call close() first.");
    }

    const parsed = McpHostConnectSchema.parse(input);
    const url = assertMcpTargetUrl(parsed.url).toString();
    this.clientName = parsed.clientName?.trim() || "scalesystems-mcp-host";
    const version = parsed.clientVersion?.trim() || "1.0.0";
    const headers = buildHeaders(parsed.authToken, parsed.headers);
    const preferSse = parsed.transport === "sse";

    const attempt = async (
      kind: McpTransportType
    ): Promise<{ client: Client; transport: ConnectedTransport }> => {
      const client = new Client({
        name: this.clientName,
        version,
      });
      const target = new URL(url);
      const transport =
        kind === "sse"
          ? new SSEClientTransport(target, {
              requestInit: headers ? { headers } : undefined,
            })
          : new StreamableHTTPClientTransport(target, {
              requestInit: headers ? { headers } : undefined,
            });
      await client.connect(transport);
      return { client, transport };
    };

    let connected: { client: Client; transport: ConnectedTransport };
    if (preferSse) {
      connected = await attempt("sse");
      this.transportKind = "sse";
    } else {
      try {
        connected = await attempt("http");
        this.transportKind = "http";
      } catch {
        connected = await attempt("sse");
        this.transportKind = "sse";
      }
    }

    this.client = connected.client;
    this.transport = connected.transport;
    this.url = url;
    this.closed = false;

    const info = this.client.getServerVersion?.();
    if (info && typeof info === "object") {
      const row = info as { name?: string; version?: string };
      this.serverName = row.name;
      this.serverVersion = row.version;
    }

    await this.refreshTools();
    return this.state;
  }

  /** Discover remote tools via JSON-RPC `tools/list`. */
  async refreshTools(): Promise<McpHostTool[]> {
    this.assertOpen();
    const listed = await this.client!.listTools();
    this.tools = (listed.tools ?? []).map((t) =>
      toHostTool({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })
    );
    return this.tools;
  }

  listTools(): McpHostTool[] {
    return [...this.tools];
  }

  /**
   * Invoke a remote tool via JSON-RPC `tools/call`.
   * Arguments must be JSON-serializable.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<McpHostCallResult> {
    this.assertOpen();
    const toolName = name.trim();
    if (!toolName) {
      return { ok: false, toolName: name, error: "Tool name required." };
    }

    try {
      const result = await this.client!.callTool({
        name: toolName,
        arguments: args,
      });

      const isError = Boolean(
        result &&
          typeof result === "object" &&
          "isError" in result &&
          (result as { isError?: boolean }).isError
      );

      return {
        ok: !isError,
        toolName,
        content: (result as { content?: unknown }).content,
        structuredContent: (result as { structuredContent?: unknown })
          .structuredContent,
        isError,
        rpc: {
          jsonrpc: "2.0",
          method: "tools/call",
          result,
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "MCP tools/call failed.";
      return {
        ok: false,
        toolName,
        error: message,
        rpc: {
          jsonrpc: "2.0",
          method: "tools/call",
          error: { message },
        },
      };
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    this.tools = [];

    if (client) {
      await client.close().catch(() => undefined);
    }
    if (transport && "close" in transport && typeof transport.close === "function") {
      await transport.close().catch(() => undefined);
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private assertOpen(): void {
    if (!this.client || this.closed) {
      throw new Error("MCP client host is not connected.");
    }
  }
}

/**
 * One-shot: connect → discover tools → optionally invoke → close.
 */
export async function withMcpClientHost<T>(
  input: McpHostConnectInput,
  fn: (host: McpClientHost) => Promise<T>
): Promise<T> {
  const host = new McpClientHost();
  try {
    await host.connect(input);
    return await fn(host);
  } finally {
    await host.close();
  }
}

/** Discover tools from a remote MCP endpoint without keeping a session open. */
export async function discoverMcpHostTools(
  input: McpHostConnectInput
): Promise<{
  url: string;
  transport: McpTransportType;
  tools: McpHostTool[];
  serverName?: string;
}> {
  return withMcpClientHost(input, async (host) => {
    const state = host.state;
    return {
      url: state.url,
      transport: state.transport,
      tools: state.tools,
      serverName: state.serverName,
    };
  });
}
