import { getPrisma } from "@/lib/prisma";
import {
  decryptCredential,
  encryptCredential,
  fingerprintCredential,
} from "@/lib/crypto/credentials";
import { withSecureTransaction } from "@/lib/db/secureTransaction";

const ALLOWED_PROVIDERS = new Set([
  "gemini",
  "openai",
  "anthropic",
  "hubspot",
  "salesforce",
  "stripe",
  "custom",
]);

export function isAllowedCredentialProvider(provider: string): boolean {
  return ALLOWED_PROVIDERS.has(provider.trim().toLowerCase());
}

export async function upsertDeveloperCredential(input: {
  userId: string;
  orgId?: string | null;
  provider: string;
  label?: string | null;
  secret: string;
}) {
  const provider = input.provider.trim().toLowerCase();
  const secret = input.secret.trim();
  if (!provider || !secret) {
    throw new Error("Provider and secret are required.");
  }
  if (!isAllowedCredentialProvider(provider)) {
    throw new Error(`Unsupported credential provider: ${provider}`);
  }

  const blob = encryptCredential(secret);
  const keyFingerprint = fingerprintCredential(secret);
  const orgId = input.orgId?.trim() || null;

  return withSecureTransaction(async (tx) => {
    return tx.developerCredential.upsert({
      where: {
        userId_orgId_provider_keyFingerprint: {
          userId: input.userId,
          orgId,
          provider,
          keyFingerprint,
        },
      },
      create: {
        userId: input.userId,
        orgId,
        provider,
        label: input.label?.trim()?.slice(0, 120) || null,
        secretCipher: blob.cipher,
        secretIv: blob.iv,
        secretTag: blob.tag,
        keyFingerprint,
      },
      update: {
        label: input.label?.trim()?.slice(0, 120) || null,
        secretCipher: blob.cipher,
        secretIv: blob.iv,
        secretTag: blob.tag,
      },
      select: {
        id: true,
        provider: true,
        label: true,
        keyFingerprint: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });
}

export async function listDeveloperCredentials(
  userId: string,
  orgId: string | null
) {
  return getPrisma().developerCredential.findMany({
    where: orgId?.trim() ? { orgId: orgId.trim() } : { userId, orgId: null },
    orderBy: { updatedAt: "desc" },
    take: 32,
    select: {
      id: true,
      provider: true,
      label: true,
      keyFingerprint: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function revealDeveloperCredential(input: {
  credentialId: string;
  userId: string;
  orgId: string | null;
}): Promise<string | null> {
  const row = await getPrisma().developerCredential.findUnique({
    where: { id: input.credentialId },
    select: {
      userId: true,
      orgId: true,
      secretCipher: true,
      secretIv: true,
      secretTag: true,
    },
  });
  if (!row) return null;

  const scopedOrg = input.orgId?.trim() || null;
  if (scopedOrg) {
    if (row.orgId !== scopedOrg) return null;
  } else if (row.userId !== input.userId || row.orgId != null) {
    return null;
  }

  return decryptCredential({
    cipher: row.secretCipher,
    iv: row.secretIv,
    tag: row.secretTag,
  });
}
