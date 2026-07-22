"use client";

import { Radio } from "lucide-react";
import ConnectionFallback from "@/components/ui/ConnectionFallback";

type SseConnectionFallbackProps = {
  onRetry: () => void;
  compact?: boolean;
  detail?: string;
  title?: string;
  description?: string;
};

/**
 * User-facing fallback when an SSE / agent stream drops.
 */
export default function SseConnectionFallback({
  onRetry,
  compact = false,
  detail,
  title = "Live stream disconnected",
  description = "The SSE channel stalled or closed. Retry Connection to reopen the event stream.",
}: SseConnectionFallbackProps) {
  return (
    <ConnectionFallback
      icon={Radio}
      title={title}
      description={description}
      detail={detail}
      onRetry={onRetry}
      compact={compact}
    />
  );
}
