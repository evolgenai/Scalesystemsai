/**
 * Instant Sandbox provisioner — ephemeral guest user + demo workspace.
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { sealWorkspaceCredentials } from "@/lib/crypto/vault";
import { generateWorkspaceApiKey } from "@/lib/workspace/resolveWorkspace";
import { issueSessionToken } from "@/lib/auth/sessionToken";
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_GAS_GRANT,
  DEMO_SANDBOX_BLUEPRINTS,
  DEMO_TTL_MS,
} from "@/lib/demo/sandboxBlueprints";

export type ProvisionedDemoSandbox = {
  slug: string;
  expiresAt: Date;
  redirectTo: "/dashboard";
  sessionToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    name: string;
    firstName: string;
    lastName: string;
  };
  workspace: {
    id: string;
    name: string;
    apiKey: string;
    gasBalance: number;
    isDemo: true;
    demoExpiresAt: string;
  };
  blueprints: Array<{ id: string; title: string }>;
};

function demoSlug(): string {
  return `demo-${randomBytes(2).toString("hex")}`;
}

/**
 * Create an isolated guest tenant: user + workspace + gas + 3 blueprints + JWT.
 */
export async function provisionDemoSandbox(
  prisma: PrismaClient
): Promise<ProvisionedDemoSandbox> {
  const slug = demoSlug();
  const expiresAt = new Date(Date.now() + DEMO_TTL_MS);
  const email = `guest+${slug}@${DEMO_EMAIL_DOMAIN}`;
  const username = slug;
  const rawPassword = randomBytes(24).toString("hex");
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  const apiKey = generateWorkspaceApiKey();
  const sealed = sealWorkspaceCredentials({ apiKey });

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        username,
        name: "Demo Guest",
        password: passwordHash,
        plan: "DEMO",
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: slug,
        apiKey,
        credentialCipher: sealed.cipher,
        gasBalance: DEMO_GAS_GRANT,
        meterBalanceUsd: 25,
        isDemo: true,
        demoExpiresAt: expiresAt,
        uiPreference: "USER",
        requiredAuthLevel: "BASIC",
      },
      select: {
        id: true,
        name: true,
        apiKey: true,
        gasBalance: true,
        demoExpiresAt: true,
      },
    });

    await tx.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    await tx.workspaceSettings.create({
      data: {
        workspaceId: workspace.id,
        configJson: [
          { key: "seedVersion", value: "demo-sandbox-v1" },
          { key: "plan", value: "DEMO" },
          { key: "slug", value: slug },
        ],
        featureFlagsJson: {
          gas_metering: true,
          demo_sandbox: true,
          agent_sandbox: true,
        },
      },
    });

    await tx.gasLedger.create({
      data: {
        workspaceId: workspace.id,
        amount: DEMO_GAS_GRANT,
        transactionType: "RECHARGE",
        description: `DEMO_SANDBOX_GRANT · Instant Sandbox preload (${DEMO_GAS_GRANT} GAS)`,
      },
    });

    const blueprints: Array<{ id: string; title: string }> = [];
    for (const tpl of DEMO_SANDBOX_BLUEPRINTS) {
      const bp = await tx.workflowBlueprint.create({
        data: {
          workspaceId: workspace.id,
          title: tpl.title,
          description: tpl.description,
          nodes: tpl.nodes,
          edges: tpl.edges,
          status: "ACTIVE",
        },
        select: { id: true, title: true },
      });
      blueprints.push(bp);
    }

    return { user, workspace, blueprints };
  });

  const sessionToken = issueSessionToken(
    {
      sub: result.user.id,
      email: result.user.email,
      username: result.user.username,
      role: "USER",
      isSuperAdmin: false,
    },
    Math.floor(DEMO_TTL_MS / 1000)
  );

  return {
    slug,
    expiresAt,
    redirectTo: "/dashboard",
    sessionToken,
    user: {
      id: result.user.id,
      email: result.user.email,
      username: result.user.username ?? slug,
      name: result.user.name ?? "Demo Guest",
      firstName: "Demo",
      lastName: "Guest",
    },
    workspace: {
      id: result.workspace.id,
      name: result.workspace.name,
      apiKey: result.workspace.apiKey,
      gasBalance: result.workspace.gasBalance,
      isDemo: true,
      demoExpiresAt: (result.workspace.demoExpiresAt ?? expiresAt).toISOString(),
    },
    blueprints: result.blueprints,
  };
}

/**
 * Purge expired demo workspaces (+ orphaned DEMO guest users).
 */
export async function cleanupExpiredDemoSandboxes(
  prisma: PrismaClient,
  options?: { dryRun?: boolean; now?: Date }
): Promise<{
  dryRun: boolean;
  cutoff: string;
  expiredWorkspaces: number;
  deletedWorkspaces: number;
  deletedUsers: number;
  workspaceIds: string[];
}> {
  const now = options?.now ?? new Date();
  const dryRun = Boolean(options?.dryRun);

  const expired = await prisma.workspace.findMany({
    where: {
      isDemo: true,
      OR: [
        { demoExpiresAt: { lte: now } },
        {
          AND: [
            { demoExpiresAt: null },
            { createdAt: { lte: new Date(now.getTime() - DEMO_TTL_MS) } },
          ],
        },
      ],
    },
    select: {
      id: true,
      memberships: { select: { userId: true } },
    },
    take: 500,
  });

  const workspaceIds = expired.map((w) => w.id);
  const candidateUserIds = [
    ...new Set(expired.flatMap((w) => w.memberships.map((m) => m.userId))),
  ];

  if (dryRun || workspaceIds.length === 0) {
    return {
      dryRun,
      cutoff: now.toISOString(),
      expiredWorkspaces: workspaceIds.length,
      deletedWorkspaces: 0,
      deletedUsers: 0,
      workspaceIds,
    };
  }

  await prisma.workspace.deleteMany({
    where: { id: { in: workspaceIds } },
  });

  let deletedUsers = 0;
  if (candidateUserIds.length > 0) {
    const stillMember = await prisma.workspaceMembership.findMany({
      where: { userId: { in: candidateUserIds } },
      select: { userId: true },
    });
    const still = new Set(stillMember.map((m) => m.userId));
    const orphans = candidateUserIds.filter((id) => !still.has(id));

    if (orphans.length > 0) {
      const del = await prisma.user.deleteMany({
        where: {
          id: { in: orphans },
          plan: "DEMO",
          email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
        },
      });
      deletedUsers = del.count;
    }
  }

  return {
    dryRun: false,
    cutoff: now.toISOString(),
    expiredWorkspaces: workspaceIds.length,
    deletedWorkspaces: workspaceIds.length,
    deletedUsers,
    workspaceIds,
  };
}
