import { parse as parseYaml } from "yaml";
import type { OpenApiSpecFormat } from "@/lib/plugins/types";

export type ParsedOpenApiParameter = {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required: boolean;
  description: string | null;
  schema: unknown;
};

export type ParsedOpenApiOperation = {
  operationId: string | null;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  parameters: ParsedOpenApiParameter[];
  /** Compact request body schema (application/json preferred). */
  requestBodySchema: unknown | null;
};

/** Compact document persisted on WorkspacePlugin.spec */
export type CompiledPluginSpec = {
  openapi: string | null;
  swagger: string | null;
  title: string | null;
  defaultBaseUrl: string | null;
  format: OpenApiSpecFormat;
  operations: ParsedOpenApiOperation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectFormat(
  fileName: string | null,
  raw: string
): OpenApiSpecFormat {
  const lower = (fileName ?? "").toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".json")) return "json";
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "yaml";
}

function parseDocument(raw: string, format: OpenApiSpecFormat): unknown {
  if (format === "json") {
    return JSON.parse(raw) as unknown;
  }
  return parseYaml(raw) as unknown;
}

function assertOpenApiShape(
  doc: unknown
): asserts doc is Record<string, unknown> {
  if (!isRecord(doc)) {
    throw new Error("OpenAPI document must be a JSON object or YAML mapping.");
  }
  const openapi = doc.openapi;
  const swagger = doc.swagger;
  const hasOpenApi =
    typeof openapi === "string" && openapi.trim().startsWith("3");
  const hasSwagger =
    typeof swagger === "string" &&
    (swagger.trim() === "2.0" || swagger.trim().startsWith("2."));
  if (!hasOpenApi && !hasSwagger) {
    throw new Error(
      "Unrecognized format — expected OpenAPI 3.x (`openapi`) or Swagger 2.0 (`swagger`)."
    );
  }
}

function extractTitle(doc: Record<string, unknown>): string | null {
  const info = doc.info;
  if (!isRecord(info)) return null;
  const title = info.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function extractDefaultBaseUrl(doc: Record<string, unknown>): string | null {
  const servers = doc.servers;
  if (!Array.isArray(servers) || servers.length === 0) return null;
  const first = servers[0];
  if (!isRecord(first)) return null;
  const url = first.url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function normalizeParamIn(
  value: unknown
): ParsedOpenApiParameter["in"] | null {
  if (value === "query" || value === "header" || value === "path" || value === "cookie") {
    return value;
  }
  return null;
}

function collectParameters(
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>
): ParsedOpenApiParameter[] {
  const raw = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ];

  const out: ParsedOpenApiParameter[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === "string" ? entry.name : null;
    const location = normalizeParamIn(entry.in);
    if (!name || !location) continue;
    out.push({
      name,
      in: location,
      required: entry.required === true || location === "path",
      description:
        typeof entry.description === "string" ? entry.description : null,
      schema: entry.schema ?? null,
    });
  }
  return out;
}

function extractRequestBodySchema(
  operation: Record<string, unknown>
): unknown | null {
  const body = operation.requestBody;
  if (!isRecord(body)) return null;
  const content = body.content;
  if (!isRecord(content)) return null;

  const preferred =
    content["application/json"] ??
    content["application/x-www-form-urlencoded"] ??
    Object.values(content)[0];

  if (!isRecord(preferred)) return null;
  return preferred.schema ?? null;
}

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

function extractOperations(
  doc: Record<string, unknown>
): ParsedOpenApiOperation[] {
  const paths = doc.paths;
  if (!isRecord(paths)) return [];

  const operations: ParsedOpenApiOperation[] = [];

  for (const [path, pathValue] of Object.entries(paths)) {
    if (!isRecord(pathValue)) continue;
    for (const [method, operationValue] of Object.entries(pathValue)) {
      const normalizedMethod = method.toLowerCase();
      if (!HTTP_METHODS.has(normalizedMethod)) continue;
      if (!isRecord(operationValue)) continue;

      operations.push({
        operationId:
          typeof operationValue.operationId === "string"
            ? operationValue.operationId.trim() || null
            : null,
        method: normalizedMethod,
        path,
        summary:
          typeof operationValue.summary === "string"
            ? operationValue.summary.trim() || null
            : null,
        description:
          typeof operationValue.description === "string"
            ? operationValue.description.trim() || null
            : null,
        parameters: collectParameters(pathValue, operationValue),
        requestBodySchema: extractRequestBodySchema(operationValue),
      });
    }
  }

  return operations;
}

/**
 * Parse OpenAPI/Swagger JSON or YAML into a compact, tool-ready spec.
 */
export function compileOpenApiSpec(
  rawInput: string | Record<string, unknown>,
  fileName: string | null = null
): CompiledPluginSpec {
  let doc: unknown;
  let format: OpenApiSpecFormat = "json";

  if (typeof rawInput === "string") {
    const text = rawInput.trim();
    if (!text) throw new Error("Spec file is empty.");
    format = detectFormat(fileName, text);
    try {
      doc = parseDocument(text, format);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "unknown parse error";
      throw new Error(
        format === "json"
          ? `Malformed JSON: ${detail}`
          : `Malformed YAML: ${detail}`
      );
    }
  } else if (isRecord(rawInput)) {
    doc = rawInput;
    format = "json";
  } else {
    throw new Error("OpenAPI document must be a string or object.");
  }

  assertOpenApiShape(doc);

  const operations = extractOperations(doc);
  if (operations.length === 0) {
    throw new Error(
      "No HTTP operations found — expected at least one path/method under `paths`."
    );
  }

  return {
    openapi: typeof doc.openapi === "string" ? doc.openapi : null,
    swagger: typeof doc.swagger === "string" ? doc.swagger : null,
    title: extractTitle(doc),
    defaultBaseUrl: extractDefaultBaseUrl(doc),
    format,
    operations,
  };
}

export function isCompiledPluginSpec(
  value: unknown
): value is CompiledPluginSpec {
  return (
    isRecord(value) &&
    Array.isArray(value.operations) &&
    value.operations.every(
      (op) =>
        isRecord(op) &&
        typeof op.method === "string" &&
        typeof op.path === "string"
    )
  );
}
