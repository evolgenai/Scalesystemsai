import { getPrisma } from "@/lib/prisma";
import type { SystemTool } from "@/lib/agents/tools/registry";
import {
  compileOpenApiSpec,
  isCompiledPluginSpec,
  type CompiledPluginSpec,
  type ParsedOpenApiOperation,
} from "@/lib/plugins/compileOpenApiSpec";
import { decryptSecret, isEncryptedSecret } from "@/lib/security/crypto";
import { assertPublicHttpUrl } from "@/lib/security/ssrf";

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_CHARS = 24_000;

type PluginRow = {
  id: string;
  name: string;
  spec: unknown;
  baseUrl: string;
  authType: string;
  authHeader: string;
  authToken: string | null;
};

function sanitizeToolSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function buildToolName(
  pluginName: string,
  operation: ParsedOpenApiOperation
): string {
  const plugin = sanitizeToolSegment(pluginName) || "plugin";
  if (operation.operationId) {
    const op = sanitizeToolSegment(operation.operationId);
    if (op) return `${plugin}_${op}`;
  }
  const pathSeg = sanitizeToolSegment(
    operation.path.replace(/[{}]/g, "").replace(/^\//, "")
  );
  return `${plugin}_${operation.method}_${pathSeg || "root"}`;
}

function buildToolDescription(
  pluginName: string,
  operation: ParsedOpenApiOperation
): string {
  const summary =
    operation.summary ||
    operation.description ||
    `${operation.method.toUpperCase()} ${operation.path}`;
  const paramHints =
    operation.parameters.length > 0
      ? ` Parameters: ${operation.parameters
          .map((p) => `${p.name}(${p.in}${p.required ? "*" : ""})`)
          .join(", ")}.`
      : "";
  const bodyHint = operation.requestBodySchema
    ? " Accepts JSON `body` for the request payload."
    : "";
  return `[${pluginName}] ${summary}.${paramHints}${bodyHint}`;
}

function resolvePathTemplate(
  pathTemplate: string,
  params: Record<string, unknown>
): string {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing required path parameter "${name}".`);
    }
    return encodeURIComponent(String(value));
  });
}

function asStringRecord(
  value: unknown
): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined || entry === null) continue;
    out[key] = String(entry);
  }
  return out;
}

/**
 * Decrypt auth material in-memory only. Never log the result.
 */
function resolveAuthHeader(
  plugin: PluginRow
): Record<string, string> {
  if (plugin.authType === "none" || !plugin.authToken) {
    return {};
  }

  let secret: string;
  try {
    secret = isEncryptedSecret(plugin.authToken)
      ? decryptSecret(plugin.authToken)
      : plugin.authToken;
  } catch {
    throw new Error(
      "Unable to decrypt plugin credentials — check PLUGINS_ENCRYPTION_KEY."
    );
  }

  const headerName = plugin.authHeader.trim() || "Authorization";

  if (plugin.authType === "bearer") {
    const value = secret.toLowerCase().startsWith("bearer ")
      ? secret
      : `Bearer ${secret}`;
    return { [headerName]: value };
  }

  // apiKey — header injection (query keys can be passed via params if needed)
  return { [headerName]: secret };
}

async function executeOpenApiCall(
  plugin: PluginRow,
  operation: ParsedOpenApiOperation,
  params: Record<string, unknown>
): Promise<string> {
  let destination: URL;
  try {
    const base = assertPublicHttpUrl(plugin.baseUrl);
    const path = resolvePathTemplate(operation.path, params);
    destination = new URL(path.replace(/^\//, ""), `${base.toString().replace(/\/$/, "")}/`);
    // Re-validate after template expansion (blocks path trickery toward private hosts).
    assertPublicHttpUrl(destination.toString());
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Destination URL failed SSRF validation.",
      tool: buildToolName(plugin.name, operation),
    });
  }

  const query =
    asStringRecord(params.query) ??
    asStringRecord(params.queryParams) ??
    {};
  for (const param of operation.parameters) {
    if (param.in !== "query") continue;
    const value = params[param.name];
    if (value === undefined || value === null) {
      if (param.required) {
        return JSON.stringify({
          ok: false,
          error: `Missing required query parameter "${param.name}".`,
        });
      }
      continue;
    }
    query[param.name] = String(value);
  }
  for (const [key, value] of Object.entries(query)) {
    destination.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "ScaleSystems-DynamicPlugin/1.0",
  };

  try {
    Object.assign(headers, resolveAuthHeader(plugin));
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Plugin credential resolution failed.",
    });
  }

  const extraHeaders = asStringRecord(params.headers);
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      // Never allow callers to override Authorization after injection.
      if (key.toLowerCase() === "authorization") continue;
      headers[key] = value;
    }
  }

  const method = operation.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const bodyValue =
    params.body ?? params.requestBody ?? params.payload ?? undefined;

  if (hasBody && bodyValue !== undefined) {
    headers["Content-Type"] =
      headers["Content-Type"] ?? "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DEFAULT_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(destination.toString(), {
      method,
      headers,
      body:
        hasBody && bodyValue !== undefined
          ? typeof bodyValue === "string"
            ? bodyValue
            : JSON.stringify(bodyValue)
          : undefined,
      signal: controller.signal,
      redirect: "manual",
    });

    const text = await response.text();
    const clipped =
      text.length > MAX_RESPONSE_CHARS
        ? `${text.slice(0, MAX_RESPONSE_CHARS)}…`
        : text;

    let parsed: unknown = clipped;
    try {
      parsed = JSON.parse(clipped) as unknown;
    } catch {
      // Keep raw text when not JSON.
    }

    return JSON.stringify(
      {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: destination.origin + destination.pathname,
        body: parsed,
      },
      null,
      2
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS}ms.`
          : error.message
        : "Unknown transport error.";
    return JSON.stringify({
      ok: false,
      status: 0,
      error: message,
      url: destination.origin + destination.pathname,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function ensureCompiledSpec(spec: unknown): CompiledPluginSpec {
  if (isCompiledPluginSpec(spec)) return spec;
  // Legacy / raw OpenAPI document stored as JSON — recompile on the fly.
  if (spec && typeof spec === "object") {
    return compileOpenApiSpec(spec as Record<string, unknown>);
  }
  throw new Error("Plugin spec is not a compiled OpenAPI operations document.");
}

function compilePluginTools(plugin: PluginRow): SystemTool[] {
  let compiled: CompiledPluginSpec;
  try {
    compiled = ensureCompiledSpec(plugin.spec);
  } catch (error) {
    console.warn(
      `[dynamicOpenApiTool] Skipping plugin "${plugin.name}" — invalid spec:`,
      error instanceof Error ? error.message : "unknown"
    );
    return [];
  }

  const tools: SystemTool[] = [];
  const usedNames = new Set<string>();

  for (const operation of compiled.operations) {
    let name = buildToolName(plugin.name, operation);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${buildToolName(plugin.name, operation)}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(name);

    // Capture plugin fields by value so decrypted tokens are never stored on the tool object.
    const pluginSnapshot: PluginRow = {
      id: plugin.id,
      name: plugin.name,
      spec: plugin.spec,
      baseUrl: plugin.baseUrl,
      authType: plugin.authType,
      authHeader: plugin.authHeader,
      authToken: plugin.authToken,
    };
    const opSnapshot = operation;

    tools.push({
      name,
      description: buildToolDescription(plugin.name, operation),
      execute: async (params: Record<string, unknown>) => {
        try {
          return await executeOpenApiCall(pluginSnapshot, opSnapshot, params);
        } catch (error) {
          // Soft-fail — never crash the swarm on third-party errors.
          return JSON.stringify({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Dynamic OpenAPI tool execution failed.",
            tool: name,
          });
        }
      },
    });
  }

  return tools;
}

/**
 * Fetch active WorkspacePlugin rows for the swarm's organization scope
 * and compile each OpenAPI operation into an executable SystemTool.
 */
export async function compileWorkspaceOpenApiTools(
  workspaceId: string | null
): Promise<SystemTool[]> {
  try {
    const prisma = getPrisma();
    const plugins = await prisma.workspacePlugin.findMany({
      where: workspaceId
        ? { workspaceId, isActive: true }
        : { workspaceId: null, isActive: true },
      select: {
        id: true,
        name: true,
        spec: true,
        baseUrl: true,
        authType: true,
        authHeader: true,
        authToken: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const tools: SystemTool[] = [];
    for (const plugin of plugins) {
      tools.push(...compilePluginTools(plugin));
    }
    return tools;
  } catch (error) {
    // Soft-fail when DB is unavailable — swarm continues with built-in tools.
    console.warn(
      "[dynamicOpenApiTool] Unable to load workspace plugins:",
      error instanceof Error ? error.message : "unknown"
    );
    return [];
  }
}
