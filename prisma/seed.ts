/**
 * Launch database seeder — idempotent marketplace agents, system templates,
 * gas ledger rates, and SUPER_ADMIN bootstrap.
 *
 * Run: npx prisma db seed
 */

import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const PLATFORM_WORKSPACE_API_KEY =
  process.env.SEED_PLATFORM_WORKSPACE_KEY?.trim() ||
  "ss_ws_platform_launch_seed_v1";

/** Force-seed Master Superadmin — exact credentials (not env-overridable). */
const SUPER_ADMIN_USERNAME = "Superadmin";
const SUPER_ADMIN_EMAIL = "Superadmin@scalesystemsai.com";
const SUPER_ADMIN_PASSWORD = "Superadmin";
const SUPER_ADMIN_GAS = 1_000_000;

/** Fixed gas costs mirrored from src/lib/billing/gasMeter.ts */
const GAS_RATES = {
  webhook_trigger: 10,
  scraper: 50,
  ai_agent: 100,
} as const;

const MARKETPLACE_AGENTS: Array<{
  title: string;
  slug: string;
  description: string;
  category: string;
  author: string;
  iconName: string;
  configSchema: Record<string, unknown>;
  isOfficial: boolean;
}> = [
  {
    title: "Playwright Scraper Bot",
    slug: "playwright-scraper-bot",
    description:
      "Headless Playwright scrape + structured extract from public http(s) URLs. Supports CSS selectors and JSON field mapping.",
    category: "ingestion",
    author: "Scale Systems",
    iconName: "Globe",
    configSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        selector: { type: "string", default: "main" },
        label: { type: "string" },
        requiresApproval: { type: "boolean", default: false },
      },
      required: ["url"],
    },
    isOfficial: true,
  },
  {
    title: "Meta-SRE Diagnostics Agent",
    slug: "meta-sre-diagnostics-agent",
    description:
      "Evaluate upstream workflow context, latency, and error signals; propose SRE remediations with optional HITL approval.",
    category: "ops",
    author: "Scale Systems",
    iconName: "Shield",
    configSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        objective: { type: "string" },
        policy: { type: "string", default: "safe-heal" },
        requiresApproval: { type: "boolean", default: true },
      },
    },
    isOfficial: true,
  },
  {
    title: "E-Com Inventory Manager",
    slug: "ecom-inventory-manager",
    description:
      "Sync stock levels into the tenant catalog. Maps SKU + qty fields and updates CatalogItem.stockQuantity under workspace isolation.",
    category: "commerce",
    author: "Scale Systems",
    iconName: "Package",
    configSchema: {
      type: "object",
      properties: {
        skuField: { type: "string", default: "sku" },
        stockField: { type: "string", default: "qty" },
        dryRun: { type: "boolean", default: false },
        requiresApproval: { type: "boolean", default: true },
      },
    },
    isOfficial: true,
  },
  {
    title: "Summarizer Node",
    slug: "summarizer-node",
    description:
      "Condense upstream payloads into actionable ops briefs with configurable style and token budget.",
    category: "compute",
    author: "Scale Systems",
    iconName: "FileText",
    configSchema: {
      type: "object",
      properties: {
        style: { type: "string", default: "ops-brief" },
        maxTokens: { type: "integer", default: 512 },
        prompt: { type: "string" },
        requiresApproval: { type: "boolean", default: false },
      },
    },
    isOfficial: true,
  },
  // Sprint 48 — official Scale Systems AI catalog (mirrors /api/catalog)
  {
    title: "Meta-SRE",
    slug: "meta-sre",
    description:
      "Autonomous principal engineer that diagnoses incidents, proposes policy-safe remediations, and opens heal PRs with sandbox verification.",
    category: "agent_template",
    author: "Scale Systems AI",
    iconName: "Shield",
    configSchema: {
      type: "object",
      properties: {
        policy: {
          type: "string",
          enum: ["safe-heal", "observe", "aggressive"],
          default: "safe-heal",
        },
        requiresApproval: { type: "boolean", default: true },
        objective: { type: "string" },
      },
    },
    isOfficial: true,
  },
  {
    title: "Full-Stack Dev",
    slug: "full-stack-dev",
    description:
      "End-to-end implementation agent for Next.js App Router, Prisma, API routes, and UI — ships typed patches with sandbox smoke checks.",
    category: "agent_template",
    author: "Scale Systems AI",
    iconName: "Code2",
    configSchema: {
      type: "object",
      properties: {
        stack: { type: "string", default: "next15-react19-prisma" },
        personaId: { type: "string", default: "researcher" },
        requiresApproval: { type: "boolean", default: false },
      },
    },
    isOfficial: true,
  },
  {
    title: "Security Auditor",
    slug: "security-auditor",
    description:
      "Adversarial security lead that maps OWASP risks, abuse paths, and concrete mitigations across agents, webhooks, and MCP hosts.",
    category: "agent_template",
    author: "Scale Systems AI",
    iconName: "ShieldCheck",
    configSchema: {
      type: "object",
      properties: {
        personaId: { type: "string", default: "security" },
        scope: {
          type: "string",
          enum: ["api", "mcp", "auth", "full"],
          default: "full",
        },
        requiresApproval: { type: "boolean", default: true },
      },
    },
    isOfficial: true,
  },
  {
    title: "Sentry MCP",
    slug: "sentry-mcp",
    description:
      "Official MCP bridge to Sentry — search issues, analyze with Seer, and feed production telemetry into agent tool context.",
    category: "mcp_plugin",
    author: "Scale Systems AI",
    iconName: "Activity",
    configSchema: {
      type: "object",
      properties: {
        transport: { type: "string", enum: ["http", "sse"], default: "http" },
        mcpUrl: {
          type: "string",
          format: "uri",
          default: "https://mcp.sentry.dev/mcp",
        },
        organizationSlug: { type: "string" },
      },
      required: ["mcpUrl"],
    },
    isOfficial: true,
  },
  {
    title: "GitHub MCP",
    slug: "github-mcp",
    description:
      "GitHub MCP plugin for issues, pull requests, and remediation branch workflows used by Meta-SRE heal pipelines.",
    category: "mcp_plugin",
    author: "Scale Systems AI",
    iconName: "GitBranch",
    configSchema: {
      type: "object",
      properties: {
        transport: { type: "string", enum: ["http", "sse"], default: "http" },
        owner: { type: "string" },
        repo: { type: "string" },
        mcpUrl: { type: "string", format: "uri" },
      },
      required: ["mcpUrl"],
    },
    isOfficial: true,
  },
  {
    title: "Postgres DB MCP",
    slug: "postgres-db-mcp",
    description:
      "Read-safe Postgres MCP host for schema introspection, explain plans, and pool health probes against Neon/Prisma adapters.",
    category: "mcp_plugin",
    author: "Scale Systems AI",
    iconName: "Database",
    configSchema: {
      type: "object",
      properties: {
        transport: { type: "string", enum: ["http", "sse"], default: "http" },
        readOnly: { type: "boolean", default: true },
        mcpUrl: { type: "string", format: "uri" },
      },
      required: ["mcpUrl"],
    },
    isOfficial: true,
  },
  {
    title: "Node.js Persistent Sandbox",
    slug: "nodejs-persistent-sandbox",
    description:
      "Long-lived Node.js microVM that keeps filesystem state across agent turns — ideal for multi-step coding and eval loops.",
    category: "sandbox_blueprint",
    author: "Scale Systems AI",
    iconName: "Box",
    configSchema: {
      type: "object",
      properties: {
        language: { type: "string", const: "javascript" },
        timeoutMs: {
          type: "integer",
          minimum: 60_000,
          maximum: 86_400_000,
          default: 3_600_000,
        },
        cwd: { type: "string", default: "/home/user/workspace" },
      },
    },
    isOfficial: true,
  },
  {
    title: "Python Executor",
    slug: "python-executor",
    description:
      "Isolated Python executor for agent scripts, data transforms, and ScaleAgent skill stubs with stdout/stderr capture.",
    category: "sandbox_blueprint",
    author: "Scale Systems AI",
    iconName: "Terminal",
    configSchema: {
      type: "object",
      properties: {
        language: { type: "string", const: "python" },
        timeoutMs: {
          type: "integer",
          minimum: 1_000,
          maximum: 120_000,
          default: 30_000,
        },
        injectScaleAgentStub: { type: "boolean", default: true },
      },
    },
    isOfficial: true,
  },
];

type SystemTemplate = {
  key: string;
  title: string;
  description: string;
  nodes: unknown[];
  edges: unknown[];
};

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    key: "auto-scrape-stock",
    title: "Auto-Scrape & Stock Sync",
    description: "Schedule scrape → extract inventory → sync store stock.",
    nodes: [
      {
        id: "t1",
        type: "trigger",
        position: { x: 40, y: 140 },
        data: {
          kind: "trigger",
          variant: "schedule",
          label: "Schedule Trigger",
          description: "Every 15 minutes",
          params: { cron: "*/15 * * * *", timezone: "UTC" },
          status: "idle",
        },
      },
      {
        id: "a1",
        type: "agent",
        position: { x: 300, y: 140 },
        data: {
          kind: "agent",
          variant: "scraper",
          label: "Playwright Scraper Bot",
          description: "Pull product stock pages",
          params: {
            url: "https://vendor.example/stock",
            selector: ".sku-row",
          },
          status: "idle",
        },
      },
      {
        id: "x1",
        type: "action",
        position: { x: 580, y: 140 },
        data: {
          kind: "action",
          variant: "inventory",
          label: "E-Commerce Inventory Update",
          description: "Write qty into catalog",
          params: { skuField: "sku", stockField: "qty" },
          status: "idle",
        },
      },
    ],
    edges: [
      { id: "e1", source: "t1", target: "a1", type: "glowing" },
      { id: "e2", source: "a1", target: "x1", type: "glowing" },
    ],
  },
  {
    key: "sre-discord",
    title: "SRE Health Monitor to Discord",
    description: "Event trigger → Meta-SRE diagnostics → Discord ops alert.",
    nodes: [
      {
        id: "t2",
        type: "trigger",
        position: { x: 40, y: 140 },
        data: {
          kind: "trigger",
          variant: "event",
          label: "Event Trigger",
          description: "agent.health.degraded",
          params: {
            topic: "agent.health.degraded",
            filter: "severity>=warn",
          },
          status: "idle",
        },
      },
      {
        id: "a2",
        type: "agent",
        position: { x: 300, y: 140 },
        data: {
          kind: "agent",
          variant: "sre",
          label: "Meta-SRE Diagnostics Agent",
          description: "Diagnose + safe heal",
          params: { policy: "safe-heal", budget: "3" },
          status: "idle",
        },
      },
      {
        id: "x2",
        type: "action",
        position: { x: 580, y: 140 },
        data: {
          kind: "action",
          variant: "discord",
          label: "Discord Alert",
          description: "Notify #ops-alerts",
          params: { channel: "#ops-alerts", severity: "warning" },
          status: "idle",
        },
      },
    ],
    edges: [
      { id: "e3", source: "t2", target: "a2", type: "glowing" },
      { id: "e4", source: "a2", target: "x2", type: "glowing" },
    ],
  },
  {
    key: "multi-agent-content",
    title: "Multi-Agent Content Pipeline",
    description: "Webhook → scrape → summarize → API publish.",
    nodes: [
      {
        id: "t3",
        type: "trigger",
        position: { x: 20, y: 160 },
        data: {
          kind: "trigger",
          variant: "webhook",
          label: "Webhook Trigger",
          description: "POST /hooks/content",
          params: { path: "/hooks/content", method: "POST" },
          status: "idle",
        },
      },
      {
        id: "a3",
        type: "agent",
        position: { x: 260, y: 80 },
        data: {
          kind: "agent",
          variant: "scraper",
          label: "Playwright Scraper Bot",
          description: "Collect source articles",
          params: { url: "https://news.example", selector: "article" },
          status: "idle",
        },
      },
      {
        id: "a4",
        type: "agent",
        position: { x: 260, y: 240 },
        data: {
          kind: "agent",
          variant: "summarizer",
          label: "Summarizer Node",
          description: "Ops brief digest",
          params: { style: "ops-brief", maxTokens: "512" },
          status: "idle",
        },
      },
      {
        id: "x3",
        type: "action",
        position: { x: 540, y: 160 },
        data: {
          kind: "action",
          variant: "api",
          label: "API Webhook",
          description: "Publish to CMS",
          params: { url: "https://api.cms.dev/hooks", method: "POST" },
          status: "idle",
        },
      },
    ],
    edges: [
      { id: "e5", source: "t3", target: "a3", type: "glowing" },
      { id: "e6", source: "a3", target: "a4", type: "glowing" },
      { id: "e7", source: "a4", target: "x3", type: "glowing" },
    ],
  },
];

function stableApiKey(seed: string): string {
  return `ss_ws_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

async function seedSuperAdmin(prisma: PrismaClient) {
  const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  // Resolve by email (exact) or legacy username collision.
  const existing =
    (await prisma.user.findUnique({
      where: { email: SUPER_ADMIN_EMAIL },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { username: { equals: SUPER_ADMIN_USERNAME, mode: "insensitive" } },
      select: { id: true },
    }));

  const data = {
    email: SUPER_ADMIN_EMAIL,
    username: SUPER_ADMIN_USERNAME,
    name: "Superadmin",
    password: hashed,
    role: "SUPER_ADMIN" as const,
    isSuperAdmin: true,
    accountKind: "DEVELOPER_ACCOUNT" as const,
    tier: "ENTERPRISE_100" as const,
    maxAgents: 100,
    plan: "ENTERPRISE",
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: new Date(),
  };

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isSuperAdmin: true,
        },
      })
    : await prisma.user.create({
        data: {
          ...data,
          developerAccount: {
            create: {
              handle: SUPER_ADMIN_USERNAME,
              verifiedAt: new Date(),
              sandboxEnabled: true,
              orchestrationEnabled: true,
              maxConcurrentRuntimes: 8,
              maxCpuMsPerDay: 3_600_000,
            },
          },
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isSuperAdmin: true,
        },
      });

  await prisma.developerAccount.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      handle: SUPER_ADMIN_USERNAME,
      verifiedAt: new Date(),
      sandboxEnabled: true,
      orchestrationEnabled: true,
      maxConcurrentRuntimes: 8,
      maxCpuMsPerDay: 3_600_000,
    },
    update: {
      handle: SUPER_ADMIN_USERNAME,
      verifiedAt: new Date(),
      sandboxEnabled: true,
      orchestrationEnabled: true,
    },
  });

  console.log(
    `✓ SUPER_ADMIN  ${user.username} <${user.email}> isSuperAdmin=${user.isSuperAdmin} (${user.id})`
  );
  return user;
}

async function seedEnterpriseWorkspace(
  prisma: PrismaClient,
  superAdminId: string
) {
  const apiKey =
    PLATFORM_WORKSPACE_API_KEY.startsWith("ss_ws_")
      ? PLATFORM_WORKSPACE_API_KEY
      : stableApiKey(PLATFORM_WORKSPACE_API_KEY);

  const existing = await prisma.workspace.findUnique({
    where: { apiKey },
    select: { id: true },
  });

  const workspacePayload = {
    name: "Scale Systems Enterprise",
    gasBalance: SUPER_ADMIN_GAS,
    meterBalanceUsd: 1000,
    requiredAuthLevel: "CONTAINER_ORCHESTRATION" as const,
    uiPreference: "DEVELOPER" as const,
    hasCustomDomains: true,
    hasSreAccess: true,
    hasFullMarketplace: true,
  };

  const workspace = existing
    ? await prisma.workspace.update({
        where: { id: existing.id },
        data: workspacePayload,
      })
    : await prisma.workspace.create({
        data: {
          ...workspacePayload,
          apiKey,
        },
      });

  await prisma.workspaceSettings.upsert({
    where: { workspaceId: workspace.id },
    create: {
      workspaceId: workspace.id,
      configJson: [
        { key: "gasRates", value: GAS_RATES },
        { key: "seedVersion", value: "superadmin-v1" },
        { key: "plan", value: "ENTERPRISE" },
      ] as Prisma.InputJsonValue,
      featureFlagsJson: {
        marketplace_official: true,
        gas_metering: true,
        edge_regional_affinity: true,
        hasCustomDomains: true,
        hasSreAccess: true,
        hasFullMarketplace: true,
        agent_sandbox: true,
      } as Prisma.InputJsonValue,
    },
    update: {
      configJson: [
        { key: "gasRates", value: GAS_RATES },
        { key: "seedVersion", value: "superadmin-v1" },
        { key: "plan", value: "ENTERPRISE" },
      ] as Prisma.InputJsonValue,
      featureFlagsJson: {
        marketplace_official: true,
        gas_metering: true,
        edge_regional_affinity: true,
        hasCustomDomains: true,
        hasSreAccess: true,
        hasFullMarketplace: true,
        agent_sandbox: true,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.workspaceMembership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: superAdminId,
      },
    },
    create: {
      workspaceId: workspace.id,
      userId: superAdminId,
      role: "ADMIN",
    },
    update: { role: "ADMIN" },
  });

  console.log(
    `✓ workspace    ${workspace.name} gas=${workspace.gasBalance} flags=domains/sre/marketplace (${workspace.id})`
  );
  return workspace;
}

async function seedMarketplaceAgents(prisma: PrismaClient) {
  let upserted = 0;
  for (const agent of MARKETPLACE_AGENTS) {
    await prisma.marketplaceAgent.upsert({
      where: { slug: agent.slug },
      create: {
        ...agent,
        configSchema: agent.configSchema as Prisma.InputJsonValue,
      },
      update: {
        title: agent.title,
        description: agent.description,
        category: agent.category,
        author: agent.author,
        iconName: agent.iconName,
        configSchema: agent.configSchema as Prisma.InputJsonValue,
        isOfficial: agent.isOfficial,
      },
    });
    upserted += 1;
  }
  console.log(`✓ marketplace  ${upserted} agents`);
}

async function seedSystemTemplates(
  prisma: PrismaClient,
  workspaceId: string
) {
  let created = 0;
  let skipped = 0;

  for (const tpl of SYSTEM_TEMPLATES) {
    const existing = await prisma.workflowBlueprint.findFirst({
      where: {
        workspaceId,
        title: tpl.title,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.workflowBlueprint.update({
        where: { id: existing.id },
        data: {
          description: tpl.description,
          nodes: tpl.nodes as Prisma.InputJsonValue,
          edges: tpl.edges as Prisma.InputJsonValue,
          status: "ACTIVE",
        },
      });
      skipped += 1;
      continue;
    }

    await prisma.workflowBlueprint.create({
      data: {
        workspaceId,
        title: tpl.title,
        description: tpl.description,
        nodes: tpl.nodes as Prisma.InputJsonValue,
        edges: tpl.edges as Prisma.InputJsonValue,
        status: "ACTIVE",
      },
    });
    created += 1;
  }

  console.log(
    `✓ templates    created=${created} updated=${skipped}`
  );
}

async function seedGasLedgerRates(
  prisma: PrismaClient,
  workspaceId: string
) {
  const marker = "LAUNCH_SEED_GAS_RATES_V1";
  const existing = await prisma.gasLedger.findFirst({
    where: {
      workspaceId,
      description: { startsWith: marker },
    },
    select: { id: true },
  });

  if (existing) {
    // Ensure absolute gas balance matches Superadmin grant (force).
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { gasBalance: SUPER_ADMIN_GAS },
    });
    console.log(`✓ gas rates    already seeded (${existing.id}); gas forced to ${SUPER_ADMIN_GAS}`);
    return;
  }

  const entries = [
    {
      amount: GAS_RATES.webhook_trigger,
      transactionType: "RECHARGE" as const,
      description: `${marker} · rate:webhook_trigger=${GAS_RATES.webhook_trigger}`,
    },
    {
      amount: GAS_RATES.scraper,
      transactionType: "RECHARGE" as const,
      description: `${marker} · rate:scraper=${GAS_RATES.scraper}`,
    },
    {
      amount: GAS_RATES.ai_agent,
      transactionType: "RECHARGE" as const,
      description: `${marker} · rate:ai_agent=${GAS_RATES.ai_agent}`,
    },
    {
      amount: SUPER_ADMIN_GAS,
      transactionType: "RECHARGE" as const,
      description: `${marker} · Superadmin enterprise gas grant`,
    },
  ];

  await prisma.gasLedger.createMany({
    data: entries.map((e) => ({ ...e, workspaceId })),
  });

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { gasBalance: SUPER_ADMIN_GAS },
  });

  console.log(`✓ gas rates    ${entries.length} ledger rows; gas=${SUPER_ADMIN_GAS}`);
}

async function seedCliApiKey(prisma: PrismaClient, workspaceId: string) {
  const raw =
    process.env.SEED_CLI_API_KEY?.trim() ||
    `ss_cli_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(raw).digest("hex");

  const existing = await prisma.apiKey.findFirst({
    where: { workspaceId, name: "launch-seed-cli" },
    select: { id: true },
  });

  if (existing) {
    console.log(`✓ cli key      already present (${existing.id})`);
    return;
  }

  await prisma.apiKey.create({
    data: {
      workspaceId,
      keyHash,
      name: "launch-seed-cli",
    },
  });

  if (process.env.SEED_CLI_API_KEY?.trim()) {
    console.log(`✓ cli key      launch-seed-cli (hash stored)`);
  } else {
    console.log(
      `✓ cli key      launch-seed-cli minted (set SEED_CLI_API_KEY to pin)`
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for prisma/seed.ts");
  }

  const pool = new Pool({ connectionString, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log("→ Launch seeder starting…");
    const admin = await seedSuperAdmin(prisma);
    const workspace = await seedEnterpriseWorkspace(prisma, admin.id);
    await seedMarketplaceAgents(prisma);
    await seedSystemTemplates(prisma, workspace.id);
    await seedGasLedgerRates(prisma, workspace.id);
    await seedCliApiKey(prisma, workspace.id);
    console.log("→ Launch seeder complete.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Launch seeder failed:", err);
  process.exit(1);
});
