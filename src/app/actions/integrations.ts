"use server";

import { auth } from "@/auth";
import {
  encryptCredential,
  INTEGRATION_PROVIDERS,
  isIntegrationProvider,
} from "@/lib/credentials";
import { getPrisma } from "@/lib/prisma";

export type IntegrationActionResult =
  | { success: true; configured: string[] }
  | { success: false; error: string };

export async function saveIntegrationCredentials(
  credentials: Record<string, string>
): Promise<IntegrationActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Sign in to save integration credentials." };
    }

    const entries = Object.entries(credentials).filter(
      ([, value]) => value.trim().length > 0
    );

    if (entries.length === 0) {
      return {
        success: false,
        error: "Provide at least one integration credential to save.",
      };
    }

    for (const [provider] of entries) {
      if (!isIntegrationProvider(provider)) {
        return {
          success: false,
          error: `Unsupported integration provider: ${provider}.`,
        };
      }
    }

    const prisma = getPrisma();
    const userId = session.user.id;

    await prisma.$transaction(
      entries.map(([provider, value]) =>
        prisma.userIntegrationKey.upsert({
          where: {
            userId_provider: { userId, provider },
          },
          create: {
            userId,
            provider,
            encryptedValue: encryptCredential(value.trim()),
          },
          update: {
            encryptedValue: encryptCredential(value.trim()),
          },
        })
      )
    );

    return {
      success: true,
      configured: entries.map(([provider]) => provider),
    };
  } catch (error) {
    console.error("[Integrations] saveIntegrationCredentials:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save credentials.";
    return { success: false, error: message };
  }
}

export async function getConfiguredIntegrations(): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const rows = await getPrisma().userIntegrationKey.findMany({
    where: { userId: session.user.id },
    select: { provider: true },
  });

  return rows
    .map((row) => row.provider)
    .filter((provider) =>
      INTEGRATION_PROVIDERS.includes(
        provider as (typeof INTEGRATION_PROVIDERS)[number]
      )
    );
}
