import {
  Globe2,
  ShieldCheck,
  PenLine,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type PersonaAccent = "cyan" | "purple" | "amber" | "emerald";

export type AgentPersonaPreset = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: PersonaAccent;
  /** Default system instruction associated with this preset. */
  systemPrompt: string;
};

export const PERSONA_ACCENT_CLASSES: Record<
  PersonaAccent,
  {
    border: string;
    borderActive: string;
    glow: string;
    iconWrap: string;
    icon: string;
    ring: string;
  }
> = {
  cyan: {
    border: "border-cyan-accent/25 hover:border-cyan-accent/50",
    borderActive: "border-cyan-accent/60",
    glow: "hover:shadow-[0_0_28px_rgba(0,242,254,0.18)]",
    iconWrap: "bg-cyan-accent/10 border-cyan-accent/30",
    icon: "text-cyan-accent",
    ring: "ring-cyan-accent/40",
  },
  purple: {
    border: "border-violet-400/25 hover:border-violet-400/50",
    borderActive: "border-violet-400/60",
    glow: "hover:shadow-[0_0_28px_rgba(167,139,250,0.2)]",
    iconWrap: "bg-violet-400/10 border-violet-400/30",
    icon: "text-violet-300",
    ring: "ring-violet-400/40",
  },
  amber: {
    border: "border-amber-400/25 hover:border-amber-400/50",
    borderActive: "border-amber-400/60",
    glow: "hover:shadow-[0_0_28px_rgba(251,191,36,0.18)]",
    iconWrap: "bg-amber-400/10 border-amber-400/30",
    icon: "text-amber-300",
    ring: "ring-amber-400/40",
  },
  emerald: {
    border: "border-emerald-400/25 hover:border-emerald-400/50",
    borderActive: "border-emerald-400/60",
    glow: "hover:shadow-[0_0_28px_rgba(52,211,153,0.18)]",
    iconWrap: "bg-emerald-400/10 border-emerald-400/30",
    icon: "text-emerald-300",
    ring: "ring-emerald-400/40",
  },
};

export const AGENT_PERSONA_PRESETS: AgentPersonaPreset[] = [
  {
    id: "web-crawler-research",
    title: "Web Crawler & Research",
    description:
      "Scrapes sources, synthesizes findings, and returns evidence-backed briefs.",
    icon: Globe2,
    accent: "cyan",
    systemPrompt:
      "You are a Web Crawler & Research Specialist. Prioritize accurate source gathering, cite findings, and produce structured research digests.",
  },
  {
    id: "cybersecurity-auditor",
    title: "Cybersecurity Auditor",
    description:
      "Reviews code and configs for vulnerabilities, threat paths, and hardening gaps.",
    icon: ShieldCheck,
    accent: "purple",
    systemPrompt:
      "You are a Cybersecurity Code Auditor. Focus on exploit paths, insecure patterns, secrets exposure, and concrete remediation steps.",
  },
  {
    id: "marketing-copywriter",
    title: "Marketing & Copywriter",
    description:
      "Crafts conversion-ready messaging, hooks, and campaign narratives.",
    icon: PenLine,
    accent: "amber",
    systemPrompt:
      "You are a Marketing & Copywriter Expert. Produce clear, persuasive copy with strong hooks, audience fit, and measurable CTA guidance.",
  },
  {
    id: "systems-orchestrator",
    title: "Systems Orchestrator",
    description:
      "Coordinates multi-step workflows across tools, APIs, and agent handoffs.",
    icon: Workflow,
    accent: "emerald",
    systemPrompt:
      "You are a Systems Orchestrator. Decompose objectives into parallel worker tasks, manage handoffs, and keep execution deterministic.",
  },
];

export const DEFAULT_PERSONA_ID = AGENT_PERSONA_PRESETS[0]!.id;
