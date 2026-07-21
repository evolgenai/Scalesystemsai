/**
 * Public, JSON-serializable workflow template catalog for edge-cached GETs.
 * Kept free of React / lucide imports so the API route stays lightweight.
 */

export type PublicWorkflowTemplate = {
  id: string;
  name: string;
  blurb: string;
  nodeCount: number;
  edgeCount: number;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
      kind: string;
      variant: string;
      label: string;
      description: string;
      params: Record<string, string>;
      status: string;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    animated: boolean;
  }>;
};

export const PUBLIC_WORKFLOW_TEMPLATES: PublicWorkflowTemplate[] = [
  {
    id: "auto-scrape-stock",
    name: "Auto-Scrape & Stock Sync",
    blurb: "Schedule scrape → extract inventory → sync store stock.",
    nodeCount: 3,
    edgeCount: 2,
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
      {
        id: "e1",
        source: "t1",
        target: "a1",
        type: "glowing",
        animated: false,
      },
      {
        id: "e2",
        source: "a1",
        target: "x1",
        type: "glowing",
        animated: false,
      },
    ],
  },
  {
    id: "sre-discord",
    name: "SRE Health Monitor to Discord",
    blurb: "Event trigger → SRE repair → Discord ops alert.",
    nodeCount: 3,
    edgeCount: 2,
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
          params: { topic: "agent.health.degraded", filter: "severity>=warn" },
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
          label: "SRE Repair Agent",
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
      {
        id: "e3",
        source: "t2",
        target: "a2",
        type: "glowing",
        animated: false,
      },
      {
        id: "e4",
        source: "a2",
        target: "x2",
        type: "glowing",
        animated: false,
      },
    ],
  },
  {
    id: "multi-agent-content",
    name: "Multi-Agent Content Pipeline",
    blurb: "Webhook → scrape → summarize → API publish.",
    nodeCount: 4,
    edgeCount: 3,
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
          label: "Summarizer Agent",
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
      {
        id: "e5",
        source: "t3",
        target: "a3",
        type: "glowing",
        animated: false,
      },
      {
        id: "e6",
        source: "a3",
        target: "a4",
        type: "glowing",
        animated: false,
      },
      {
        id: "e7",
        source: "a4",
        target: "x3",
        type: "glowing",
        animated: false,
      },
    ],
  },
];

export function listPublicWorkflowTemplates(): PublicWorkflowTemplate[] {
  return PUBLIC_WORKFLOW_TEMPLATES;
}
