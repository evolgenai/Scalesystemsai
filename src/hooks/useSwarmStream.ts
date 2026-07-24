"use client";

/**
 * Live SSE subscription to /api/telemetry/stream.
 * Single shared EventSource; UI reads via useSyncExternalStore
 * so header counters update without remounting the tree.
 */

import {
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import { resolveWorkspaceIdFromStorage } from "@/components/navigation/WorkspaceScopeContext";

export type SwarmStreamCounters = {
  agentsOnline: number;
  gasBalance: number | null;
  openIncidents: number;
  eventCount: number;
  lastEventAt: string | null;
  connected: boolean;
  lastError: string | null;
};

export type SwarmStreamEvent = {
  id?: string;
  type: string;
  workspaceId?: string | null;
  at?: string;
  [key: string]: unknown;
};

type Store = {
  counters: SwarmStreamCounters;
  recent: SwarmStreamEvent[];
  listeners: Set<() => void>;
};

const MAX_RECENT = 40;

const store: Store = {
  counters: {
    agentsOnline: 0,
    gasBalance: null,
    openIncidents: 0,
    eventCount: 0,
    lastEventAt: null,
    connected: false,
    lastError: null,
  },
  recent: [],
  listeners: new Set(),
};

const agentIds = new Set<string>();
const incidentIds = new Set<string>();

let es: EventSource | null = null;
let activeWorkspaceId: string | null = null;
let subscribers = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const l of store.listeners) l();
}

function patchCounters(partial: Partial<SwarmStreamCounters>) {
  store.counters = { ...store.counters, ...partial };
  emit();
}

function pushEvent(ev: SwarmStreamEvent) {
  store.recent = [ev, ...store.recent].slice(0, MAX_RECENT);
  store.counters = {
    ...store.counters,
    eventCount: store.counters.eventCount + 1,
    lastEventAt: ev.at ?? new Date().toISOString(),
  };

  if (ev.type === "agent_state") {
    const id = String(ev.agentId ?? ev.id ?? "");
    const status = String(ev.status ?? "").toLowerCase();
    if (id) {
      if (status === "offline" || status === "stopped") agentIds.delete(id);
      else agentIds.add(id);
    }
    store.counters = {
      ...store.counters,
      agentsOnline: agentIds.size,
    };
  } else if (ev.type === "gas") {
    const bal =
      typeof ev.balanceAfter === "number"
        ? ev.balanceAfter
        : typeof ev.amount === "number"
          ? ev.amount
          : store.counters.gasBalance;
    store.counters = { ...store.counters, gasBalance: bal };
  } else if (ev.type === "incident") {
    const id = String(ev.incidentId ?? ev.id ?? "");
    const healed = Boolean(ev.healed);
    if (id) {
      if (healed) incidentIds.delete(id);
      else incidentIds.add(id);
    }
    store.counters = {
      ...store.counters,
      openIncidents: incidentIds.size,
    };
  }

  emit();
}

function subscribe(listener: () => void) {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function getSnapshot(): SwarmStreamCounters {
  return store.counters;
}

function getRecentSnapshot(): SwarmStreamEvent[] {
  return store.recent;
}

function detachSource() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  es?.close();
  es = null;
}

function attachSource(workspaceId: string) {
  if (typeof window === "undefined") return;
  if (es && activeWorkspaceId === workspaceId) return;

  detachSource();
  activeWorkspaceId = workspaceId;

  const qs = new URLSearchParams({
    pollMs: "4000",
    workspaceId,
  });

  void fetch(
    `/api/telemetry/swarm?workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers: getClientAuthHeaders(), cache: "no-store" }
  ).catch(() => {});

  const source = new EventSource(`/api/telemetry/stream?${qs.toString()}`);
  es = source;

  const onAny = (type: string) => (e: MessageEvent) => {
    try {
      const data = JSON.parse(String(e.data)) as SwarmStreamEvent;
      pushEvent({ ...data, type: data.type || type });
    } catch {
      /* ignore */
    }
  };

  source.addEventListener("connected", () => {
    patchCounters({ connected: true, lastError: null });
  });
  source.addEventListener("heartbeat", () => {
    patchCounters({ connected: true });
  });
  for (const t of ["agent_state", "gas", "incident", "terminal_log"] as const) {
    source.addEventListener(t, onAny(t));
  }
  source.onmessage = onAny("message");
  source.onopen = () => {
    patchCounters({ connected: true, lastError: null });
  };
  source.onerror = () => {
    patchCounters({ connected: false, lastError: "SSE reconnecting…" });
    detachSource();
    if (subscribers > 0 && activeWorkspaceId) {
      const ws = activeWorkspaceId;
      reconnectTimer = setTimeout(() => {
        if (subscribers > 0) attachSource(ws);
      }, 2800);
    }
  };
}

function retainStream(workspaceId: string) {
  subscribers += 1;
  attachSource(workspaceId);
  return () => {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) {
      detachSource();
      patchCounters({ connected: false });
    }
  };
}

/**
 * Ensure shared EventSource for the active workspace.
 */
export function useSwarmStream(options?: {
  workspaceId?: string | null;
  enabled?: boolean;
}): {
  counters: SwarmStreamCounters;
  recent: SwarmStreamEvent[];
  reconnect: () => void;
} {
  const enabled = options?.enabled !== false;
  const workspaceId =
    options?.workspaceId ??
    (typeof window !== "undefined"
      ? resolveWorkspaceIdFromStorage()
      : "ws_personal");

  const reconnect = useCallback(() => {
    if (!enabled) return;
    detachSource();
    attachSource(workspaceId);
  }, [enabled, workspaceId]);

  useEffect(() => {
    if (!enabled) return;
    return retainStream(workspaceId);
  }, [enabled, workspaceId]);

  useEffect(() => {
    if (!enabled) return;
    const onWs = () => {
      const next = resolveWorkspaceIdFromStorage();
      detachSource();
      attachSource(next);
    };
    window.addEventListener("scalesystems:workspace-id-changed", onWs);
    window.addEventListener("scalesystems:org-changed", onWs);
    window.addEventListener("scalesystems:workspace-changed", onWs);
    return () => {
      window.removeEventListener("scalesystems:workspace-id-changed", onWs);
      window.removeEventListener("scalesystems:org-changed", onWs);
      window.removeEventListener("scalesystems:workspace-changed", onWs);
    };
  }, [enabled]);

  const counters = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );
  const recent = useSyncExternalStore(
    subscribe,
    getRecentSnapshot,
    getRecentSnapshot
  );

  return { counters, recent, reconnect };
}

/** Header-only counters — same store, no extra EventSource. */
export function useSwarmStreamCounters(): SwarmStreamCounters {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
