"use client";

import type { NodeProps } from "@xyflow/react";
import { Clock, Radio, Webhook } from "lucide-react";
import BlueprintNodeShell from "@/components/builder/nodes/BlueprintNodeShell";
import type { BlueprintNodeData, TriggerVariant } from "@/components/builder/types";

const ICONS: Record<TriggerVariant, typeof Webhook> = {
  webhook: Webhook,
  schedule: Clock,
  event: Radio,
};

export default function TriggerNode(props: NodeProps) {
  const data = props.data as BlueprintNodeData;
  const variant = (data.variant as TriggerVariant) || "webhook";
  return (
    <BlueprintNodeShell
      {...props}
      data={data}
      icon={ICONS[variant] ?? Webhook}
      kindLabel="Trigger"
    />
  );
}
