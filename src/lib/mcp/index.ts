export { createScaleMcpClient, connectAndListMcpTools, listMcpToolDescriptors } from "@/lib/mcp/createClient";
export type { CreateScaleMcpClientOptions } from "@/lib/mcp/createClient";
export {
  ScaleMcpClient,
  ingestCommunityMcpSchemas,
  openSreMcpSession,
  parseAggressiveMcpCapabilitySchema,
  stripSchemaRedundancies,
  compactMcpToolDescriptors,
  ingestAndCacheCapabilityJson,
  McpClientConnectSchema,
} from "@/lib/mcp/mcpClient";
export type {
  McpClientConnectInput,
  ScaleMcpSessionState,
  CallMcpToolResult,
  IngestCommunityMcpOptions,
  CompactMcpCapabilityDocument,
  AggressiveSchemaParseResult,
} from "@/lib/mcp/mcpClient";
export {
  McpClientHost,
  withMcpClientHost,
  discoverMcpHostTools,
  McpHostConnectSchema,
} from "@/lib/mcp/mcpClientHost";
export type {
  McpHostConnectInput,
  McpHostTool,
  McpHostCallResult,
  McpHostSessionState,
} from "@/lib/mcp/mcpClientHost";
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
