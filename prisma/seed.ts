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

const SUPER_ADMIN_EMAIL =
  process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
  "admin@scalesystems.ai";

const SUPER_ADMIN_PASSWORD =
  process.env.SEED_SUPER_ADMIN_PASSWORD?.trim() || "ScaleAdmin!Launch1";

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
  const user = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    create: {
      email: SUPER_ADMIN_EMAIL,
      name: "Scale Systems Super Admin",
      password: hashed,
      role: "SUPER_ADMIN",
      accountKind: "DEVELOPER_ACCOUNT",
      tier: "ENTERPRISE_100",
      maxAgents: 100,
      plan: "ENTERPRISE",
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      developerAccount: {
        create: {
          handle: "scale-super-admin",
          verifiedAt: new Date(),
          sandboxEnabled: true,
          orchestrationEnabled: true,
          maxConcurrentRuntimes: 8,
          maxCpuMsPerDay: 3_600_000,
        },
      },
    },
    update: {
      role: "SUPER_ADMIN",
      accountKind: "DEVELOPER_ACCOUNT",
      tier: "ENTERPRISE_100",
      maxAgents: 100,
      plan: "ENTERPRISE",
      password: hashed,
    },
    select: { id: true, email: true, role: true },
  });

  await prisma.developerAccount.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      handle: "scale-super-admin",
      verifiedAt: new Date(),
      sandboxEnabled: true,
      orchestrationEnabled: true,
      maxConcurrentRuntimes: 8,
      maxCpuMsPerDay: 3_600_000,
    },
    update: {
      verifiedAt: new Date(),
      sandboxEnabled: true,
      orchestrationEnabled: true,
    },
  });

  console.log(`✓ SUPER_ADMIN  ${user.email} (${user.id})`);
  return user;
}

async function seedPlatformWorkspace(prisma: PrismaClient) {
  const apiKey =
    PLATFORM_WORKSPACE_API_KEY.startsWith("ss_ws_")
      ? PLATFORM_WORKSPACE_API_KEY
      : stableApiKey(PLATFORM_WORKSPACE_API_KEY);

  const existing = await prisma.workspace.findUnique({
    where: { apiKey },
    select: { id: true },
  });

  const workspace = existing
    ? await prisma.workspace.update({
        where: { id: existing.id },
        data: {
          name: "Scale Systems Platform",
          gasBalance: 500_000,
          meterBalanceUsd: 1000,
          requiredAuthLevel: "CONTAINER_ORCHESTRATION",
          uiPreference: "DEVELOPER",
        },
      })
    : await prisma.workspace.create({
        data: {
          name: "Scale Systems Platform",
          apiKey,
          gasBalance: 500_000,
          meterBalanceUsd: 1000,
          requiredAuthLevel: "CONTAINER_ORCHESTRATION",
          uiPreference: "DEVELOPER",
        },
      });

  await prisma.workspaceSettings.upsert({
    where: { workspaceId: workspace.id },
    create: {
      workspaceId: workspace.id,
      configJson: [
        { key: "gasRates", value: GAS_RATES },
        { key: "seedVersion", value: "launch-v1" },
      ] as Prisma.InputJsonValue,
      featureFlagsJson: {
        marketplace_official: true,
        gas_metering: true,
        edge_regional_affinity: true,
      } as Prisma.InputJsonValue,
    },
    update: {
      configJson: [
        { key: "gasRates", value: GAS_RATES },
        { key: "seedVersion", value: "launch-v1" },
      ] as Prisma.InputJsonValue,
      featureFlagsJson: {
        marketplace_official: true,
        gas_metering: true,
        edge_regional_affinity: true,
      } as Prisma.InputJsonValue,
    },
  });

  console.log(`✓ workspace    ${workspace.name} (${workspace.id})`);
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
    console.log(`✓ gas rates    already seeded (${existing.id})`);
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
      amount: 50_000,
      transactionType: "RECHARGE" as const,
      description: `${marker} · initial platform gas grant`,
    },
  ];

  await prisma.gasLedger.createMany({ data: entries.map((e) => ({ ...e, workspaceId })) });

  const rateSum =
    GAS_RATES.webhook_trigger + GAS_RATES.scraper + GAS_RATES.ai_agent + 50_000;
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { gasBalance: { increment: rateSum } },
  });

  console.log(`✓ gas rates    ${entries.length} ledger rows`);
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
    await seedSuperAdmin(prisma);
    const workspace = await seedPlatformWorkspace(prisma);
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
