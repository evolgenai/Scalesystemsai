import {
  Bot,
  Clock,
  FileText,
  MessageSquare,
  Package,
  Radio,
  Shield,
  Webhook,
} from "lucide-react";
import type {
  BlueprintEdge,
  BlueprintNode,
  PaletteItem,
  WorkflowTemplate,
} from "@/components/builder/types";

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    id: "trigger-webhook",
    kind: "trigger",
    variant: "webhook",
    label: "Webhook Trigger",
    description: "Fire when an HTTP webhook is received.",
    defaults: { path: "/hooks/inbound", method: "POST" },
    icon: Webhook,
  },
  {
    id: "trigger-schedule",
    kind: "trigger",
    variant: "schedule",
    label: "Schedule Trigger",
    description: "Cron-based schedule for recurring runs.",
    defaults: { cron: "*/15 * * * *", timezone: "UTC" },
    icon: Clock,
  },
  {
    id: "trigger-event",
    kind: "trigger",
    variant: "event",
    label: "Event Trigger",
    description: "Listen for platform or bus events.",
    defaults: { topic: "agent.health.degraded", filter: "severity>=warn" },
    icon: Radio,
  },
  {
    id: "agent-scraper",
    kind: "agent",
    variant: "scraper",
    label: "Playwright Scraper Bot",
    description: "Headless scrape + structured extract.",
    defaults: { url: "https://example.com", selector: "main" },
    icon: Bot,
  },
  {
    id: "agent-summarizer",
    kind: "agent",
    variant: "summarizer",
    label: "Summarizer Agent",
    description: "Condense payloads into actionable briefs.",
    defaults: { style: "ops-brief", maxTokens: "512" },
    icon: FileText,
  },
  {
    id: "agent-sre",
    kind: "agent",
    variant: "sre",
    label: "SRE Repair Agent",
    description: "Diagnose incidents and apply safe remediations.",
    defaults: { policy: "safe-heal", budget: "3" },
    icon: Shield,
  },
  {
    id: "action-discord",
    kind: "action",
    variant: "discord",
    label: "Discord Alert",
    description: "Push rich alerts to a Discord webhook.",
    defaults: { channel: "#ops-alerts", severity: "warning" },
    icon: MessageSquare,
  },
  {
    id: "action-inventory",
    kind: "action",
    variant: "inventory",
    label: "E-Commerce Inventory Update",
    description: "Sync stock levels into the catalog.",
    defaults: { skuField: "sku", stockField: "qty" },
    icon: Package,
  },
  {
    id: "action-api",
    kind: "action",
    variant: "api",
    label: "API Webhook",
    description: "POST results to an external endpoint.",
    defaults: { url: "https://api.partner.dev/hooks", method: "POST" },
    icon: Webhook,
  },
];

function n(
  id: string,
  type: BlueprintNode["type"],
  x: number,
  y: number,
  data: BlueprintNode["data"]
): BlueprintNode {
  return { id, type, position: { x, y }, data };
}

function e(id: string, source: string, target: string): BlueprintEdge {
  return {
    id,
    source,
    target,
    type: "glowing",
    animated: false,
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "auto-scrape-stock",
    name: "Auto-Scrape & Stock Sync",
    blurb: "Schedule scrape → extract inventory → sync store stock.",
    nodes: [
      n("t1", "trigger", 40, 140, {
        kind: "trigger",
        variant: "schedule",
        label: "Schedule Trigger",
        description: "Every 15 minutes",
        params: { cron: "*/15 * * * *", timezone: "UTC" },
        status: "idle",
      }),
      n("a1", "agent", 300, 140, {
        kind: "agent",
        variant: "scraper",
        label: "Playwright Scraper Bot",
        description: "Pull product stock pages",
        params: { url: "https://vendor.example/stock", selector: ".sku-row" },
        status: "idle",
      }),
      n("x1", "action", 580, 140, {
        kind: "action",
        variant: "inventory",
        label: "E-Commerce Inventory Update",
        description: "Write qty into catalog",
        params: { skuField: "sku", stockField: "qty" },
        status: "idle",
      }),
    ],
    edges: [e("e1", "t1", "a1"), e("e2", "a1", "x1")],
  },
  {
    id: "sre-discord",
    name: "SRE Health Monitor to Discord",
    blurb: "Event trigger → SRE repair → Discord ops alert.",
    nodes: [
      n("t2", "trigger", 40, 140, {
        kind: "trigger",
        variant: "event",
        label: "Event Trigger",
        description: "agent.health.degraded",
        params: { topic: "agent.health.degraded", filter: "severity>=warn" },
        status: "idle",
      }),
      n("a2", "agent", 300, 140, {
        kind: "agent",
        variant: "sre",
        label: "SRE Repair Agent",
        description: "Diagnose + safe heal",
        params: { policy: "safe-heal", budget: "3" },
        status: "idle",
      }),
      n("x2", "action", 580, 140, {
        kind: "action",
        variant: "discord",
        label: "Discord Alert",
        description: "Notify #ops-alerts",
        params: { channel: "#ops-alerts", severity: "warning" },
        status: "idle",
      }),
    ],
    edges: [e("e3", "t2", "a2"), e("e4", "a2", "x2")],
  },
  {
    id: "multi-agent-content",
    name: "Multi-Agent Content Pipeline",
    blurb: "Webhook → scrape → summarize → API publish.",
    nodes: [
      n("t3", "trigger", 20, 160, {
        kind: "trigger",
        variant: "webhook",
        label: "Webhook Trigger",
        description: "POST /hooks/content",
        params: { path: "/hooks/content", method: "POST" },
        status: "idle",
      }),
      n("a3", "agent", 260, 80, {
        kind: "agent",
        variant: "scraper",
        label: "Playwright Scraper Bot",
        description: "Collect source articles",
        params: { url: "https://news.example", selector: "article" },
        status: "idle",
      }),
      n("a4", "agent", 260, 240, {
        kind: "agent",
        variant: "summarizer",
        label: "Summarizer Agent",
        description: "Ops brief digest",
        params: { style: "ops-brief", maxTokens: "512" },
        status: "idle",
      }),
      n("x3", "action", 540, 160, {
        kind: "action",
        variant: "api",
        label: "API Webhook",
        description: "Publish to CMS",
        params: { url: "https://api.cms.dev/hooks", method: "POST" },
        status: "idle",
      }),
    ],
    edges: [
      e("e5", "t3", "a3"),
      e("e6", "a3", "a4"),
      e("e7", "a4", "x3"),
    ],
  },
];

export function createNodeFromPalette(
  item: PaletteItem,
  position: { x: number; y: number },
  id: string
): BlueprintNode {
  return {
    id,
    type: item.kind,
    position,
    data: {
      kind: item.kind,
      variant: item.variant,
      label: item.label,
      description: item.description,
      params: { ...item.defaults },
      status: "idle",
    },
  };
}
