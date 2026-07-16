export type McpTransportType = "http" | "sse";

export type McpConnectRequest = {
  /** Absolute http(s) MCP host URL (streamable HTTP or SSE). */
  url: string;
  transport?: McpTransportType;
  /** Optional bearer / API key forwarded to the remote MCP host. */
  authToken?: string;
  /** Optional extra headers (never override Host / Authorization when authToken set). */
  headers?: Record<string, string>;
  /** When set, load host credentials from Prisma McpHost by id (Node runtime). */
  hostId?: string;
};

export type McpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpListToolsResponse = {
  success: true;
  transport: McpTransportType;
  url: string;
  toolCount: number;
  tools: McpToolDescriptor[];
};

export type McpErrorResponse = {
  success: false;
  error: string;
  code: string;
};
