/**
 * In-memory chaos run ledger + short-lived swarm probe tokens.
 */

export type ChaosAction = "SWARM_BURST" | "SIMULATE_POOL_EXHAUSTION";

export type LatencyDistribution = {
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
};

export type SwarmBurstResult = {
  action: "SWARM_BURST";
  runId: string;
  concurrentRequests: number;
  targetPath: string;
  statusCounts: Record<string, number>;
  ok200: number;
  rateLimited429: number;
  other: number;
  ratio200: number;
  ratio429: number;
  latency: LatencyDistribution;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
};

export type PoolExhaustionResult = {
  action: "SIMULATE_POOL_EXHAUSTION";
  runId: string;
  concurrentRequests: number;
  intercepted: boolean;
  healed: boolean;
  incidentId: string | null;
  circuitState: string;
  processAlive: true;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  verification: {
    poolMonitorIntercepted: boolean;
    systemIncidentLogged: boolean;
    autoHealed: boolean;
    nodeProcessCrashed: false;
  };
};

export type ChaosRunRecord = {
  runId: string;
  action: ChaosAction;
  concurrentRequests: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: SwarmBurstResult | PoolExhaustionResult;
};

type ChaosGlobals = {
  __ssChaosRuns?: ChaosRunRecord[];
  __ssChaosTokens?: Map<string, { exp: number; runId: string }>;
};

const g = globalThis as unknown as ChaosGlobals;
const MAX_RUNS = 50;

function runs(): ChaosRunRecord[] {
  if (!g.__ssChaosRuns) g.__ssChaosRuns = [];
  return g.__ssChaosRuns;
}

function tokens(): Map<string, { exp: number; runId: string }> {
  if (!g.__ssChaosTokens) g.__ssChaosTokens = new Map();
  return g.__ssChaosTokens;
}

export function rememberChaosRun(record: ChaosRunRecord): void {
  const list = runs();
  list.unshift(record);
  if (list.length > MAX_RUNS) list.length = MAX_RUNS;
}

export function listRecentChaosRuns(limit = 20): ChaosRunRecord[] {
  return runs().slice(0, Math.max(1, Math.min(limit, MAX_RUNS)));
}

export function issueChaosProbeToken(runId: string, ttlMs = 120_000): string {
  const token = `chs_${runId}_${Math.random().toString(36).slice(2, 12)}`;
  tokens().set(token, { exp: Date.now() + ttlMs, runId });
  return token;
}

export function consumeChaosProbeToken(token: string): boolean {
  const map = tokens();
  const entry = map.get(token);
  if (!entry) return false;
  if (Date.now() > entry.exp) {
    map.delete(token);
    return false;
  }
  // Reusable within the burst window (many concurrent probes share one token).
  return true;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx]!;
}

export function buildLatencyDistribution(samples: number[]): LatencyDistribution {
  if (samples.length === 0) {
    return { minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    meanMs: Math.round((sum / sorted.length) * 100) / 100,
  };
}
