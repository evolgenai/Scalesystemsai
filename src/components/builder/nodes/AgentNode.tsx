"use client";

import type { NodeProps } from "@xyflow/react";
import { Bot, FileText, Shield } from "lucide-react";
import BlueprintNodeShell from "@/components/builder/nodes/BlueprintNodeShell";
import type { AgentVariant, BlueprintNodeData } from "@/components/builder/types";

const ICONS: Record<AgentVariant, typeof Bot> = {
  scraper: Bot,
  summarizer: FileText,
  sre: Shield,
};

export default function AgentNode(props: NodeProps) {
  const data = props.data as BlueprintNodeData;
  const variant = (data.variant as AgentVariant) || "scraper";
  return (
    <BlueprintNodeShell
      {...props}
      data={data}
      icon={ICONS[variant] ?? Bot}
      kindLabel="Agent"
    />
  );
}
