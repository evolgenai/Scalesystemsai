/**
 * Spatial Universe object synthesis — morph 2+ nodes into a composite agent/tool alias.
 * Persists as a workspace-scoped AgentPlugin; charges SYNTHESIS_GAS_COST.
 */

import { getPrisma } from "@/lib/prisma";
import {
  deductGasUnits,
  InsufficientGasError,
  type DeductGasResult,
} from "@/lib/billing/gasMeter";

export const SYNTHESIS_GAS_COST = 250 as const;
export const MORPH_DEVELOPER_ID = "spatial-morph-engine" as const;

export type MorphRecipe = {
  keys: string[];
  id: string;
  name: string;
  status: string;
  capabilities: string[];
};

export type MorphedToolDefinition = {
  id: string;
  alias: string;
  name: string;
  status: string;
  sourceNodeIds: string[];
  capabilities: string[];
  category: "composite";
  version: string;
  mcpSchema: Record<string, unknown>;
  pluginId: string;
  gas: {
    charged: number;
    balanceBefore: number;
    balanceAfter: number;
    ledgerId: string | null;
  };
};

const RECIPES: MorphRecipe[] = [
  {
    keys: ["web-scraper", "llm-router"],
    id: "suite-intel-mesh",
    name: "Intel Harvest Suite",
    status: "Scrape → route → synthesize",
    capabilities: ["scrape", "llm_route", "synthesize"],
  },
  {
    keys: ["blackeye", "recon-agent"],
    id: "suite-ops-terminal",
    name: "Ops Recon Terminal",
    status: "blackeye × recon bonded",
    capabilities: ["github_script", "recon", "terminal"],
  },
  {
    keys: ["blackeye", "ai-summarizer"],
    id: "suite-blackeye-summarizer",
    name: "Blackeye Intel Summarizer",
    status: "blackeye × AI summarizer fused",
    capabilities: ["github_script", "summarize", "report"],
  },
  {
    keys: ["slack-bot", "llm-router"],
    id: "suite-comms-brain",
    name: "Comms Brain Suite",
    status: "Slack ↔ LLM bridge live",
    capabilities: ["slack", "llm_route", "bridge"],
  },
  {
    keys: ["quantum-tpu", "vault-core"],
    id: "suite-secure-compute",
    name: "Secure Compute Cluster",
    status: "TPU + vault sealed",
    capabilities: ["secure_compute", "vault"],
  },
  {
    keys: ["edge-router", "vault-core"],
    id: "suite-edge-vault",
    name: "Edge Vault Gateway",
    status: "Encrypted edge path",
    capabilities: ["edge", "vault", "gateway"],
  },
  {
    keys: ["github-terminal", "recon-agent"],
    id: "suite-devsec",
    name: "DevSec Script Forge",
    status: "GitHub × recon fused",
    capabilities: ["github_script", "recon", "devsec"],
  },
];

/** Strip optional `node-` prefix and normalize casing/separators. */
export function normalizeSpatialNodeId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^node[-_]/, "")
    .replace(/\s+/g, "-");
}

export function resolveMorphRecipe(sourceNodeIds: string[]): MorphRecipe {
  const normalized = [
    ...new Set(sourceNodeIds.map(normalizeSpatialNodeId).filter(Boolean)),
  ].sort();

  if (normalized.length < 2) {
    throw new Error("At least two source node IDs are required to morph.");
  }

  const set = new Set(normalized);
  for (const recipe of RECIPES) {
    if (recipe.keys.every((k) => set.has(k))) {
      return recipe;
    }
  }

  const keys = normalized.slice(0, 2);
  return {
    keys,
    id: `suite-${keys.join("-")}`,
    name: "Composite Tool Suite",
    status: `${normalized.length} nodes synthesized`,
    capabilities: ["composite", ...keys],
  };
}

function buildAlias(recipe: MorphRecipe, sourceNodeIds: string[]): string {
  const stamp = sourceNodeIds
    .map(normalizeSpatialNodeId)
    .sort()
    .join("_")
    .slice(0, 48);
  return `morph.${recipe.id}.${stamp}`;
}

function buildMcpSchema(
  recipe: MorphRecipe,
  alias: string,
  sourceNodeIds: string[]
): Record<string, unknown> {
  return {
    name: alias,
    description: recipe.status,
    category: "composite",
    sourceNodeIds: sourceNodeIds.map(normalizeSpatialNodeId),
    capabilities: recipe.capabilities,
    tools: [
      {
        name: alias,
        description: `${recipe.name} — synthesized spatial composite`,
        inputSchema: {
          type: "object",
          properties: {
            objective: { type: "string" },
            context: { type: "object" },
          },
          required: ["objective"],
        },
      },
    ],
  };
}

/**
 * Deduct synthesis Gas and upsert the morphed tool as a workspace AgentPlugin.
 */
export async function synthesizeMorphedTool(input: {
  workspaceId: string;
  sourceNodeIds: string[];
}): Promise<MorphedToolDefinition> {
  const recipe = resolveMorphRecipe(input.sourceNodeIds);
  const sources = [
    ...new Set(input.sourceNodeIds.map(normalizeSpatialNodeId).filter(Boolean)),
  ];
  const alias = buildAlias(recipe, sources);
  const mcp = buildMcpSchema(recipe, alias, sources);
  const pluginName = `${recipe.name} (${alias})`;

  let gas: DeductGasResult;
  try {
    gas = await deductGasUnits(input.workspaceId, SYNTHESIS_GAS_COST, {
      gasKind: "ai_agent",
      nodeType: "spatial_morph",
      description: `Spatial object synthesis — ⚡ ${SYNTHESIS_GAS_COST} GAS · ${alias}`,
    });
  } catch (err) {
    if (err instanceof InsufficientGasError) throw err;
    throw err;
  }

  const prisma = getPrisma();
  const existing = await prisma.agentPlugin.findFirst({
    where: {
      workspaceId: input.workspaceId,
      developerId: MORPH_DEVELOPER_ID,
      name: pluginName,
    },
    select: { id: true },
  });

  const plugin = existing
    ? await prisma.agentPlugin.update({
        where: { id: existing.id },
        data: {
          mcpSchema: JSON.stringify(mcp),
          description: recipe.status,
          version: "1.0.0",
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          version: true,
          description: true,
        },
      })
    : await prisma.agentPlugin.create({
        data: {
          name: pluginName,
          developerId: MORPH_DEVELOPER_ID,
          workspaceId: input.workspaceId,
          pricePerRun: 0,
          mcpSchema: JSON.stringify(mcp),
          version: "1.0.0",
          description: recipe.status,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          version: true,
          description: true,
        },
      });

  return {
    id: recipe.id,
    alias,
    name: recipe.name,
    status: recipe.status,
    sourceNodeIds: sources,
    capabilities: recipe.capabilities,
    category: "composite",
    version: plugin.version,
    mcpSchema: mcp,
    pluginId: plugin.id,
    gas: {
      charged: gas.amount,
      balanceBefore: gas.balanceBefore,
      balanceAfter: gas.balanceAfter,
      ledgerId: gas.ledgerId,
    },
  };
}
