import { Target, Workflow, Headphones, type LucideIcon } from "lucide-react";
import type { AgentId } from "./types";

export type AgentConfig = {
  id: AgentId;
  name: string;
  shortName: string;
  feedName: string;
  tagline: string;
  icon: LucideIcon;
  iconColor: string;
  uptime: string;
  health: "healthy" | "degraded" | "offline";
  tasksToday: number;
};

export const AGENTS: AgentConfig[] = [
  {
    id: "lead-sentinel",
    name: "Lead Qualification Sentinel",
    shortName: "Lead Sentinel",
    feedName: "Lead Sentinel",
    tagline: "Autonomous inbound revenue pipeline optimizer",
    icon: Target,
    iconColor: "text-cyan-accent",
    uptime: "99.97%",
    health: "healthy",
    tasksToday: 847,
  },
  {
    id: "ops-orchestrator",
    name: "Enterprise Systems Orchestrator",
    shortName: "Systems Orchestrator",
    feedName: "Systems Orchestrator",
    tagline: "Cross-platform data sync & workflow automation",
    icon: Workflow,
    iconColor: "text-purple-400",
    uptime: "99.91%",
    health: "healthy",
    tasksToday: 312,
  },
  {
    id: "support-specialist",
    name: "24/7 Technical Support Specialist",
    shortName: "Support Specialist",
    feedName: "Support Specialist",
    tagline: "Context-aware L1 & L2 autonomous issue resolver",
    icon: Headphones,
    iconColor: "text-blue-400",
    uptime: "99.84%",
    health: "degraded",
    tasksToday: 156,
  },
];

export const INITIAL_AGENT_STATES: Record<AgentId, boolean> = {
  "lead-sentinel": true,
  "ops-orchestrator": true,
  "support-specialist": false,
};
