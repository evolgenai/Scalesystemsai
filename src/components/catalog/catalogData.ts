import {
  Activity,
  Box,
  Cpu,
  HeartPulse,
  Plug,
  Radio,
  type LucideIcon,
} from "lucide-react";

export type CatalogCategory =
  | "all"
  | "agent-blueprints"
  | "mcp-tools"
  | "sandboxes";

export type CatalogCta = "deploy" | "connect";

export type CatalogItem = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: Exclude<CatalogCategory, "all">;
  cta: CatalogCta;
  badge?: string;
  accent: string;
  icon: LucideIcon;
  highlights: string[];
  preview: {
    headline: string;
    steps: string[];
    endpoint?: string;
    runtime?: string;
  };
  featured?: boolean;
};

export const CATALOG_TABS: {
  id: CatalogCategory;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "agent-blueprints", label: "Agent Blueprints" },
  { id: "mcp-tools", label: "MCP Tools" },
  { id: "sandboxes", label: "Sandboxes" },
];

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "meta-sre-auto-healing",
    name: "Meta-SRE Auto-Healing Agent",
    tagline: "Diagnose degraded lanes and apply policy-safe remediations.",
    description:
      "Watches swarm health, correlates incidents with Sentry telemetry, and rolls safe heal actions without human babysitting.",
    category: "agent-blueprints",
    cta: "deploy",
    badge: "Featured",
    accent: "emerald",
    icon: HeartPulse,
    featured: true,
    highlights: [
      "Auto-classify incident severity",
      "Policy-gated remediation playbooks",
      "Hot-reload failed agent panels",
    ],
    preview: {
      headline: "Deploy Meta-SRE into your workspace swarm",
      steps: [
        "Attach to SwarmSession with HITL pause gates",
        "Subscribe to telemetry + Sentry issue streams",
        "Execute heal tools when severity ≥ warn",
      ],
      endpoint: "/api/sre/meta-evolution",
      runtime: "Systems Orchestrator · Gemini",
    },
  },
  {
    id: "sentry-telemetry-mcp",
    name: "Sentry Telemetry MCP Connector",
    tagline: "Bridge live Sentry events into agent tool context.",
    description:
      "MCP host that surfaces org issues, replays, and performance spans so agents can reason over real production signals.",
    category: "mcp-tools",
    cta: "connect",
    badge: "MCP",
    accent: "cyan",
    icon: Plug,
    featured: true,
    highlights: [
      "Issue search + Seer analysis hooks",
      "Replay session deep-links",
      "Workspace-scoped API credentials",
    ],
    preview: {
      headline: "Connect Sentry Telemetry MCP",
      steps: [
        "Register MCP host with streamable HTTP transport",
        "Authorize org + project scopes",
        "Expose find_issues / analyze tools to agents",
      ],
      endpoint: "/api/mcp",
      runtime: "MCP · streamable HTTP / SSE",
    },
  },
  {
    id: "persistent-sandboxes",
    name: "Persistent Node/Python Sandboxes",
    tagline: "Long-lived runtimes that survive agent turn boundaries.",
    description:
      "Provision Node or Python sandboxes with durable filesystem state for multi-step coding, evals, and recovery loops.",
    category: "sandboxes",
    cta: "deploy",
    badge: "Runtime",
    accent: "amber",
    icon: Box,
    featured: true,
    highlights: [
      "Node 22 & Python 3.12 images",
      "Snapshot + restore across sessions",
      "Cron cleanup with retention policies",
    ],
    preview: {
      headline: "Deploy a persistent sandbox",
      steps: [
        "Choose Node or Python runtime profile",
        "Mount workspace vault secrets",
        "Keep session warm across SSE agent turns",
      ],
      endpoint: "/api/sandbox/persistent",
      runtime: "E2B-style · persistent store",
    },
  },
  {
    id: "sse-stream-diagnostics",
    name: "SSE Stream Diagnostics",
    tagline: "Inspect heartbeats, stalls, and frame latency on live buses.",
    description:
      "Diagnostic agent blueprint that probes telemetry and agent SSE channels, flags timeouts, and suggests reconnect strategies.",
    category: "agent-blueprints",
    cta: "deploy",
    badge: "Ops",
    accent: "emerald",
    icon: Radio,
    featured: true,
    highlights: [
      "Heartbeat + stall detection",
      "Frame latency histograms",
      "One-click Retry Connection UX",
    ],
    preview: {
      headline: "Deploy SSE Stream Diagnostics",
      steps: [
        "Attach probes to /api/telemetry/stream",
        "Sample agent execute SSE frames",
        "Surface reconnect CTAs on client fallover",
      ],
      endpoint: "/api/telemetry/stream",
      runtime: "SSE · text/event-stream",
    },
  },
  {
    id: "swarm-orchestrator-blueprint",
    name: "Swarm Orchestrator Blueprint",
    tagline: "Multi-agent debate + tool routing starter kit.",
    description:
      "Creator → Critic debate loop with sandbox tools, persona presets, and HITL approval gates.",
    category: "agent-blueprints",
    cta: "deploy",
    accent: "emerald",
    icon: Cpu,
    highlights: [
      "Persona preset library",
      "HITL pause / resume",
      "Gas-metered tool calls",
    ],
    preview: {
      headline: "Deploy Swarm Orchestrator",
      steps: [
        "Pick Creator / Critic personas",
        "Enable sandbox tools registry",
        "Stream turns over /api/agents/stream",
      ],
      endpoint: "/api/agents/stream",
      runtime: "SwarmSession · SSE",
    },
  },
  {
    id: "heal-mcp-toolkit",
    name: "Heal MCP Toolkit",
    tagline: "Remediation tools exposed as MCP capabilities.",
    description:
      "Package of MCP tools for restarting lanes, clearing caches, and replaying failed webhook deliveries.",
    category: "mcp-tools",
    cta: "connect",
    accent: "cyan",
    icon: Activity,
    highlights: [
      "Lane restart / drain",
      "Webhook replay",
      "Cache invalidate primitives",
    ],
    preview: {
      headline: "Connect Heal MCP Toolkit",
      steps: [
        "Install toolkit into workspace MCP registry",
        "Bind RBAC heal permissions",
        "Allow Meta-SRE to invoke tools",
      ],
      endpoint: "/api/integrations",
      runtime: "MCP · healAgent tools",
    },
  },
  {
    id: "ephemeral-eval-sandbox",
    name: "Ephemeral Eval Sandbox",
    tagline: "Disposable runtimes for one-shot agent evals.",
    description:
      "Spin up short-lived Node/Python sandboxes that auto-destroy after the eval window — ideal for CI probes.",
    category: "sandboxes",
    cta: "deploy",
    accent: "amber",
    icon: Box,
    highlights: [
      "TTL-based teardown",
      "Isolated network profile",
      "Stdout / stderr capture",
    ],
    preview: {
      headline: "Deploy ephemeral eval sandbox",
      steps: [
        "Request sandbox via execute API",
        "Run eval script with timeout budget",
        "Collect artifacts then destroy",
      ],
      endpoint: "/api/sandbox/execute",
      runtime: "Ephemeral · auto-cleanup",
    },
  },
];

export function filterCatalogItems(
  items: CatalogItem[],
  category: CatalogCategory
): CatalogItem[] {
  if (category === "all") return items;
  return items.filter((item) => item.category === category);
}

export function countByCategory(
  items: CatalogItem[],
  category: CatalogCategory
): number {
  return filterCatalogItems(items, category).length;
}
