import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { assertMcpTargetUrl } from "@/lib/security/ssrf";
import type { McpToolDescriptor, McpTransportType } from "@/lib/mcp/types";

export type CreateScaleMcpClientOptions = {
  url: string;
  transport?: McpTransportType;
  headers?: Record<string, string>;
  authToken?: string;
  clientName?: string;
};

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

/**
 * Initialize a Vercel AI SDK MCP client over streamable HTTP (default) or SSE.
 * Always closes via the returned `close()` — callers must use try/finally.
 */
export async function createScaleMcpClient(
  options: CreateScaleMcpClientOptions
): Promise<MCPClient> {
  const parsed = assertMcpTargetUrl(options.url);
  const transport: McpTransportType = options.transport ?? "http";
  const headers = buildHeaders(options.authToken, options.headers);

  return createMCPClient({
    clientName: options.clientName ?? "scalesystems-mcp-client",
    transport: {
      type: transport,
      url: parsed.toString(),
      headers,
      // Reject redirect rewriting to private hosts (AI SDK default is 'error').
      redirect: "error",
    },
  });
}

/** List tools as serializable descriptors (no AI SDK tool wrappers). */
export async function listMcpToolDescriptors(
  client: MCPClient
): Promise<McpToolDescriptor[]> {
  const listed = await client.listTools();
  const tools = listed.tools ?? [];
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/** Connect → list tools → always close the transport. */
export async function connectAndListMcpTools(
  options: CreateScaleMcpClientOptions
): Promise<{ transport: McpTransportType; url: string; tools: McpToolDescriptor[] }> {
  const transport = options.transport ?? "http";
  const url = assertMcpTargetUrl(options.url).toString();
  let client: MCPClient | undefined;
  try {
    client = await createScaleMcpClient({ ...options, transport, url });
    const tools = await listMcpToolDescriptors(client);
    return { transport, url, tools };
  } finally {
    if (client) {
      await client.close().catch(() => undefined);
    }
  }
}
