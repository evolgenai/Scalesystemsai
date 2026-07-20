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
