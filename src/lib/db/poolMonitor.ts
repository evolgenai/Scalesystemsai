/**
 * Prisma connection-pool monitor + circuit breaker.
 * Intercepts P2024 (pool checkout timeout), persists SystemIncident, auto-heals via pool reset.
 * Also exposes a UI snapshot facade for Chaos Control Panel polling.
 */

import { Prisma } from "@prisma/client";
import { resetPrismaClient, isPrismaDisconnectError } from "@/lib/prisma";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type ErrorCodeKey = "429" | "500" | "503";
export type CircuitStatusUi =
  | "HEALTHY"
  | "DEGRADED"
  | "CIRCUIT_TRIPPED_AUTO_HEALING";

export type PoolMonitorMetrics = {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: string | null;
  lastHealAt: string | null;
  lastIncidentId: string | null;
  openedAt: string | null;
  halfOpenProbes: number;
  totalIntercepts: number;
  totalHeals: number;
};

export type PoolMonitorSnapshot = {
  status: CircuitStatusUi;
  activeConnections: number;
  maxConnections: number;
  waitingClients: number;
  activeConcurrent: number;
  latencySpikeMs: number;
  errorRates: Record<ErrorCodeKey, number>;
  autoHealEvents: number;
  lastHealAt: number | null;
  lastTripAt: number | null;
  generation: number;
  updatedAt: number;
};

export type PoolInterceptResult = {
  intercepted: boolean;
  healed: boolean;
  incidentId: string | null;
  circuitState: CircuitState;
  processAlive: true;
};

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 15_000;
const HALF_OPEN_MAX_PROBES = 2;
const UI_HEAL_MS = 2_400;

type MonitorState = {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastHealAt: number | null;
  lastIncidentId: string | null;
  openedAt: number | null;
  halfOpenProbes: number;
  totalIntercepts: number;
  totalHeals: number;
  healInFlight: Promise<PoolInterceptResult> | null;
  maxConnections: number;
  activeConnections: number;
  waitingClients: number;
  activeConcurrent: number;
  latencySpikeMs: number;
  errorRates: Record<ErrorCodeKey, number>;
  generation: number;
  uiHealUntil: number | null;
  updatedAt: number;
};

type MonitorGlobals = {
  __ssPoolMonitor?: MonitorState;
};

const g = globalThis as unknown as MonitorGlobals;

function createInitialState(): MonitorState {
  return {
    state: "CLOSED",
    failureCount: 0,
    successCount: 0,
    lastFailureAt: null,
    lastHealAt: null,
    lastIncidentId: null,
    openedAt: null,
    halfOpenProbes: 0,
    totalIntercepts: 0,
    totalHeals: 0,
    healInFlight: null,
    maxConnections: Number.parseInt(process.env.PRISMA_POOL_MAX ?? "5", 10) || 5,
    activeConnections: 1,
    waitingClients: 0,
    activeConcurrent: 0,
    latencySpikeMs: 42,
    errorRates: { "429": 0, "500": 0, "503": 0 },
    generation: 1,
    uiHealUntil: null,
    updatedAt: Date.now(),
  };
}

function store(): MonitorState {
  if (!g.__ssPoolMonitor) {
    g.__ssPoolMonitor = createInitialState();
  }
  return g.__ssPoolMonitor;
}

export function isPoolTimeoutError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === "P2024";
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes("timed out fetching a new connection") ||
      (m.includes("connection pool") && m.includes("timeout"))
    );
  }
  return false;
}

export function createControlledP2024(
  message = "Timed out fetching a new connection from the connection pool. (chaos controlled)"
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: "P2024",
    clientVersion: Prisma.prismaVersion?.client ?? "0.0.0",
  });
}

function maybeTransitionToHalfOpen(now: number): void {
  const s = store();
  if (s.state !== "OPEN" || s.openedAt == null) return;
  if (now - s.openedAt >= OPEN_MS) {
    s.state = "HALF_OPEN";
    s.halfOpenProbes = 0;
  }
}

function resolveUiStatus(s: MonitorState, now: number): CircuitStatusUi {
  if (s.uiHealUntil != null && now < s.uiHealUntil) {
    return "CIRCUIT_TRIPPED_AUTO_HEALING";
  }
  if (s.uiHealUntil != null && now >= s.uiHealUntil) {
    s.uiHealUntil = null;
    s.state = "CLOSED";
    s.activeConnections = Math.max(1, Math.min(2, s.maxConnections));
    s.waitingClients = 0;
    s.activeConcurrent = 0;
    s.latencySpikeMs = 40 + Math.random() * 20;
    s.errorRates = { "429": 0, "500": 0, "503": 0 };
  }
  maybeTransitionToHalfOpen(now);
  if (s.state === "OPEN" || s.state === "HALF_OPEN") {
    return s.state === "OPEN" ? "CIRCUIT_TRIPPED_AUTO_HEALING" : "DEGRADED";
  }
  const errSum = s.errorRates["429"] + s.errorRates["500"] + s.errorRates["503"];
  if (errSum > 12 || s.activeConcurrent > s.maxConnections * 0.8) {
    return "DEGRADED";
  }
  return "HEALTHY";
}

function buildSnapshot(): PoolMonitorSnapshot {
  const s = store();
  const now = Date.now();
  const status = resolveUiStatus(s, now);
  s.updatedAt = now;
  return {
    status,
    activeConnections: s.activeConnections,
    maxConnections: s.maxConnections,
    waitingClients: s.waitingClients,
    activeConcurrent: s.activeConcurrent,
    latencySpikeMs: s.latencySpikeMs,
    errorRates: { ...s.errorRates },
    autoHealEvents: s.totalHeals,
    lastHealAt: s.lastHealAt,
    lastTripAt: s.openedAt ?? s.lastFailureAt,
    generation: s.generation,
    updatedAt: s.updatedAt,
  };
}

async function persistIncident(input: {
  kind: string;
  severity: string;
  message: string;
  route: string;
  metadata: Record<string, unknown>;
  healed: boolean;
}): Promise<string | null> {
  try {
    const { getPrisma } = await import("@/lib/prisma");
    const db = getPrisma();
    const row = await db.systemIncident.create({
      data: {
        kind: input.kind,
        severity: input.severity,
        message: input.message,
        route: input.route,
        metadata: input.metadata as Prisma.InputJsonValue,
        healed: input.healed,
        healedAt: input.healed ? new Date() : null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[poolMonitor] SystemIncident persist failed:", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Intercept pool / disconnect failures: log incident, reset pool, update circuit.
 */
export async function interceptPoolFailure(
  err: unknown,
  route = "poolMonitor",
  opts?: { force?: boolean; kind?: string }
): Promise<PoolInterceptResult> {
  const force = opts?.force === true;
  const isTimeout = isPoolTimeoutError(err);
  const isDisconnect = isPrismaDisconnectError(err);

  if (!force && !isTimeout && !isDisconnect) {
    return {
      intercepted: false,
      healed: false,
      incidentId: null,
      circuitState: store().state,
      processAlive: true,
    };
  }

  const s = store();
  if (s.healInFlight) return s.healInFlight;

  s.healInFlight = (async (): Promise<PoolInterceptResult> => {
    const now = Date.now();
    maybeTransitionToHalfOpen(now);

    s.totalIntercepts += 1;
    s.failureCount += 1;
    s.lastFailureAt = now;
    s.successCount = 0;
    s.waitingClients = s.maxConnections;
    s.activeConnections = s.maxConnections;
    s.latencySpikeMs = 800 + Math.random() * 400;
    s.uiHealUntil = now + UI_HEAL_MS;
    s.generation += 1;

    if (s.state === "HALF_OPEN") {
      s.state = "OPEN";
      s.openedAt = now;
      s.halfOpenProbes = 0;
    } else if (s.state === "CLOSED" && s.failureCount >= FAILURE_THRESHOLD) {
      s.state = "OPEN";
      s.openedAt = now;
    } else if (force && s.state === "CLOSED") {
      s.state = "OPEN";
      s.openedAt = now;
    }

    const message =
      err instanceof Error
        ? err.message
        : "Unknown pool failure intercepted by poolMonitor.";

    let healed = false;
    try {
      await resetPrismaClient(
        isTimeout ? "poolMonitor:P2024" : `poolMonitor:${route}`
      );
      healed = true;
      s.totalHeals += 1;
      s.lastHealAt = Date.now();
      s.failureCount = 0;
      s.state = "HALF_OPEN";
      s.halfOpenProbes = 0;
    } catch (healErr) {
      console.error("[poolMonitor] auto-heal failed:", {
        message: healErr instanceof Error ? healErr.message : String(healErr),
      });
      s.state = "OPEN";
      s.openedAt = Date.now();
    }

    const incidentId = await persistIncident({
      kind: opts?.kind ?? (isTimeout ? "POOL_TIMEOUT" : "POOL_DISCONNECT"),
      severity: "critical",
      message,
      route,
      metadata: {
        code:
          err instanceof Prisma.PrismaClientKnownRequestError
            ? err.code
            : null,
        force,
        healed,
        circuitState: s.state,
      },
      healed,
    });

    s.lastIncidentId = incidentId;
    s.updatedAt = Date.now();

    console.warn("[poolMonitor] intercepted pool failure", {
      route,
      healed,
      incidentId,
      circuitState: s.state,
      processAlive: true,
    });

    return {
      intercepted: true,
      healed,
      incidentId,
      circuitState: s.state,
      processAlive: true,
    };
  })().finally(() => {
    s.healInFlight = null;
  });

  return s.healInFlight;
}

export function recordPoolSuccess(): void {
  const s = store();
  const now = Date.now();
  maybeTransitionToHalfOpen(now);

  if (s.state === "OPEN") return;

  s.successCount += 1;
  s.failureCount = 0;

  if (s.state === "HALF_OPEN") {
    s.halfOpenProbes += 1;
    if (s.halfOpenProbes >= HALF_OPEN_MAX_PROBES) {
      s.state = "CLOSED";
      s.openedAt = null;
      s.halfOpenProbes = 0;
    }
  }
  s.updatedAt = now;
}

export function getCircuitBreakerHealth(): PoolMonitorMetrics {
  const s = store();
  maybeTransitionToHalfOpen(Date.now());
  return {
    state: s.state,
    failureCount: s.failureCount,
    successCount: s.successCount,
    lastFailureAt: s.lastFailureAt
      ? new Date(s.lastFailureAt).toISOString()
      : null,
    lastHealAt: s.lastHealAt ? new Date(s.lastHealAt).toISOString() : null,
    lastIncidentId: s.lastIncidentId,
    openedAt: s.openedAt ? new Date(s.openedAt).toISOString() : null,
    halfOpenProbes: s.halfOpenProbes,
    totalIntercepts: s.totalIntercepts,
    totalHeals: s.totalHeals,
  };
}

export function getPoolMonitorSnapshot(): PoolMonitorSnapshot {
  return buildSnapshot();
}

/** Facade used by Chaos Control Panel / stress route. */
export function getPoolMonitor() {
  return {
    tickIdle(): void {
      const s = store();
      const now = Date.now();
      if (resolveUiStatus(s, now) === "HEALTHY") {
        s.activeConnections = Math.max(
          1,
          Math.min(
            s.maxConnections,
            s.activeConnections + (Math.random() > 0.7 ? 1 : -1)
          )
        );
        s.latencySpikeMs = Math.max(
          20,
          s.latencySpikeMs + (Math.random() - 0.5) * 8
        );
        s.activeConcurrent = Math.max(0, s.activeConcurrent - 1);
      }
      s.updatedAt = now;
    },
    snapshot(): PoolMonitorSnapshot {
      return buildSnapshot();
    },
    recordBurst(
      concurrency: number,
      errors: Record<ErrorCodeKey, number>
    ): PoolMonitorSnapshot {
      const s = store();
      const now = Date.now();
      s.activeConcurrent = concurrency;
      s.waitingClients = Math.max(0, concurrency - s.maxConnections);
      s.activeConnections = Math.min(
        s.maxConnections,
        Math.ceil(concurrency / 10)
      );
      s.latencySpikeMs = 60 + Math.min(2_000, concurrency * 0.8);
      s.errorRates = {
        "429": errors["429"] ?? 0,
        "500": errors["500"] ?? 0,
        "503": errors["503"] ?? 0,
      };
      if (concurrency >= 100) {
        s.state = concurrency >= 1000 ? "OPEN" : "HALF_OPEN";
        if (concurrency >= 1000) {
          s.openedAt = now;
          s.uiHealUntil = now + UI_HEAL_MS;
        }
      }
      s.updatedAt = now;
      return buildSnapshot();
    },
    simulatePoolExhaustion(): PoolMonitorSnapshot {
      const s = store();
      const now = Date.now();
      s.state = "OPEN";
      s.openedAt = now;
      s.lastFailureAt = now;
      s.uiHealUntil = now + UI_HEAL_MS;
      s.activeConnections = s.maxConnections;
      s.waitingClients = s.maxConnections * 2;
      s.activeConcurrent = s.maxConnections * 3;
      s.latencySpikeMs = 1_200;
      s.errorRates = { "429": 0, "500": 5, "503": 35 };
      s.generation += 1;
      s.updatedAt = now;

      void interceptPoolFailure(
        createControlledP2024(),
        "poolMonitor.ui_exhaust",
        { force: true, kind: "CHAOS_POOL" }
      );

      return buildSnapshot();
    },
  };
}

export function resetPoolMonitorState(): void {
  g.__ssPoolMonitor = createInitialState();
}
