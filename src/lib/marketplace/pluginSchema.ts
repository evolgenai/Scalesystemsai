import { z } from "zod";

/** Strict MCP tool descriptor accepted from third-party publishers. */
export const McpToolDescriptorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/i, "Tool name must be alphanumeric/underscore."),
  description: z.string().trim().min(1).max(2000),
  inputSchema: z
    .object({
      type: z.literal("object").optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
      required: z.array(z.string()).max(64).optional(),
    })
    .passthrough()
    .optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
});

export const McpSchemaDocumentSchema = z.object({
  protocolVersion: z.string().trim().min(1).max(32).optional(),
  serverName: z.string().trim().min(1).max(120).optional(),
  tools: z.array(McpToolDescriptorSchema).min(1).max(64),
  resources: z
    .array(
      z.object({
        uri: z.string().trim().min(1).max(512),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(1000).optional(),
      })
    )
    .max(64)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type McpSchemaDocument = z.infer<typeof McpSchemaDocumentSchema>;
export type McpToolDescriptor = z.infer<typeof McpToolDescriptorSchema>;

export type McpSchemaParseResult =
  | { ok: true; document: McpSchemaDocument; serialized: string }
  | { ok: false; error: string };

/**
 * Validate third-party MCP tool schema (object or JSON string).
 */
export function parseAndValidateMcpSchema(
  raw: unknown
): McpSchemaParseResult {
  let candidate: unknown = raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: "mcpSchema is empty." };
    }
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return { ok: false, error: "mcpSchema must be valid JSON." };
    }
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, error: "mcpSchema must be a JSON object." };
  }

  const parsed = McpSchemaDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid mcpSchema.",
    };
  }

  return {
    ok: true,
    document: parsed.data,
    serialized: JSON.stringify(parsed.data),
  };
}

export const PublishPluginBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  developerId: z.string().trim().min(2).max(128),
  walletId: z
    .string()
    .trim()
    .min(4)
    .max(256)
    .regex(
      /^[a-zA-Z0-9:_-]+$/,
      "walletId must be alphanumeric with : _ - only."
    ),
  pricePerRun: z.number().min(0).max(100).default(0.001),
  version: z
    .string()
    .trim()
    .max(32)
    .regex(/^\d+\.\d+(\.\d+)?$/, "version must be semver-like (e.g. 1.0.0)")
    .default("1.0.0"),
  description: z.string().trim().max(2000).optional(),
  mcpSchema: z.unknown(),
  workspaceId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export type PublishPluginBody = z.infer<typeof PublishPluginBodySchema>;
