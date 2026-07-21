/**
 * Database Snapshot Vault — extract, gzip, encrypt, upload workspace backups.
 */

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { put, type PutBlobResult } from "@vercel/blob";
import type { Prisma } from "@prisma/client";
import { withPrisma } from "@/lib/prisma";
import { sealSecret } from "@/lib/crypto/vault";
import { createSignedDownloadUrl } from "@/lib/storage/edgeStorage";

export type VaultSnapshotCounts = {
  blueprints: number;
  catalogItems: number;
  gasLedgers: number;
};

export type VaultSnapshotPayload = {
  version: 1;
  kind: "workspace_snapshot";
  workspaceId: string;
  createdAt: string;
  workspace: {
    id: string;
    name: string;
    gasBalance: number;
    meterBalanceUsd: number;
    meterSpendUsd: number;
    uiPreference: string;
    requiredAuthLevel: string;
  };
  blueprints: unknown[];
  catalogItems: unknown[];
  gasLedgers: unknown[];
  counts: VaultSnapshotCounts;
};

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export async function extractWorkspaceSnapshot(
  workspaceId: string
): Promise<VaultSnapshotPayload> {
  const [workspace, blueprints, catalogItems, gasLedgers] = await withPrisma(
    (db) =>
      Promise.all([
        db.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          select: {
            id: true,
            name: true,
            gasBalance: true,
            meterBalanceUsd: true,
            meterSpendUsd: true,
            uiPreference: true,
            requiredAuthLevel: true,
          },
        }),
        db.workflowBlueprint.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: "desc" },
        }),
        db.catalogItem.findMany({
          where: { workspaceId, status: { not: "DELETED" } },
          orderBy: { createdAt: "desc" },
        }),
        db.gasLedger.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 10_000,
        }),
      ]),
    "vault.extract"
  );

  const counts: VaultSnapshotCounts = {
    blueprints: blueprints.length,
    catalogItems: catalogItems.length,
    gasLedgers: gasLedgers.length,
  };

  return {
    version: 1,
    kind: "workspace_snapshot",
    workspaceId,
    createdAt: new Date().toISOString(),
    workspace,
    blueprints,
    catalogItems,
    gasLedgers,
    counts,
  };
}

/**
 * Compress + AES-GCM encrypt a snapshot. Returns sealed envelope bytes as utf8.
 */
export function sealSnapshotPayload(payload: VaultSnapshotPayload): {
  envelope: string;
  sizeBytes: number;
  checksum: string;
} {
  const json = JSON.stringify(payload);
  const compressed = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  const { cipher: envelope } = sealSecret(compressed.toString("base64"));
  const checksum = createHash("sha256").update(envelope, "utf8").digest("hex");
  return {
    envelope,
    sizeBytes: Buffer.byteLength(envelope, "utf8"),
    checksum,
  };
}

export async function uploadVaultBackupBlob(input: {
  workspaceId: string;
  envelope: string;
}): Promise<PutBlobResult> {
  if (!blobConfigured()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured — cannot upload vault backups."
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const pathname = `vault-backups/${input.workspaceId}/${stamp}.vault.json.enc`;

  return put(pathname, input.envelope, {
    access: "private",
    contentType: "application/octet-stream",
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function createWorkspaceVaultBackup(input: {
  workspaceId: string;
  createdBy?: string | null;
}): Promise<{
  backup: {
    id: string;
    workspaceId: string;
    blobUrl: string;
    blobPathname: string;
    sizeBytes: number;
    checksum: string | null;
    itemCounts: VaultSnapshotCounts;
    createdBy: string | null;
    createdAt: string;
    downloadUrl: string;
  };
}> {
  const snapshot = await extractWorkspaceSnapshot(input.workspaceId);
  const sealed = sealSnapshotPayload(snapshot);
  const blob = await uploadVaultBackupBlob({
    workspaceId: input.workspaceId,
    envelope: sealed.envelope,
  });

  const itemCounts = snapshot.counts as unknown as Prisma.InputJsonValue;

  const row = await withPrisma(
    (db) =>
      db.vaultBackup.create({
        data: {
          workspaceId: input.workspaceId,
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          sizeBytes: sealed.sizeBytes,
          checksum: sealed.checksum,
          itemCounts,
          createdBy: input.createdBy?.trim() || null,
        },
      }),
    "vault.backup.record"
  );

  const downloadUrl = await createSignedDownloadUrl(row.blobUrl, 60 * 60);

  return {
    backup: {
      id: row.id,
      workspaceId: row.workspaceId,
      blobUrl: row.blobUrl,
      blobPathname: row.blobPathname,
      sizeBytes: row.sizeBytes,
      checksum: row.checksum,
      itemCounts: snapshot.counts,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      downloadUrl,
    },
  };
}

export async function listWorkspaceVaultBackups(input: {
  workspaceId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{
  backups: Array<{
    id: string;
    workspaceId: string;
    blobPathname: string;
    sizeBytes: number;
    checksum: string | null;
    itemCounts: Record<string, unknown>;
    createdBy: string | null;
    createdAt: string;
    downloadUrl: string;
  }>;
  nextCursor: string | null;
}> {
  const take = Math.min(100, Math.max(1, input.limit ?? 20));

  const rows = await withPrisma(
    (db) =>
      db.vaultBackup.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
      }),
    "vault.backups.list"
  );

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  const backups = await Promise.all(
    page.map(async (row) => {
      const downloadUrl = await createSignedDownloadUrl(row.blobUrl, 60 * 60);
      const itemCounts =
        row.itemCounts &&
        typeof row.itemCounts === "object" &&
        !Array.isArray(row.itemCounts)
          ? (row.itemCounts as Record<string, unknown>)
          : {};

      return {
        id: row.id,
        workspaceId: row.workspaceId,
        blobPathname: row.blobPathname,
        sizeBytes: row.sizeBytes,
        checksum: row.checksum,
        itemCounts,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        downloadUrl,
      };
    })
  );

  return { backups, nextCursor };
}
