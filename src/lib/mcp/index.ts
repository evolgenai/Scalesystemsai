export { createScaleMcpClient, connectAndListMcpTools, listMcpToolDescriptors } from "@/lib/mcp/createClient";
export type { CreateScaleMcpClientOptions } from "@/lib/mcp/createClient";
export {
  issueVaultToken,
  hashAgentKey,
  agentKeyPrefix,
  parseSealedClaims,
  rotationNonce,
} from "@/lib/mcp/tokenVault";
export type {
  VaultTokenClaims,
  IssuedVaultToken,
} from "@/lib/mcp/tokenVault";
export type {
  McpConnectRequest,
  McpToolDescriptor,
  McpListToolsResponse,
  McpErrorResponse,
  McpTransportType,
} from "@/lib/mcp/types";
export {
  mcpJsonError,
  requireVerifiedAgentGate,
  toPublicMcpHost,
} from "@/lib/mcp/http";
export type { McpHostPublic } from "@/lib/mcp/http";
export {
  CreateMcpHostSchema,
  UpdateMcpHostSchema,
  validateMcpHostUrl,
} from "@/lib/mcp/hostSchemas";
