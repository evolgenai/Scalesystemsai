"use client";

/**
 * Client-only workspace co-presence.
 * Contracts (assumed):
 *   GET  /api/orgs/presence         → { success, members: PresenceMember[] }
 *   POST /api/orgs/presence/heartbeat → { userId, orgId, currentActivity }
 */

import { useCallback, useEffect, useState } from "react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { getActiveOrgId } from "@/lib/org/activeOrg";

export type PresenceActivity = "idle" | "typing" | "spectating";

export type PresenceMember = {
  userId: string;
  orgId: string;
  name: string;
  currentActivity: PresenceActivity;
  /** Optional short label for tooltips / feed lines. */
  statusMessage?: string;
  /** Collaborator swarm control signal for temporary toasts. */
  lastAction?: "pause" | "resume" | null;
  lastActionAt?: string | null;
};

export type PresenceNotice = {
  id: string;
  message: string;
  at: number;
};

type HeartbeatBody = {
  userId: string;
  orgId: string;
  currentActivity: PresenceActivity;
};

type PresenceSnapshot = {
  orgId: string | null;
  members: PresenceMember[];
  notices: PresenceNotice[];
};

const POLL_MS = 4000;
const HEARTBEAT_MS = 5000;
const NOTICE_TTL_MS = 4500;

let localActivity: PresenceActivity = "idle";
let subscribers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastActionSeen = new Map<string, string>();
let snapshot: PresenceSnapshot = {
  orgId: null,
  members: [],
  notices: [],
};
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readAuthUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("scalesystems.auth.user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id?.trim() || null;
  } catch {
    return null;
  }
}

function activityLabel(member: PresenceMember): string {
  if (member.statusMessage?.trim()) return member.statusMessage.trim();
  switch (member.currentActivity) {
    case "typing":
      return "Designing Swarm…";
    case "spectating":
      return "Spectating run…";
    default:
      return "Active in workspace";
  }
}

function feedLineFor(member: PresenceMember): string | null {
  const first = member.name.trim().split(/\s+/)[0] || "Teammate";
  if (member.currentActivity === "typing") {
    return `⚡ ${first} is typing a new objective…`;
  }
  if (member.currentActivity === "spectating") {
    return `🟢 ${first} is currently spectating this run`;
  }
  return null;
}

function parseMembers(payload: unknown, orgId: string): PresenceMember[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as {
    members?: unknown;
    presence?: unknown;
  };
  const list = Array.isArray(root.members)
    ? root.members
    : Array.isArray(root.presence)
      ? root.presence
      : [];

  const out: PresenceMember[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const userId = String(row.userId ?? row.id ?? "").trim();
    if (!userId) continue;
    const activityRaw = String(row.currentActivity ?? "idle");
    const currentActivity: PresenceActivity =
      activityRaw === "typing" || activityRaw === "spectating"
        ? activityRaw
        : "idle";
    const lastActionRaw = row.lastAction;
    const lastAction =
      lastActionRaw === "pause" || lastActionRaw === "resume"
        ? lastActionRaw
        : null;

    out.push({
      userId,
      orgId: String(row.orgId ?? orgId),
      name: String(row.name ?? row.displayName ?? "Teammate"),
      currentActivity,
      statusMessage:
        typeof row.statusMessage === "string"
          ? row.statusMessage
          : typeof row.status === "string"
            ? row.status
            : undefined,
      lastAction,
      lastActionAt:
        typeof row.lastActionAt === "string" ? row.lastActionAt : null,
    });
  }
  return out;
}

function pushNotice(message: string): void {
  const notice: PresenceNotice = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message,
    at: Date.now(),
  };
  snapshot = {
    ...snapshot,
    notices: [...snapshot.notices, notice].slice(-6),
  };
  notify();
  window.setTimeout(() => {
    snapshot = {
      ...snapshot,
      notices: snapshot.notices.filter((n) => n.id !== notice.id),
    };
    notify();
  }, NOTICE_TTL_MS);
}

async function fetchPresence(orgId: string): Promise<void> {
  try {
    const response = await fetch(
      `/api/orgs/presence?orgId=${encodeURIComponent(orgId)}`,
      {
        headers: {
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        cache: "no-store",
      }
    );
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
    };
    if (!response.ok || payload.success === false) return;

    const selfId = readAuthUserId();
    const members = parseMembers(payload, orgId).filter(
      (member) => member.userId !== selfId
    );

    for (const member of members) {
      if (!member.lastAction || !member.lastActionAt) continue;
      const key = `${member.userId}:${member.lastAction}:${member.lastActionAt}`;
      if (lastActionSeen.has(key)) continue;
      lastActionSeen.set(key, member.lastActionAt);
      const first = member.name.trim().split(/\s+/)[0] || "Teammate";
      pushNotice(
        member.lastAction === "pause"
          ? `${first} paused the swarm`
          : `${first} resumed the swarm`
      );
    }

    snapshot = { ...snapshot, orgId, members };
    notify();
  } catch {
    // Soft-fail — presence is best-effort.
  }
}

async function postHeartbeat(orgId: string): Promise<void> {
  const userId = readAuthUserId();
  if (!userId) return;

  const body: HeartbeatBody = {
    userId,
    orgId,
    currentActivity: localActivity,
  };

  try {
    await fetch("/api/orgs/presence/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getClientAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Soft-fail heartbeats.
  }
}

function syncLoopForOrg(orgId: string | null): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (!orgId) {
    snapshot = { orgId: null, members: [], notices: [] };
    lastActionSeen = new Map();
    notify();
    return;
  }

  snapshot = { ...snapshot, orgId };
  void fetchPresence(orgId);
  void postHeartbeat(orgId);

  pollTimer = setInterval(() => {
    void fetchPresence(orgId);
  }, POLL_MS);

  heartbeatTimer = setInterval(() => {
    void postHeartbeat(orgId);
  }, HEARTBEAT_MS);
}

function ensureStarted(): void {
  if (subscribers === 0) return;
  syncLoopForOrg(getActiveOrgId());
}

/**
 * Report the local operator activity for the next heartbeat.
 * Safe to call from any client component.
 */
export function reportWorkspaceActivity(activity: PresenceActivity): void {
  localActivity = activity;
  const orgId = getActiveOrgId();
  if (orgId && subscribers > 0) {
    void postHeartbeat(orgId);
  }
}

export function useWorkspacePresence(): {
  orgId: string | null;
  members: PresenceMember[];
  visibleMembers: PresenceMember[];
  overflowCount: number;
  feedLine: string | null;
  notices: PresenceNotice[];
  activityLabelFor: (member: PresenceMember) => string;
  reportActivity: (activity: PresenceActivity) => void;
} {
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    listeners.add(onChange);
    subscribers += 1;
    if (subscribers === 1) {
      ensureStarted();
    }

    const onOrgChanged = () => {
      syncLoopForOrg(getActiveOrgId());
    };
    window.addEventListener("scalesystems:org-changed", onOrgChanged);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
      subscribers = Math.max(0, subscribers - 1);
      if (subscribers === 0) {
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        pollTimer = null;
        heartbeatTimer = null;
      }
    };
  }, []);

  const reportActivity = useCallback((activity: PresenceActivity) => {
    reportWorkspaceActivity(activity);
  }, []);

  const members = snapshot.members;
  const visibleMembers = members.slice(0, 4);
  const overflowCount = Math.max(0, members.length - 4);
  const feedLine =
    members.map(feedLineFor).find((line): line is string => Boolean(line)) ??
    null;

  return {
    orgId: snapshot.orgId,
    members,
    visibleMembers,
    overflowCount,
    feedLine,
    notices: snapshot.notices,
    activityLabelFor: activityLabel,
    reportActivity,
  };
}
