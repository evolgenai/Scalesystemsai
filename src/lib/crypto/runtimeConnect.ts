/**
 * Runtime-scoped temporary credentials for healer / SRE loops.
 * Agents receive single-use, TTL-bound tokens — never master production env keys.
 * Plaintext is returned once at issue time and is never logged.
 */

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { sealJson, unsealJson, maskSecret } from "@/lib/crypto/vault";
import {
  deleteRuntimeTokenMirror,
  patchRuntimeTokenMirror,
  putRuntimeTokenMirror,
  purgeExpiredRuntimeTokenMirrors,
} from "@/lib/storage/edgeStorage";

const LOG = "[runtimeConnect]";
export const RUNTIME_SCOPES = [
  "mcp:list",
  "mcp:call",
  "github:pr",
  "heal:run",
  "fs:read",
  "fs:write",
] as const;

export type RuntimeScope = (typeof RUNTIME_SCOPES)[number] | (string & {});

export const IssueRuntimeCredentialSchema = z.object({
  loopId: z.string().min(8).max(128),
  subject: z.string().min(1).max(256),
  scopes: z.array(z.string().min(1).max(64)).min(1).max(16),
  ttlSeconds: z.number().int().min(30).max(3600).default(900),
  singleUse: z.boolean().default(true),
  orgId: z.string().max(64).optional(),
  workspaceId: z.string().uuid().optional(),
  /** Opaque metadata sealed with the credential — never returned after issue. */
  bind: z.record(z.string(), z.string()).optional(),
});

export type IssueRuntimeCredentialInput = z.infer<
  typeof IssueRuntimeCredentialSchema
>;

export type RuntimeCredentialPublic = {
  tokenId: string;
  tokenPrefix: string;
  scopes: string[];
  loopId: string;
  subject: string;
  expiresAt: number;
  singleUse: boolean;
  orgId?: string;
  workspaceId?: string;
  status: "active" | "consumed" | "revoked" | "expired";
};

export type IssuedRuntimeCredential = RuntimeCredentialPublic & {
  /**
   * Plaintext runtime token — deliver once to the agent runtime.
   * Never persist, never log, never echo in API error payloads.
   */
  rawToken: string;
  /** Sealed claims envelope for Edge / cross-process handoff. */
  sealedClaims: string;
};

type StoredRuntimeCredential = {
  tokenId: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: string[];
  loopId: string;
  subject: string;
  expiresAt: number;
  singleUse: boolean;
  orgId?: string;
  workspaceId?: string;
  status: "active" | "consumed" | "revoked" | "expired";
  sealedClaims: string;
  createdAt: number;
  consumedAt?: number;
  revokedAt?: number;
};

type RuntimeClaims = {
  kind: "runtime_connect_v1";
  tokenId: string;
  loopId: string;
  subject: string;
  scopes: string[];
  exp: number;
  iat: number;
  orgId?: string;
  workspaceId?: string;
  bind?: Record<string, string>;
};

const TOKEN_PREFIX = "ss_rt_";

/** Process-local vault — cleared when loops terminate or TTL elapses. */
const store = new Map<string, StoredRuntimeCredential>();
const loopIndex = new Map<string, Set<string>>();

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ha = Buffer.from(a, "hex");
  const hb = Buffer.from(b, "hex");
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

function mintRawToken(): { rawToken: string; tokenId: string; tokenPrefix: string } {
  const entropy = randomBytes(32);
  const hex = entropy.toString("hex");
  const tokenId = hex.slice(0, 16);
  const rawToken = `${TOKEN_PREFIX}${hex.slice(0, 8)}_${hex.slice(8, 24)}_${hex.slice(24)}`;
  return {
    rawToken,
    tokenId,
    tokenPrefix: rawToken.slice(0, 16),
  };
}

function toPublic(row: StoredRuntimeCredential): RuntimeCredentialPublic {
  const now = Math.floor(Date.now() / 1000);
  let status = row.status;
  if (status === "active" && row.expiresAt <= now) {
    status = "expired";
    row.status = "expired";
  }
  return {
    tokenId: row.tokenId,
    tokenPrefix: row.tokenPrefix,
    scopes: [...row.scopes],
    loopId: row.loopId,
    subject: row.subject,
    expiresAt: row.expiresAt,
    singleUse: row.singleUse,
    orgId: row.orgId,
    workspaceId: row.workspaceId,
    status,
  };
}

function indexLoop(loopId: string, tokenId: string): void {
  let set = loopIndex.get(loopId);
  if (!set) {
    set = new Set();
    loopIndex.set(loopId, set);
  }
  set.add(tokenId);
}

function unindexLoop(loopId: string, tokenId: string): void {
  const set = loopIndex.get(loopId);
  if (!set) return;
  set.delete(tokenId);
  if (set.size === 0) loopIndex.delete(loopId);
}

/** Issue a heavily scoped, optionally single-use runtime credential. */
export function issueRuntimeCredential(
  input: IssueRuntimeCredentialInput
): IssuedRuntimeCredential {
  const parsed = IssueRuntimeCredentialSchema.parse(input);
  const { rawToken, tokenId, tokenPrefix } = mintRawToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + parsed.ttlSeconds;

  const claims: RuntimeClaims = {
    kind: "runtime_connect_v1",
    tokenId,
    loopId: parsed.loopId,
    subject: parsed.subject,
    scopes: parsed.scopes,
    exp: expiresAt,
    iat: now,
    orgId: parsed.orgId,
    workspaceId: parsed.workspaceId,
    bind: parsed.bind,
  };

  const { cipher: sealedClaims } = sealJson(claims);
  const row: StoredRuntimeCredential = {
    tokenId,
    tokenHash: sha256Hex(rawToken),
    tokenPrefix,
    scopes: parsed.scopes,
    loopId: parsed.loopId,
    subject: parsed.subject,
    expiresAt,
    singleUse: parsed.singleUse,
    orgId: parsed.orgId,
    workspaceId: parsed.workspaceId,
    status: "active",
    sealedClaims,
    createdAt: now,
  };

  store.set(tokenId, row);
  indexLoop(parsed.loopId, tokenId);

  void putRuntimeTokenMirror(
    {
      tokenId,
      tokenPrefix,
      loopId: parsed.loopId,
      expiresAt,
      singleUse: parsed.singleUse,
      status: "active",
    },
    parsed.ttlSeconds
  ).catch((err) => {
    console.error(`${LOG} kv mirror write failed`, {
      tokenId,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    ...toPublic(row),
    rawToken,
    sealedClaims,
  };
}

export type RedeemRuntimeResult =
  | {
      ok: true;
      credential: RuntimeCredentialPublic;
      claims: RuntimeClaims;
    }
  | { ok: false; reason: string; code: string };

/**
 * Verify + optionally consume a runtime token.
 * Master env keys are never accepted here.
 */
export function redeemRuntimeCredential(
  rawToken: string,
  requiredScopes: string[] = [],
  options?: { consume?: boolean }
): RedeemRuntimeResult {
  const token = rawToken?.trim();
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    return {
      ok: false,
      reason: "Unrecognized runtime token format.",
      code: "RUNTIME_TOKEN_INVALID",
    };
  }

  const hash = sha256Hex(token);
  let match: StoredRuntimeCredential | undefined;
  for (const row of store.values()) {
    if (safeEqualHex(row.tokenHash, hash)) {
      match = row;
      break;
    }
  }

  if (!match) {
    return {
      ok: false,
      reason: "Runtime token not found or already purged.",
      code: "RUNTIME_TOKEN_UNKNOWN",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (match.status === "revoked") {
    return {
      ok: false,
      reason: "Runtime token revoked.",
      code: "RUNTIME_TOKEN_REVOKED",
    };
  }
  if (match.status === "consumed") {
    return {
      ok: false,
      reason: "Runtime token already consumed.",
      code: "RUNTIME_TOKEN_CONSUMED",
    };
  }
  if (match.expiresAt <= now || match.status === "expired") {
    match.status = "expired";
    return {
      ok: false,
      reason: "Runtime token expired.",
      code: "RUNTIME_TOKEN_EXPIRED",
    };
  }

  for (const scope of requiredScopes) {
    if (!match.scopes.includes(scope) && !match.scopes.includes("*")) {
      return {
        ok: false,
        reason: `Missing required scope: ${scope}`,
        code: "RUNTIME_SCOPE_DENIED",
      };
    }
  }

  let claims: RuntimeClaims;
  try {
    claims = unsealJson<RuntimeClaims>(match.sealedClaims);
  } catch {
    return {
      ok: false,
      reason: "Runtime claims envelope corrupt.",
      code: "RUNTIME_CLAIMS_INVALID",
    };
  }

  const shouldConsume =
    options?.consume === true || (match.singleUse && options?.consume !== false);
  if (shouldConsume && match.singleUse) {
    match.status = "consumed";
    match.consumedAt = now;
    void patchRuntimeTokenMirror(match.tokenId, { status: "consumed" });
  }

  return {
    ok: true,
    credential: toPublic(match),
    claims,
  };
}

/** Revoke one runtime credential immediately. */
export function revokeRuntimeCredential(tokenId: string): boolean {
  const row = store.get(tokenId);
  if (!row) return false;
  row.status = "revoked";
  row.revokedAt = Math.floor(Date.now() / 1000);
  void patchRuntimeTokenMirror(tokenId, { status: "revoked" });
  return true;
}

/**
 * Terminate an active healer loop — revoke every runtime credential bound to it.
 * Call this when the SRE / remediation loop ends.
 */
export function terminateHealerLoop(loopId: string): {
  revoked: number;
  tokenIds: string[];
} {
  const ids = [...(loopIndex.get(loopId) ?? [])];
  const now = Math.floor(Date.now() / 1000);
  let revoked = 0;
  const tokenIds: string[] = [];

  for (const id of ids) {
    const row = store.get(id);
    if (!row) continue;
    if (row.status === "active") {
      row.status = "revoked";
      row.revokedAt = now;
      revoked += 1;
    }
    tokenIds.push(id);
    store.delete(id);
    unindexLoop(loopId, id);
    void deleteRuntimeTokenMirror(id);
  }

  loopIndex.delete(loopId);
  return { revoked, tokenIds };
}

export type PurgeRuntimeCredentialsResult = {
  localPurged: number;
  kvPurged: number;
  kvScanned: number;
  dryRun: boolean;
  enforcedAt: number;
};

/**
 * Drop expired / terminal `ss_rt_…` rows from process memory + Edge KV mirrors.
 * Strict TTL gate — never mutates PostgreSQL / persistent app tables.
 */
export async function purgeExpiredRuntimeCredentialsAsync(options?: {
  dryRun?: boolean;
  nowSec?: number;
}): Promise<PurgeRuntimeCredentialsResult> {
  const dryRun = Boolean(options?.dryRun);
  const now = options?.nowSec ?? Math.floor(Date.now() / 1000);
  let localPurged = 0;

  for (const [id, row] of store.entries()) {
    const expired = row.expiresAt <= now;
    if (expired && row.status === "active") {
      row.status = "expired";
    }
    const terminal =
      row.status === "expired" ||
      row.status === "consumed" ||
      row.status === "revoked" ||
      expired;

    if (!terminal) continue;
    localPurged += 1;
    if (!dryRun) {
      store.delete(id);
      unindexLoop(row.loopId, id);
    }
  }

  const kv = await purgeExpiredRuntimeTokenMirrors({ nowSec: now, dryRun });

  console.info(`${LOG} purge complete`, {
    localPurged,
    kvPurged: kv.purged,
    kvScanned: kv.scanned,
    dryRun,
    enforcedAt: now,
  });

  return {
    localPurged,
    kvPurged: kv.purged,
    kvScanned: kv.scanned,
    dryRun,
    enforcedAt: now,
  };
}

/** Drop expired rows (safe housekeeping — no secrets emitted). Sync local-only. */
export function purgeExpiredRuntimeCredentials(): number {
  const now = Math.floor(Date.now() / 1000);
  let purged = 0;
  for (const [id, row] of store.entries()) {
    if (row.expiresAt <= now || row.status !== "active") {
      if (row.expiresAt <= now && row.status === "active") {
        row.status = "expired";
      }
      if (row.status !== "active") {
        store.delete(id);
        unindexLoop(row.loopId, id);
        void deleteRuntimeTokenMirror(id);
        purged += 1;
      }
    }
  }
  return purged;
}

export function getRuntimeCredentialPublic(
  tokenId: string
): RuntimeCredentialPublic | null {
  const row = store.get(tokenId);
  if (!row) return null;
  return toPublic(row);
}

export function listLoopCredentials(loopId: string): RuntimeCredentialPublic[] {
  const ids = loopIndex.get(loopId);
  if (!ids) return [];
  const out: RuntimeCredentialPublic[] = [];
  for (const id of ids) {
    const row = store.get(id);
    if (row) out.push(toPublic(row));
  }
  return out;
}

/** Safe debug mask — never returns raw token material. */
export function maskRuntimeToken(raw: string | null | undefined): string {
  return maskSecret(raw, 8);
}

/**
 * Mint a short-lived GitHub PR scope credential for remediation.
 * Does NOT embed GITHUB_TOKEN — the route resolves the master key server-side only.
 */
export function issueGitPrRuntimeCredential(params: {
  loopId: string;
  subject: string;
  owner: string;
  repo: string;
  ttlSeconds?: number;
}): IssuedRuntimeCredential {
  return issueRuntimeCredential({
    loopId: params.loopId,
    subject: params.subject,
    scopes: ["github:pr", "heal:run"],
    ttlSeconds: params.ttlSeconds ?? 600,
    singleUse: true,
    bind: {
      owner: params.owner,
      repo: params.repo,
      purpose: "git-pr-remediation",
    },
  });
}
