import { parse as parseYaml } from "yaml";
import type { OpenApiSpecFormat, ParsedOpenApiMeta } from "@/lib/plugins/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function assertOpenApiShape(doc: unknown): asserts doc is Record<string, unknown> {
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

/**
 * Parse OpenAPI / Swagger JSON or YAML and extract UI metadata.
 * Throws with a human-readable message on malformed input.
 */
export function parseOpenApiSpec(
  raw: string,
  fileName: string | null = null
): ParsedOpenApiMeta {
  const text = raw.trim();
  if (!text) {
    throw new Error("Spec file is empty.");
  }

  const format = detectFormat(fileName, text);
  let doc: unknown;

  try {
    if (format === "json") {
      doc = JSON.parse(text) as unknown;
    } else {
      doc = parseYaml(text) as unknown;
    }
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown parse error";
    throw new Error(
      format === "json"
        ? `Malformed JSON: ${detail}`
        : `Malformed YAML: ${detail}`
    );
  }

  assertOpenApiShape(doc);

  return {
    title: extractTitle(doc),
    defaultBaseUrl: extractDefaultBaseUrl(doc),
    format,
    specText: text,
  };
}

export function isAllowedSpecFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".json") ||
    name.endsWith(".yaml") ||
    name.endsWith(".yml") ||
    file.type === "application/json" ||
    file.type === "application/x-yaml" ||
    file.type === "text/yaml" ||
    file.type === "text/x-yaml"
  );
}

/** Client-only FileReader wrapper (safe when called from browser event handlers). */
export function readFileAsText(file: File): Promise<string> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("File reading is only available in the browser."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file “${file.name}”.`));
    };
    reader.readAsText(file);
  });
}
