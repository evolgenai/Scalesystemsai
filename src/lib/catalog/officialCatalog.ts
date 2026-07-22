/**
 * Official Scale Systems AI catalog — strongly typed seed for Agent Templates,
 * MCP Integration Plugins, and Sandbox Runtime Blueprints.
 */

import { z } from "zod";

export const CatalogKindSchema = z.enum([
  "agent_template",
  "mcp_plugin",
  "sandbox_blueprint",
]);
export type CatalogKind = z.infer<typeof CatalogKindSchema>;

export const OfficialCatalogItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  kind: CatalogKindSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  author: z.literal("Scale Systems AI"),
  isOfficial: z.literal(true),
  tags: z.array(z.string()).min(1),
  capabilities: z.array(z.string()).min(1),
  endpoint: z.string().optional(),
  configSchema: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type OfficialCatalogItem = z.infer<typeof OfficialCatalogItemSchema>;

export const OfficialCatalogResponseSchema = z.object({
  generatedAt: z.string(),
  cacheTtlSec: z.number().int().positive(),
  counts: z.object({
    total: z.number().int().nonnegative(),
    agent_template: z.number().int().nonnegative(),
    mcp_plugin: z.number().int().nonnegative(),
    sandbox_blueprint: z.number().int().nonnegative(),
  }),
  items: z.array(OfficialCatalogItemSchema),
});

export type OfficialCatalogResponse = z.infer<
  typeof OfficialCatalogResponseSchema
>;

export const CATALOG_CACHE_TTL_SEC = 300 as const;

/** Canonical official catalog — source of truth for /api/catalog + seed. */
export const OFFICIAL_CATALOG_ITEMS: OfficialCatalogItem[] = [
  // ── Agent Templates ──────────────────────────────────────────────────────
  {
    id: "tpl_meta_sre",
    slug: "meta-sre",
    kind: "agent_template",
    name: "Meta-SRE",
    description:
      "Autonomous principal engineer that diagnoses incidents, proposes policy-safe remediations, and opens heal PRs with sandbox verification.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["sre", "healing", "ops", "sentry"],
    capabilities: [
      "incident_triage",
      "auto_heal",
      "discord_alert",
      "pr_remediation",
    ],
    endpoint: "/api/sre/meta-evolution",
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
    metadata: {
      persona: "ops",
      iconName: "Shield",
      gasKind: "ai_agent",
    },
  },
  {
    id: "tpl_fullstack_dev",
    slug: "full-stack-dev",
    kind: "agent_template",
    name: "Full-Stack Dev",
    description:
      "End-to-end implementation agent for Next.js App Router, Prisma, API routes, and UI — ships typed patches with sandbox smoke checks.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["engineering", "nextjs", "prisma", "typescript"],
    capabilities: [
      "code_generation",
      "api_routes",
      "ui_components",
      "sandbox_verify",
    ],
    endpoint: "/api/agents/stream",
    configSchema: {
      type: "object",
      properties: {
        stack: {
          type: "string",
          default: "next15-react19-prisma",
        },
        personaId: { type: "string", default: "researcher" },
        requiresApproval: { type: "boolean", default: false },
      },
    },
    metadata: {
      persona: "researcher",
      iconName: "Code2",
      gasKind: "ai_agent",
    },
  },
  {
    id: "tpl_security_auditor",
    slug: "security-auditor",
    kind: "agent_template",
    name: "Security Auditor",
    description:
      "Adversarial security lead that maps OWASP risks, abuse paths, and concrete mitigations across agents, webhooks, and MCP hosts.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["security", "audit", "owasp", "threat-model"],
    capabilities: [
      "threat_modeling",
      "vulnerability_scan",
      "rbac_review",
      "ssrf_checks",
    ],
    endpoint: "/api/agents/stream",
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
    metadata: {
      persona: "security",
      iconName: "ShieldCheck",
      gasKind: "ai_agent",
    },
  },

  // ── MCP Integration Plugins ──────────────────────────────────────────────
  {
    id: "mcp_sentry",
    slug: "sentry-mcp",
    kind: "mcp_plugin",
    name: "Sentry MCP",
    description:
      "Official MCP bridge to Sentry — search issues, analyze with Seer, and feed production telemetry into agent tool context.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["mcp", "sentry", "telemetry", "observability"],
    capabilities: [
      "find_issues",
      "analyze_with_seer",
      "search_events",
      "get_sentry_resource",
    ],
    endpoint: "/api/mcp",
    configSchema: {
      type: "object",
      properties: {
        transport: {
          type: "string",
          enum: ["http", "sse"],
          default: "http",
        },
        mcpUrl: {
          type: "string",
          format: "uri",
          default: "https://mcp.sentry.dev/mcp",
        },
        organizationSlug: { type: "string" },
      },
      required: ["mcpUrl"],
    },
    metadata: {
      transport: "http",
      iconName: "Activity",
      provider: "sentry",
    },
  },
  {
    id: "mcp_github",
    slug: "github-mcp",
    kind: "mcp_plugin",
    name: "GitHub MCP",
    description:
      "GitHub MCP plugin for issues, pull requests, and remediation branch workflows used by Meta-SRE heal pipelines.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["mcp", "github", "prs", "issues"],
    capabilities: [
      "list_issues",
      "create_pull_request",
      "read_file",
      "search_code",
    ],
    endpoint: "/api/mcp",
    configSchema: {
      type: "object",
      properties: {
        transport: {
          type: "string",
          enum: ["http", "sse"],
          default: "http",
        },
        owner: { type: "string" },
        repo: { type: "string" },
        mcpUrl: { type: "string", format: "uri" },
      },
      required: ["mcpUrl"],
    },
    metadata: {
      transport: "http",
      iconName: "GitBranch",
      provider: "github",
    },
  },
  {
    id: "mcp_postgres",
    slug: "postgres-db-mcp",
    kind: "mcp_plugin",
    name: "Postgres DB MCP",
    description:
      "Read-safe Postgres MCP host for schema introspection, explain plans, and pool health probes against Neon/Prisma adapters.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["mcp", "postgres", "neon", "prisma"],
    capabilities: [
      "list_tables",
      "explain_analyze",
      "pool_health",
      "index_verify",
    ],
    endpoint: "/api/mcp",
    configSchema: {
      type: "object",
      properties: {
        transport: {
          type: "string",
          enum: ["http", "sse"],
          default: "http",
        },
        readOnly: { type: "boolean", default: true },
        mcpUrl: { type: "string", format: "uri" },
      },
      required: ["mcpUrl"],
    },
    metadata: {
      transport: "http",
      iconName: "Database",
      provider: "postgres",
      readOnly: true,
    },
  },

  // ── Sandbox Runtime Blueprints ───────────────────────────────────────────
  {
    id: "sbx_node_persistent",
    slug: "nodejs-persistent-sandbox",
    kind: "sandbox_blueprint",
    name: "Node.js Persistent Sandbox",
    description:
      "Long-lived Node.js microVM that keeps filesystem state across agent turns — ideal for multi-step coding and eval loops.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["sandbox", "nodejs", "persistent", "e2b"],
    capabilities: [
      "create",
      "exec",
      "reconnect",
      "kill",
      "snapshot_restore",
    ],
    endpoint: "/api/sandbox/persistent",
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
    metadata: {
      runtime: "nodejs",
      persistent: true,
      iconName: "Box",
      gasKind: "sandbox",
    },
  },
  {
    id: "sbx_python_executor",
    slug: "python-executor",
    kind: "sandbox_blueprint",
    name: "Python Executor",
    description:
      "Isolated Python executor for agent scripts, data transforms, and ScaleAgent skill stubs with stdout/stderr capture.",
    version: "1.0.0",
    author: "Scale Systems AI",
    isOfficial: true,
    tags: ["sandbox", "python", "executor", "skills"],
    capabilities: ["exec", "stdout_capture", "skill_inject", "timeout_guard"],
    endpoint: "/api/terminal/python",
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
    metadata: {
      runtime: "python",
      persistent: false,
      iconName: "Terminal",
      gasKind: "sandbox",
    },
  },
];

// Validate at module load — fail fast if seed drifts.
for (const item of OFFICIAL_CATALOG_ITEMS) {
  OfficialCatalogItemSchema.parse(item);
}

export function countCatalogByKind(
  items: OfficialCatalogItem[] = OFFICIAL_CATALOG_ITEMS
): OfficialCatalogResponse["counts"] {
  const counts = {
    total: items.length,
    agent_template: 0,
    mcp_plugin: 0,
    sandbox_blueprint: 0,
  };
  for (const item of items) {
    counts[item.kind] += 1;
  }
  return counts;
}

export function filterOfficialCatalog(input?: {
  kind?: CatalogKind | null;
  q?: string | null;
}): OfficialCatalogItem[] {
  const kind = input?.kind ?? null;
  const q = input?.q?.trim().toLowerCase() ?? "";

  return OFFICIAL_CATALOG_ITEMS.filter((item) => {
    if (kind && item.kind !== kind) return false;
    if (!q) return true;
    const hay = [
      item.name,
      item.slug,
      item.description,
      ...item.tags,
      ...item.capabilities,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function buildOfficialCatalogResponse(input?: {
  kind?: CatalogKind | null;
  q?: string | null;
}): OfficialCatalogResponse {
  const items = filterOfficialCatalog(input);
  return OfficialCatalogResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    cacheTtlSec: CATALOG_CACHE_TTL_SEC,
    counts: countCatalogByKind(items),
    items,
  });
}

export function getOfficialCatalogItemBySlug(
  slug: string
): OfficialCatalogItem | null {
  const key = slug.trim().toLowerCase();
  return (
    OFFICIAL_CATALOG_ITEMS.find((item) => item.slug.toLowerCase() === key) ??
    null
  );
}
