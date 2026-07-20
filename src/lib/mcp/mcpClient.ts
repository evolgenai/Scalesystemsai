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
import {
  getMcpSchemaSignatureCache,
  setMcpSchemaSignatureCache,
} from "@/lib/storage/edgeStorage";

const LOG = "[mcpClient]";

export const McpClientConnectSchema = z.object({
  url: z.string().url(),
  transport: z.enum(["http", "sse"]).optional(),
  authToken: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  clientName: z.string().min(1).max(128).optional(),
  /** Runtime-scoped credential id — never a master env key. */
  runtimeTokenId: z.string().min(8).max(128).optional(),
  /** Skip Edge KV schema signature cache (force re-parse). */
  bypassSchemaCache: z.boolean().optional(),
});

export type McpClientConnectInput = z.infer<typeof McpClientConnectSchema>;

export type ScaleMcpSessionState = {
  url: string;
  transport: McpTransportType;
  connected: boolean;
  toolCount: number;
  tools: McpToolDescriptor[];
  clientName: string;
  schemaSignature?: string;
  schemaCacheHit?: boolean;
};

export type CallMcpToolResult = {
  ok: boolean;
  toolName: string;
  result?: unknown;
  error?: string;
};

export type CompactMcpCapabilityDocument = {
  protocolVersion?: string;
  serverName?: string;
  tools: McpToolDescriptor[];
};

export type AggressiveSchemaParseResult =
  | {
      ok: true;
      document: CompactMcpCapabilityDocument;
      signature: string;
      bytesIn: number;
      bytesOut: number;
    }
  | { ok: false; error: string; code: string };

const REDUNDANT_SCHEMA_KEYS = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "examples",
  "default",
  "markdownDescription",
  "x-intellij-html-description",
  "deprecated",
  "readOnly",
  "writeOnly",
  "contentMediaType",
  "contentEncoding",
]);

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function fingerprintUrl(url: string): string {
  // Sync-friendly short key for KV — full SHA used for signature body.
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Recursively strip verbose / non-executable JSON Schema noise.
 * Keeps structural keys required for tool argument validation.
 */
export function stripSchemaRedundancies(value: unknown, depth = 0): unknown {
  if (depth > 24) return undefined;
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const next = value
      .map((item) => stripSchemaRedundancies(item, depth + 1))
      .filter((item) => item !== undefined);
    return next;
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(obj)) {
    if (REDUNDANT_SCHEMA_KEYS.has(key)) continue;
    if (key.startsWith("x-") && key !== "x-enumDescriptions") continue;

    const cleaned = stripSchemaRedundancies(raw, depth + 1);
    if (cleaned === undefined) continue;
    if (
      typeof cleaned === "object" &&
      cleaned !== null &&
      !Array.isArray(cleaned) &&
      Object.keys(cleaned as object).length === 0 &&
      key !== "properties" &&
      key !== "items"
    ) {
      continue;
    }
    out[key] = cleaned;
  }

  return out;
}

function normalizeToolDescriptor(raw: unknown): McpToolDescriptor | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const name =
    typeof row.name === "string"
      ? row.name.trim()
      : typeof row.toolName === "string"
        ? row.toolName.trim()
        : "";
  if (!name || name.length > 128) return null;

  const description =
    typeof row.description === "string"
      ? row.description.trim().slice(0, 2000)
      : undefined;

  const inputSchemaRaw =
    row.inputSchema ?? row.input_schema ?? row.parameters ?? row.schema;

  const inputSchema =
    inputSchemaRaw !== undefined
      ? stripSchemaRedundancies(inputSchemaRaw)
      : undefined;

  return {
    name,
    ...(description ? { description } : {}),
    ...(inputSchema !== undefined ? { inputSchema } : {}),
  };
}

/**
 * Aggressive memory parser for third-party MCP JSON capability schemas.
 * Accepts full documents, `{ tools: [...] }`, or bare tool arrays.
 */
export async function parseAggressiveMcpCapabilitySchema(
  raw: unknown
): Promise<AggressiveSchemaParseResult> {
  const bytesIn =
    typeof raw === "string"
      ? raw.length
      : (() => {
          try {
            return JSON.stringify(raw).length;
          } catch {
            return 0;
          }
        })();

  let candidate: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: "Capability schema is empty.", code: "MCP_SCHEMA_EMPTY" };
    }
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return {
        ok: false,
        error: "Capability schema must be valid JSON.",
        code: "MCP_SCHEMA_JSON",
      };
    }
  }

  let toolsRaw: unknown[] = [];
  let protocolVersion: string | undefined;
  let serverName: string | undefined;

  if (Array.isArray(candidate)) {
    toolsRaw = candidate;
  } else if (candidate && typeof candidate === "object") {
    const doc = candidate as Record<string, unknown>;
    if (typeof doc.protocolVersion === "string") {
      protocolVersion = doc.protocolVersion.trim().slice(0, 32);
    }
    if (typeof doc.serverName === "string") {
      serverName = doc.serverName.trim().slice(0, 120);
    } else if (typeof doc.name === "string" && Array.isArray(doc.tools)) {
      serverName = doc.name.trim().slice(0, 120);
    }

    if (Array.isArray(doc.tools)) {
      toolsRaw = doc.tools;
    } else if (Array.isArray(doc.capabilities)) {
      toolsRaw = doc.capabilities;
    } else if (doc.tools && typeof doc.tools === "object") {
      toolsRaw = Object.entries(doc.tools as Record<string, unknown>).map(
        ([name, body]) =>
          typeof body === "object" && body !== null
            ? { name, ...(body as object) }
            : { name }
      );
    } else {
      return {
        ok: false,
        error: "Capability schema missing tools array.",
        code: "MCP_SCHEMA_NO_TOOLS",
      };
    }
  } else {
    return {
      ok: false,
      error: "Capability schema must be an object or array.",
      code: "MCP_SCHEMA_TYPE",
    };
  }

  const tools: McpToolDescriptor[] = [];
  const seen = new Set<string>();
  for (const item of toolsRaw.slice(0, 128)) {
    const tool = normalizeToolDescriptor(item);
    if (!tool) continue;
    const key = tool.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tools.push(tool);
  }

  if (tools.length === 0) {
    return {
      ok: false,
      error: "No valid tool descriptors after aggressive parse.",
      code: "MCP_SCHEMA_EMPTY_TOOLS",
    };
  }

  const document: CompactMcpCapabilityDocument = {
    ...(protocolVersion ? { protocolVersion } : {}),
    ...(serverName ? { serverName } : {}),
    tools,
  };

  const canonical = JSON.stringify(document);
  const signature = await sha256Hex(canonical);

  return {
    ok: true,
    document,
    signature,
    bytesIn,
    bytesOut: canonical.length,
  };
}

/** Compact remote listTools() payloads and compute a stable signature. */
export async function compactMcpToolDescriptors(
  tools: McpToolDescriptor[]
): Promise<{ tools: McpToolDescriptor[]; signature: string }> {
  const compact: McpToolDescriptor[] = [];
  for (const t of tools.slice(0, 128)) {
    const normalized = normalizeToolDescriptor(t);
    if (normalized) compact.push(normalized);
  }
  compact.sort((a, b) => a.name.localeCompare(b.name));
  const signature = await sha256Hex(JSON.stringify(compact));
  return { tools: compact, signature };
}

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
  private schemaSignature: string | undefined;
  private schemaCacheHit = false;

  get state(): ScaleMcpSessionState {
    return {
      url: this.url,
      transport: this.transport,
      connected: Boolean(this.client) && !this.closed,
      toolCount: this.descriptors.length,
      tools: this.descriptors,
      clientName: this.clientName,
      schemaSignature: this.schemaSignature,
      schemaCacheHit: this.schemaCacheHit,
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

    const urlFp = fingerprintUrl(url);
    if (!parsed.bypassSchemaCache) {
      const cached = await getMcpSchemaSignatureCache(urlFp);
      if (cached?.tools?.length) {
        this.schemaCacheHit = true;
        this.schemaSignature = cached.signature;
        this.descriptors = cached.tools;
        console.info(`${LOG} schema cache hit`, {
          urlFp,
          toolCount: cached.toolCount,
          signature: cached.signature.slice(0, 12),
        });
      }
    }

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

    if (!this.schemaCacheHit) {
      const listed = await listMcpToolDescriptors(this.client);
      const compact = await compactMcpToolDescriptors(listed);
      this.descriptors = compact.tools;
      this.schemaSignature = compact.signature;

      const cached = await setMcpSchemaSignatureCache({
        signature: compact.signature,
        urlFingerprint: urlFp,
        toolCount: compact.tools.length,
        tools: compact.tools,
      });

      console.info(`${LOG} schema parsed + cached`, {
        urlFp,
        toolCount: compact.tools.length,
        signature: compact.signature.slice(0, 12),
        kv: Boolean(cached),
      });
    }

    return this.state;
  }

  /** Re-list tools (JSON schemas) without reconnecting — refreshes KV signature. */
  async refreshTools(): Promise<McpToolDescriptor[]> {
    this.assertOpen();
    const listed = await listMcpToolDescriptors(this.client!);
    const compact = await compactMcpToolDescriptors(listed);
    this.descriptors = compact.tools;
    this.schemaSignature = compact.signature;
    this.schemaCacheHit = false;

    await setMcpSchemaSignatureCache({
      signature: compact.signature,
      urlFingerprint: fingerprintUrl(this.url),
      toolCount: compact.tools.length,
      tools: compact.tools,
    });

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
      console.error(`${LOG} callTool failed`, { toolName, message });
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
    this.schemaSignature = undefined;
    this.schemaCacheHit = false;
    if (c) {
      await c.close().catch((err) => {
        console.error(`${LOG} close failed`, {
          message: err instanceof Error ? err.message : String(err),
        });
      });
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
  bypassSchemaCache?: boolean;
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
  schemaSignature?: string;
  schemaCacheHit?: boolean;
}> {
  const session = new ScaleMcpClient();
  try {
    const state = await session.connect({
      url: options.url,
      transport: options.transport,
      authToken: options.authToken,
      headers: options.headers,
      clientName: options.clientName,
      bypassSchemaCache: options.bypassSchemaCache,
    });
    return {
      url: state.url,
      transport: state.transport,
      tools: state.tools,
      schemaSignature: state.schemaSignature,
      schemaCacheHit: state.schemaCacheHit,
    };
  } finally {
    await session.close();
  }
}

/**
 * Parse a publisher-supplied capability JSON blob, strip noise, cache signature.
 */
export async function ingestAndCacheCapabilityJson(options: {
  rawSchema: unknown;
  cacheKey: string;
  ttlSec?: number;
}): Promise<AggressiveSchemaParseResult & { cached?: boolean }> {
  const parsed = await parseAggressiveMcpCapabilitySchema(options.rawSchema);
  if (!parsed.ok) {
    console.warn(`${LOG} capability parse rejected`, {
      code: parsed.code,
      error: parsed.error,
    });
    return parsed;
  }

  const fp = fingerprintUrl(options.cacheKey.trim() || parsed.signature);
  const cached = await setMcpSchemaSignatureCache({
    signature: parsed.signature,
    urlFingerprint: fp,
    toolCount: parsed.document.tools.length,
    tools: parsed.document.tools,
    ttlSec: options.ttlSec,
  });

  console.info(`${LOG} capability ingested`, {
    tools: parsed.document.tools.length,
    bytesIn: parsed.bytesIn,
    bytesOut: parsed.bytesOut,
    ratio:
      parsed.bytesIn > 0
        ? Number((parsed.bytesOut / parsed.bytesIn).toFixed(3))
        : 0,
    kv: Boolean(cached),
  });

  return { ...parsed, cached: Boolean(cached) };
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
    bypassSchemaCache: options.bypassSchemaCache,
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
