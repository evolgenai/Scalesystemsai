/**
 * GET  /api/marketplace/agents — seed/fetch agent node templates (category + q)
 * POST /api/marketplace/agents — SUPER_ADMIN publish community agent nodes
 *
 * Tenant isolation: requires x-workspace-key on every request.
 */

import { z } from "zod";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";
import { withEdgeCache } from "@/lib/edge/cacheControl";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const revalidate = 60;

const PublishAgentSchema = z.object({
  title: z.string().trim().min(1).max(255),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(128)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "slug must be lowercase kebab-case"
    ),
  description: z.string().trim().min(1).max(8_000),
  category: z.string().trim().min(1).max(100),
  author: z.string().trim().min(1).max(128).optional(),
  iconName: z.string().trim().min(1).max(64).default("Bot"),
  configSchema: z.record(z.string(), z.unknown()).default({}),
  isOfficial: z.boolean().optional(),
});

const OFFICIAL_SEED: Array<{
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
    title: "Web Scraper",
    slug: "official-web-scraper",
    description:
      "Fetch and extract structured content from a public http(s) URL.",
    category: "ingestion",
    author: "Scale Systems",
    iconName: "Globe",
    configSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        label: { type: "string" },
      },
      required: ["url"],
    },
    isOfficial: true,
  },
  {
    title: "Meta SRE Analyst",
    slug: "official-meta-sre",
    description:
      "Evaluate upstream workflow context and propose SRE recommendations.",
    category: "ops",
    author: "Scale Systems",
    iconName: "Shield",
    configSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        objective: { type: "string" },
        requiresApproval: { type: "boolean", default: false },
      },
    },
    isOfficial: true,
  },
  {
    title: "Discord Notifier",
    slug: "official-discord-notify",
    description: "Dispatch a Discord alert with workflow execution context.",
    category: "notify",
    author: "Scale Systems",
    iconName: "Bell",
    configSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        message: { type: "string" },
        requiresApproval: { type: "boolean", default: true },
      },
    },
    isOfficial: true,
  },
  {
    title: "Sandbox Runner",
    slug: "official-sandbox-runner",
    description: "Execute sealed JavaScript or Python inside the code sandbox.",
    category: "compute",
    author: "Scale Systems",
    iconName: "Terminal",
    configSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        language: { type: "string", enum: ["javascript", "python"] },
        requiresApproval: { type: "boolean", default: true },
      },
      required: ["code"],
    },
    isOfficial: true,
  },
  {
    title: "Ops Agent",
    slug: "official-ops-agent",
    description: "Persona-driven swarm agent that consumes upstream context.",
    category: "agents",
    author: "Scale Systems",
    iconName: "Bot",
    configSchema: {
      type: "object",
      properties: {
        persona: { type: "string" },
        prompt: { type: "string" },
        objective: { type: "string" },
        requiresApproval: { type: "boolean", default: false },
      },
    },
    isOfficial: true,
  },
];

const agentSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  category: true,
  author: true,
  iconName: true,
  configSchema: true,
  isOfficial: true,
  downloads: true,
  createdAt: true,
} as const;

async function ensureOfficialSeed(): Promise<number> {
  return withPrisma(async (db) => {
    const count = await db.marketplaceAgent.count();
    if (count > 0) return 0;

    const created = await db.marketplaceAgent.createMany({
      data: OFFICIAL_SEED.map((row) => ({
        ...row,
        configSchema: row.configSchema as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    return created.count;
  }, "marketplace.agents.seed");
}

/**
 * GET /api/marketplace/agents
 * Query: category, q, page, limit
 */
export async function GET(request: Request) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const url = new URL(request.url);
  const category = url.searchParams.get("category")?.trim() || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50)
  );

  try {
    await ensureOfficialSeed();

    const where: Prisma.MarketplaceAgentWhereInput = {
      ...(category
        ? { category: { equals: category, mode: "insensitive" } }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { author: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [agents, total] = await withPrisma(
      (db) =>
        Promise.all([
          db.marketplaceAgent.findMany({
            where,
            orderBy: [{ isOfficial: "desc" }, { downloads: "desc" }, { createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
            select: agentSelect,
          }),
          db.marketplaceAgent.count({ where }),
        ]),
      "marketplace.agents.list"
    );

    return apiSuccess(
      {
        data: agents,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          workspaceId: gate.workspaceId,
          category: category ?? null,
          q: q ?? null,
        },
      },
      200,
      withEdgeCache("marketplace", request.method)
    );
  } catch (err) {
    console.error("[api/marketplace/agents] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list marketplace agents.",
      "MARKETPLACE_AGENTS_LIST_FAILED",
      503
    );
  }
}

/**
 * POST /api/marketplace/agents
 * SUPER_ADMIN only — publish a community agent node template.
 */
export async function POST(request: Request) {
  const gate = await resolveWorkspaceGate(request, null, {
    requireWorkspace: true,
    requireApiKey: true,
  });
  if (!gate.ok) {
    return apiError(gate.message, gate.code, gate.status);
  }

  const profile = await resolveRequestUser(request);
  if (!profile.isSuperAdmin || profile.role !== "SUPER_ADMIN") {
    return apiError(
      "Forbidden. SUPER_ADMIN session required to publish agents.",
      "SUPER_ADMIN_REQUIRED",
      403
    );
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = PublishAgentSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid agent payload.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;

  try {
    const agent = await withPrisma(
      (db) =>
        db.marketplaceAgent.create({
          data: {
            title: body.title,
            slug: body.slug,
            description: body.description,
            category: body.category,
            author: body.author ?? profile.email ?? "community",
            iconName: body.iconName,
            configSchema: body.configSchema as Prisma.InputJsonValue,
            isOfficial: body.isOfficial ?? false,
          },
          select: agentSelect,
        }),
      "marketplace.agents.publish"
    );

    return apiSuccess(
      {
        data: agent,
        meta: { workspaceId: gate.workspaceId, publishedBy: profile.id },
      },
      201,
      {
        "x-workspace-bound": gate.workspaceId,
        "x-marketplace-agent-id": agent.id,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed.";
    if (message.includes("Unique constraint") || message.includes("slug")) {
      return apiError(
        "An agent with this slug already exists.",
        "MARKETPLACE_AGENT_SLUG_EXISTS",
        409
      );
    }
    console.error("[api/marketplace/agents] POST failed:", err);
    return apiError(message, "MARKETPLACE_AGENTS_PUBLISH_FAILED", 503);
  }
}
