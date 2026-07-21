/**
 * Default Instant Sandbox workflow blueprints.
 * Server-safe (no React / lucide imports).
 */

import type { Prisma } from "@prisma/client";

export type DemoBlueprintSeed = {
  title: string;
  description: string;
  nodes: Prisma.InputJsonValue;
  edges: Prisma.InputJsonValue;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function node(
  id: string,
  type: string,
  x: number,
  y: number,
  data: Record<string, unknown>
) {
  return { id, type, position: { x, y }, data };
}

function edge(id: string, source: string, target: string) {
  return { id, source, target, type: "glowing", animated: false };
}

/** Web Scraper · schedule → scrape → API publish */
const WEB_SCRAPER: DemoBlueprintSeed = {
  title: "Web Scraper",
  description:
    "Scheduled Playwright scrape that extracts structured fields and posts results downstream.",
  nodes: asJson([
    node("ws-t1", "trigger", 40, 140, {
      kind: "trigger",
      variant: "schedule",
      label: "Schedule Trigger",
      description: "Every 15 minutes",
      params: { cron: "*/15 * * * *", timezone: "UTC" },
      status: "idle",
    }),
    node("ws-a1", "agent", 300, 140, {
      kind: "agent",
      variant: "scraper",
      label: "Playwright Scraper Bot",
      description: "Headless scrape + extract",
      params: {
        url: "https://example.com",
        selector: "main",
      },
      status: "idle",
    }),
    node("ws-x1", "action", 580, 140, {
      kind: "action",
      variant: "api",
      label: "API Webhook",
      description: "Forward scrape payload",
      params: {
        url: "https://hooks.example.dev/scrape",
        method: "POST",
      },
      status: "idle",
    }),
  ]),
  edges: asJson([
    edge("ws-e1", "ws-t1", "ws-a1"),
    edge("ws-e2", "ws-a1", "ws-x1"),
  ]),
};

/** AI Summarizer · webhook → summarize → Discord */
const AI_SUMMARIZER: DemoBlueprintSeed = {
  title: "AI Summarizer",
  description:
    "Inbound webhook content condensed into an ops brief and pushed to Discord.",
  nodes: asJson([
    node("ai-t1", "trigger", 40, 140, {
      kind: "trigger",
      variant: "webhook",
      label: "Webhook Trigger",
      description: "POST /hooks/summarize",
      params: { path: "/hooks/summarize", method: "POST" },
      status: "idle",
    }),
    node("ai-a1", "agent", 300, 140, {
      kind: "agent",
      variant: "summarizer",
      label: "Summarizer Agent",
      description: "Ops brief digest",
      params: { style: "ops-brief", maxTokens: "512" },
      status: "idle",
    }),
    node("ai-x1", "action", 580, 140, {
      kind: "action",
      variant: "discord",
      label: "Discord Alert",
      description: "Notify #summaries",
      params: { channel: "#summaries", severity: "info" },
      status: "idle",
    }),
  ]),
  edges: asJson([
    edge("ai-e1", "ai-t1", "ai-a1"),
    edge("ai-e2", "ai-a1", "ai-x1"),
  ]),
};

/** Slack Router · event → SRE triage → Discord (Slack-style ops router) */
const SLACK_ROUTER: DemoBlueprintSeed = {
  title: "Slack Router",
  description:
    "Ops event bus → SRE triage → routed alert channel (Slack/Discord bridge pattern).",
  nodes: asJson([
    node("sr-t1", "trigger", 40, 140, {
      kind: "trigger",
      variant: "event",
      label: "Event Trigger",
      description: "slack.message.inbound",
      params: {
        topic: "slack.message.inbound",
        filter: "channel=#ops",
      },
      status: "idle",
    }),
    node("sr-a1", "agent", 300, 140, {
      kind: "agent",
      variant: "sre",
      label: "SRE Repair Agent",
      description: "Classify + route intent",
      params: { policy: "safe-heal", budget: "2" },
      status: "idle",
    }),
    node("sr-x1", "action", 580, 140, {
      kind: "action",
      variant: "discord",
      label: "Discord Alert",
      description: "Route to #ops-router",
      params: { channel: "#ops-router", severity: "warning" },
      status: "idle",
    }),
  ]),
  edges: asJson([
    edge("sr-e1", "sr-t1", "sr-a1"),
    edge("sr-e2", "sr-a1", "sr-x1"),
  ]),
};

export const DEMO_SANDBOX_BLUEPRINTS: readonly DemoBlueprintSeed[] = [
  WEB_SCRAPER,
  AI_SUMMARIZER,
  SLACK_ROUTER,
] as const;

export const DEMO_GAS_GRANT = 10_000;
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
export const DEMO_EMAIL_DOMAIN = "demo.scalesystems.local";
