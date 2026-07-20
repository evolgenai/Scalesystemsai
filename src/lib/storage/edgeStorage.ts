/**
 * Edge-compatible KV scratchpad + Blob asset pipeline.
 * Runtime: Edge (`@vercel/kv` / `@vercel/blob` — Web APIs only).
 */

import { kv } from "@vercel/kv";
import { put, del, type PutBlobResult } from "@vercel/blob";

const SCRATCH_PREFIX = "agent:scratch:";
const DEFAULT_SCRATCH_TTL_SEC = 60 * 15; // 15m thinking-loop window
const MAX_SCRATCH_BYTES = 96_000;

export type ScratchpadEntry = {
  agentId: string;
  sessionId: string;
  fragments: string[];
  meta?: Record<string, string | number | boolean>;
  updatedAt: string;
  ttlSec: number;
};

export type BlobUploadInput = {
  /** Agent / workspace namespace for the object key. */
  namespace: string;
  filename: string;
  body: string | Blob | ArrayBuffer | ReadableStream | File;
  contentType?: string;
  /** Public read vs private (default private → signed URL). */
  access?: "public" | "private";
  /** Signed URL lifetime in seconds (private blobs). */
  downloadExpiresSec?: number;
};

export type BlobAssetResult = {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  size?: number;
  uploadedAt: string;
};

function scratchKey(agentId: string, sessionId: string): string {
  return `${SCRATCH_PREFIX}${agentId}:${sessionId}`;
}

const SCHEMA_SIG_PREFIX = "mcp:schema:sig:";
const RUNTIME_TOKEN_PREFIX = "runtime:ss_rt:";
const RUNTIME_INDEX_KEY = "runtime:ss_rt:index";
const DEFAULT_SCHEMA_TTL_SEC = 60 * 60 * 6; // 6h reasoning-loop reuse window

export type McpSchemaSignatureCache = {
  signature: string;
  urlFingerprint: string;
  toolCount: number;
  /** Compact validated descriptors — redundancies already stripped. */
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  cachedAt: string;
  ttlSec: number;
};

export type RuntimeTokenKvRecord = {
  tokenId: string;
  tokenPrefix: string;
  loopId: string;
  expiresAt: number;
  singleUse: boolean;
  status: "active" | "consumed" | "revoked" | "expired";
};

function schemaSigKey(urlFingerprint: string): string {
  return `${SCHEMA_SIG_PREFIX}${urlFingerprint}`;
}

function runtimeTokenKey(tokenId: string): string {
  return `${RUNTIME_TOKEN_PREFIX}${tokenId}`;
}

export function isEdgeKvConfigured(): boolean {
  return kvConfigured();
}

function kvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() &&
      process.env.KV_REST_API_TOKEN?.trim()
  );
}

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._/-]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 128);
}

/**
 * Read short-term agent scratchpad from global Redis (KV).
 * Misses return null — callers fall through to PostgreSQL memory bank.
 */
export async function getScratchpad(
  agentId: string,
  sessionId: string
): Promise<ScratchpadEntry | null> {
  if (!agentId?.trim() || !sessionId?.trim()) return null;
  if (!kvConfigured()) return null;

  try {
    const raw = await kv.get<ScratchpadEntry>(
      scratchKey(agentId.trim(), sessionId.trim())
    );
    return raw ?? null;
  } catch {
    return null;
  }
}

/**
 * Upsert active thinking-loop memory into KV with TTL.
 * Truncates oversized fragment payloads to stay under Redis value limits.
 */
export async function setScratchpad(
  entry: Omit<ScratchpadEntry, "updatedAt" | "ttlSec"> & {
    ttlSec?: number;
  }
): Promise<ScratchpadEntry | null> {
  if (!kvConfigured()) return null;

  const ttlSec = Math.max(
    30,
    Math.min(entry.ttlSec ?? DEFAULT_SCRATCH_TTL_SEC, 60 * 60 * 6)
  );

  let fragments = [...(entry.fragments ?? [])].slice(-48);
  let serialized = JSON.stringify(fragments);
  while (serialized.length > MAX_SCRATCH_BYTES && fragments.length > 1) {
    fragments = fragments.slice(1);
    serialized = JSON.stringify(fragments);
  }

  const payload: ScratchpadEntry = {
    agentId: entry.agentId.trim(),
    sessionId: entry.sessionId.trim(),
    fragments,
    meta: entry.meta,
    updatedAt: new Date().toISOString(),
    ttlSec,
  };

  try {
    await kv.set(scratchKey(payload.agentId, payload.sessionId), payload, {
      ex: ttlSec,
    });
    return payload;
  } catch {
    return null;
  }
}

/** Append one fragment and refresh TTL (hot path during agent loops). */
export async function appendScratchFragment(
  agentId: string,
  sessionId: string,
  fragment: string,
  ttlSec = DEFAULT_SCRATCH_TTL_SEC
): Promise<ScratchpadEntry | null> {
  const existing = await getScratchpad(agentId, sessionId);
  const fragments = [...(existing?.fragments ?? []), fragment.trim()].filter(
    Boolean
  );
  return setScratchpad({
    agentId,
    sessionId,
    fragments,
    meta: existing?.meta,
    ttlSec,
  });
}

export async function clearScratchpad(
  agentId: string,
  sessionId: string
): Promise<boolean> {
  if (!kvConfigured()) return false;
  try {
    await kv.del(scratchKey(agentId.trim(), sessionId.trim()));
    return true;
  } catch {
    return false;
  }
}

/** Read cached MCP capability schema signature (miss → re-parse upstream). */
export async function getMcpSchemaSignatureCache(
  urlFingerprint: string
): Promise<McpSchemaSignatureCache | null> {
  if (!kvConfigured() || !urlFingerprint.trim()) return null;
  try {
    return (
      (await kv.get<McpSchemaSignatureCache>(
        schemaSigKey(urlFingerprint.trim())
      )) ?? null
    );
  } catch (err) {
    console.error("[edgeStorage] getMcpSchemaSignatureCache failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Persist validated/compact MCP schema signature for high-frequency loops. */
export async function setMcpSchemaSignatureCache(
  entry: Omit<McpSchemaSignatureCache, "cachedAt" | "ttlSec"> & {
    ttlSec?: number;
  }
): Promise<McpSchemaSignatureCache | null> {
  if (!kvConfigured()) return null;
  const ttlSec = Math.max(
    60,
    Math.min(entry.ttlSec ?? DEFAULT_SCHEMA_TTL_SEC, 60 * 60 * 24)
  );
  const payload: McpSchemaSignatureCache = {
    signature: entry.signature,
    urlFingerprint: entry.urlFingerprint,
    toolCount: entry.toolCount,
    tools: entry.tools.slice(0, 128),
    cachedAt: new Date().toISOString(),
    ttlSec,
  };
  try {
    await kv.set(schemaSigKey(payload.urlFingerprint), payload, { ex: ttlSec });
    return payload;
  } catch (err) {
    console.error("[edgeStorage] setMcpSchemaSignatureCache failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Mirror runtime credential metadata into KV (never stores raw `ss_rt_…`). */
export async function putRuntimeTokenMirror(
  record: RuntimeTokenKvRecord,
  ttlSec: number
): Promise<boolean> {
  if (!kvConfigured()) return false;
  const ex = Math.max(30, Math.min(ttlSec, 3600));
  try {
    await kv.set(runtimeTokenKey(record.tokenId), record, { ex });
    await kv.sadd(RUNTIME_INDEX_KEY, record.tokenId);
    return true;
  } catch (err) {
    console.error("[edgeStorage] putRuntimeTokenMirror failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function patchRuntimeTokenMirror(
  tokenId: string,
  patch: Partial<Pick<RuntimeTokenKvRecord, "status">>
): Promise<boolean> {
  if (!kvConfigured() || !tokenId.trim()) return false;
  try {
    const key = runtimeTokenKey(tokenId.trim());
    const existing = await kv.get<RuntimeTokenKvRecord>(key);
    if (!existing) return false;
    const next = { ...existing, ...patch };
    const ttl = Math.max(1, next.expiresAt - Math.floor(Date.now() / 1000));
    await kv.set(key, next, { ex: Math.min(ttl, 3600) });
    return true;
  } catch (err) {
    console.error("[edgeStorage] patchRuntimeTokenMirror failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function deleteRuntimeTokenMirror(tokenId: string): Promise<boolean> {
  if (!kvConfigured() || !tokenId.trim()) return false;
  try {
    await kv.del(runtimeTokenKey(tokenId.trim()));
    await kv.srem(RUNTIME_INDEX_KEY, tokenId.trim());
    return true;
  } catch (err) {
    console.error("[edgeStorage] deleteRuntimeTokenMirror failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Purge expired / terminal runtime token mirrors from Edge KV.
 * Does not touch PostgreSQL or any persistent application tables.
 */
export async function purgeExpiredRuntimeTokenMirrors(options?: {
  nowSec?: number;
  dryRun?: boolean;
}): Promise<{
  scanned: number;
  purged: number;
  dryRun: boolean;
  tokenIds: string[];
}> {
  const dryRun = Boolean(options?.dryRun);
  const now = options?.nowSec ?? Math.floor(Date.now() / 1000);
  const empty = { scanned: 0, purged: 0, dryRun, tokenIds: [] as string[] };
  if (!kvConfigured()) return empty;

  try {
    const ids = (await kv.smembers(RUNTIME_INDEX_KEY)) as string[];
    if (!Array.isArray(ids) || ids.length === 0) return empty;

    const tokenIds: string[] = [];
    let purged = 0;

    for (const id of ids) {
      if (typeof id !== "string" || !id) continue;
      const row = await kv.get<RuntimeTokenKvRecord>(runtimeTokenKey(id));
      if (!row) {
        if (!dryRun) await kv.srem(RUNTIME_INDEX_KEY, id);
        purged += 1;
        tokenIds.push(id);
        continue;
      }

      const expired = row.expiresAt <= now;
      const terminal =
        row.status === "expired" ||
        row.status === "consumed" ||
        row.status === "revoked";

      if (!expired && !terminal) continue;

      tokenIds.push(id);
      purged += 1;
      if (!dryRun) {
        await kv.del(runtimeTokenKey(id));
        await kv.srem(RUNTIME_INDEX_KEY, id);
      }
    }

    return { scanned: ids.length, purged, dryRun, tokenIds };
  } catch (err) {
    console.error("[edgeStorage] purgeExpiredRuntimeTokenMirrors failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

/**
 * Upload agent-generated scripts / binary assets to Vercel Blob.
 * Returns an immediate download URL (public or token-signed private).
 */
export async function uploadAgentAsset(
  input: BlobUploadInput
): Promise<BlobAssetResult> {
  if (!blobConfigured()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured — cannot upload agent assets."
    );
  }

  const ns = sanitizePathSegment(input.namespace || "agents");
  const name = sanitizePathSegment(input.filename || "artifact.bin");
  const pathname = `agent-assets/${ns}/${Date.now()}-${name}`;
  const access = input.access ?? "private";
  const contentType =
    input.contentType?.trim() ||
    (typeof input.body === "string"
      ? "text/plain; charset=utf-8"
      : "application/octet-stream");

  const result: PutBlobResult = await put(pathname, input.body, {
    access,
    contentType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const downloadUrl =
    access === "public"
      ? result.url
      : await createSignedDownloadUrl(
          result.url,
          input.downloadExpiresSec ?? 60 * 30
        );

  return {
    url: result.url,
    downloadUrl,
    pathname: result.pathname,
    contentType: result.contentType ?? contentType,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Build a time-bounded download link for a private Blob URL.
 * Uses Vercel Blob token query when available; otherwise returns the raw URL.
 */
export async function createSignedDownloadUrl(
  blobUrl: string,
  expiresInSec = 60 * 30
): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || !blobUrl) return blobUrl;

  const expires = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSec);
  try {
    const url = new URL(blobUrl);
    url.searchParams.set("download", "1");
    url.searchParams.set("expires", String(expires));
    // Client passes BLOB token via header when fetching; embed hint for edge proxies.
    url.searchParams.set("x-scale-blob", "1");
    return url.toString();
  } catch {
    return blobUrl;
  }
}

export async function deleteAgentAsset(url: string): Promise<boolean> {
  if (!blobConfigured() || !url?.trim()) return false;
  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return true;
  } catch {
    return false;
  }
}

/** Convenience: upload UTF-8 code/script and return signed download link. */
export async function uploadGeneratedScript(options: {
  agentId: string;
  sessionId: string;
  filename: string;
  source: string;
  language?: string;
}): Promise<BlobAssetResult> {
  const ext =
    options.language === "python" || options.language === "py"
      ? "py"
      : options.language === "typescript" || options.language === "ts"
        ? "ts"
        : options.language === "javascript" || options.language === "js"
          ? "js"
          : "txt";

  const filename = options.filename.includes(".")
    ? options.filename
    : `${options.filename}.${ext}`;

  return uploadAgentAsset({
    namespace: `${options.agentId}/${options.sessionId}`,
    filename,
    body: options.source,
    contentType:
      ext === "py"
        ? "text/x-python; charset=utf-8"
        : ext === "ts" || ext === "js"
          ? "text/javascript; charset=utf-8"
          : "text/plain; charset=utf-8",
    access: "private",
    downloadExpiresSec: 60 * 60,
  });
}
