"use client";

import type { NodeProps } from "@xyflow/react";
import { MessageSquare, Package, Webhook } from "lucide-react";
import BlueprintNodeShell from "@/components/builder/nodes/BlueprintNodeShell";
import type { ActionVariant, BlueprintNodeData } from "@/components/builder/types";

const ICONS: Record<ActionVariant, typeof MessageSquare> = {
  discord: MessageSquare,
  inventory: Package,
  api: Webhook,
};

export default function ActionNode(props: NodeProps) {
  const data = props.data as BlueprintNodeData;
  const variant = (data.variant as ActionVariant) || "discord";
  return (
    <BlueprintNodeShell
      {...props}
      data={data}
      icon={ICONS[variant] ?? MessageSquare}
      kindLabel="Action"
    />
  );
}
