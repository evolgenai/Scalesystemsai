import { z } from "zod";
import type { McpTransportKind } from "@prisma/client";
import { encryptSecret } from "@/lib/security/crypto";
import { assertMcpTargetUrl } from "@/lib/security/ssrf";

export const McpTransportSchema = z.enum(["http", "sse"]);

export const CreateMcpHostSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url(),
  transport: McpTransportSchema.optional().default("http"),
  authToken: z.string().min(1).optional(),
  orgId: z.string().cuid().optional().nullable(),
  ownerId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const UpdateMcpHostSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    url: z.string().url().optional(),
    transport: McpTransportSchema.optional(),
    authToken: z.string().min(1).nullable().optional(),
    orgId: z.string().cuid().nullable().optional(),
    ownerId: z.string().cuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required.",
  });

export function toPrismaTransport(
  transport: "http" | "sse"
): McpTransportKind {
  return transport === "sse" ? "SSE" : "HTTP";
}

export function encryptHostAuthToken(
  authToken: string | null | undefined
): string | null | undefined {
  if (authToken === undefined) return undefined;
  if (authToken === null || authToken.trim() === "") return null;
  return encryptSecret(authToken.trim());
}

/** Validate MCP URL with SSRF rules (localhost allowed in development). */
export function validateMcpHostUrl(url: string): URL {
  return assertMcpTargetUrl(url);
}
