"use client";

import { useWorkspacePresence } from "@/lib/org/useWorkspacePresence";

type WorkspaceActivityFeedProps = {
  className?: string;
};

export default function WorkspaceActivityFeed({
  className = "",
}: WorkspaceActivityFeedProps) {
  const { orgId, feedLine, notices } = useWorkspacePresence();

  if (!orgId) return null;

  const latestNotice = notices[notices.length - 1] ?? null;

  return (
    <div className={`relative ${className}`}>
      {feedLine ? (
        <p className="truncate font-mono text-[10px] text-slate-muted">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-accent align-middle" />
          {feedLine}
        </p>
      ) : (
        <p className="truncate font-mono text-[10px] text-slate-dim">
          Team presence channel idle
        </p>
      )}

      {latestNotice ? (
        <div
          key={latestNotice.id}
          role="status"
          className="absolute right-0 top-full z-20 mt-2 w-max max-w-[18rem] rounded-xl border border-amber-400/30 bg-[#0b0f17]/95 px-3 py-2 text-[11px] text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.18)] backdrop-blur-md"
        >
          {latestNotice.message}
        </div>
      ) : null}
    </div>
  );
}
