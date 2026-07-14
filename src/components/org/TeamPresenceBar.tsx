"use client";

import {
  useWorkspacePresence,
  type PresenceMember,
} from "@/lib/org/useWorkspacePresence";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

function ringClass(member: PresenceMember): string {
  if (member.currentActivity === "typing") {
    return "ring-cyan-accent/70 shadow-[0_0_12px_rgba(0,242,254,0.35)]";
  }
  if (member.currentActivity === "spectating") {
    return "ring-emerald-400/70 shadow-[0_0_12px_rgba(52,211,153,0.3)]";
  }
  return "ring-emerald-400/40";
}

export default function TeamPresenceBar() {
  const {
    orgId,
    visibleMembers,
    overflowCount,
    activityLabelFor,
  } = useWorkspacePresence();

  if (!orgId || visibleMembers.length === 0) return null;

  return (
    <div
      className="hidden items-center sm:flex"
      aria-label="Live team presence"
    >
      <div className="flex items-center -space-x-2">
        {visibleMembers.map((member) => (
          <div key={member.userId} className="group relative">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#09090b] bg-gradient-to-br from-white/10 to-white/[0.03] font-mono text-[10px] font-semibold text-white ring-2 ${ringClass(member)}`}
              aria-label={`${member.name} — ${activityLabelFor(member)}`}
            >
              {initials(member.name)}
            </span>
            <div
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-[calc(100%+0.4rem)] z-50 w-max max-w-[14rem] -translate-x-1/2 scale-95 rounded-xl border border-white/10 bg-[#0b0f17] px-2.5 py-1.5 opacity-0 shadow-[0_0_24px_rgba(0,242,254,0.12)] transition group-hover:scale-100 group-hover:opacity-100"
            >
              <p className="text-[11px] font-semibold text-white">
                {member.name}
              </p>
              <p className="mt-0.5 text-[10px] text-cyan-accent/90">
                {activityLabelFor(member)}
              </p>
            </div>
          </div>
        ))}
        {overflowCount > 0 ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#09090b] bg-white/[0.06] font-mono text-[10px] font-semibold text-slate-muted ring-2 ring-white/15">
            +{overflowCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}
