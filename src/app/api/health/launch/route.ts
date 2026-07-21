/**
 * GET /api/health/launch
 * Global launch readiness — DB pool, payment webhooks, edge cache, SRE circuit breaker.
 * Always returns HTTP 200 with a unified JSON payload for Vercel / UptimeRobot pings.
 */

import { kv } from "@vercel/kv";
import { withPrisma } from "@/lib/prisma";
import {
  getCircuitBreakerHealth,
  getPoolMonitorSnapshot,
} from "@/lib/db/poolMonitor";
import {
  isWorkspaceFlagsKvConfigured,
} from "@/lib/workspace/settingsCache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVER_START_MS = Date.now();
const LAUNCH_PROBE_KEY = "health:launch:probe";

type CheckResult = {
  ok: boolean;
  detail: string;
  latencyMs?: number;
  meta?: Record<string, unknown>;
};

async function probeDbPool(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withPrisma(async (db) => {
      await db.$queryRaw`SELECT 1`;
    }, "health.launch.db");
    const circuit = getCircuitBreakerHealth();
    const pool = getPoolMonitorSnapshot();
    const circuitOk = circuit.state !== "OPEN";
    return {
      ok: circuitOk,
      detail: circuitOk
        ? "Database reachable; circuit closed/half-open."
        : "Circuit breaker OPEN — pool degraded.",
      latencyMs: Date.now() - start,
      meta: {
        circuitState: circuit.state,
        poolStatus: pool.status,
        activeConnections: pool.activeConnections,
        maxConnections: pool.maxConnections,
        waitingClients: pool.waitingClients,
        failureCount: circuit.failureCount,
        totalHeals: circuit.totalHeals,
      },
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "DB probe failed.",
      latencyMs: Date.now() - start,
      meta: { circuitState: getCircuitBreakerHealth().state },
    };
  }
}

function probeStripeWebhook(): CheckResult {
  const secret = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const key = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const ok = secret && key;
  return {
    ok,
    detail: ok
      ? "Stripe secret + webhook secret configured."
      : "Missing STRIPE_SECRET_KEY and/or STRIPE_WEBHOOK_SECRET.",
    meta: { secretConfigured: secret, apiKeyConfigured: key },
  };
}

function probePayPalWebhook(): CheckResult {
  const clientId = Boolean(process.env.PAYPAL_CLIENT_ID?.trim());
  const clientSecret = Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim());
  const webhookId = Boolean(process.env.PAYPAL_WEBHOOK_ID?.trim());
  const ok = clientId && clientSecret && webhookId;
  return {
    ok,
    detail: ok
      ? "PayPal client credentials + webhook id configured."
      : "Missing PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and/or PAYPAL_WEBHOOK_ID.",
    meta: {
      clientIdConfigured: clientId,
      clientSecretConfigured: clientSecret,
      webhookIdConfigured: webhookId,
      mode: process.env.PAYPAL_MODE?.trim() || "sandbox",
    },
  };
}

function probeLightningWebhook(): CheckResult {
  const rest = Boolean(process.env.LIGHTNING_LND_REST_URL?.trim());
  const macaroon = Boolean(process.env.LIGHTNING_LND_MACAROON_HEX?.trim());
  const webhookSecret = Boolean(process.env.LIGHTNING_WEBHOOK_SECRET?.trim());
  const ok = rest && macaroon && webhookSecret;
  return {
    ok,
    detail: ok
      ? "Lightning LND REST + macaroon + webhook secret configured."
      : "Missing LIGHTNING_LND_REST_URL, LIGHTNING_LND_MACAROON_HEX, and/or LIGHTNING_WEBHOOK_SECRET.",
    meta: {
      restConfigured: rest,
      macaroonConfigured: macaroon,
      webhookSecretConfigured: webhookSecret,
    },
  };
}

async function probeEdgeCache(): Promise<CheckResult> {
  const start = Date.now();
  const configured = isWorkspaceFlagsKvConfigured();
  if (!configured) {
    // Non-prod without KV is acceptable; prod expects KV for edge flags.
    const ok = process.env.NODE_ENV !== "production";
    return {
      ok,
      detail: ok
        ? "Edge KV not configured (allowed outside production)."
        : "KV_REST_API_URL / KV_REST_API_TOKEN missing in production.",
      latencyMs: Date.now() - start,
      meta: { configured: false, hitRatio: null },
    };
  }

  try {
    const token = `launch-${Date.now()}`;
    await kv.set(LAUNCH_PROBE_KEY, token, { ex: 60 });
    const hit = await kv.get<string>(LAUNCH_PROBE_KEY);
    const ok = hit === token;
    return {
      ok,
      detail: ok
        ? "Edge KV write/read probe succeeded."
        : "Edge KV probe miss after write.",
      latencyMs: Date.now() - start,
      meta: {
        configured: true,
        hitRatio: ok ? 1 : 0,
        efficiency: ok ? "optimal" : "degraded",
      },
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Edge KV probe failed.",
      latencyMs: Date.now() - start,
      meta: { configured: true, hitRatio: 0, efficiency: "error" },
    };
  }
}

function probeSreCircuit(): CheckResult {
  const circuit = getCircuitBreakerHealth();
  const pool = getPoolMonitorSnapshot();
  const ok = circuit.state === "CLOSED" || circuit.state === "HALF_OPEN";
  return {
    ok,
    detail:
      circuit.state === "CLOSED"
        ? "SRE circuit breaker CLOSED."
        : circuit.state === "HALF_OPEN"
          ? "SRE circuit breaker HALF_OPEN — probing recovery."
          : "SRE circuit breaker OPEN.",
    meta: {
      state: circuit.state,
      uiStatus: pool.status,
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      lastFailureAt: circuit.lastFailureAt,
      lastHealAt: circuit.lastHealAt,
      totalIntercepts: circuit.totalIntercepts,
      totalHeals: circuit.totalHeals,
    },
  };
}

export async function GET() {
  const [dbPool, edgeCache] = await Promise.all([
    probeDbPool(),
    probeEdgeCache(),
  ]);

  const checks = {
    dbPool,
    stripeWebhook: probeStripeWebhook(),
    paypalWebhook: probePayPalWebhook(),
    lightningWebhook: probeLightningWebhook(),
    edgeCache,
    sreCircuitBreaker: probeSreCircuit(),
  };

  const criticalOk = checks.dbPool.ok && checks.sreCircuitBreaker.ok;
  const paymentRailsOk =
    checks.stripeWebhook.ok ||
    checks.paypalWebhook.ok ||
    checks.lightningWebhook.ok;
  const allOk =
    criticalOk &&
    paymentRailsOk &&
    checks.edgeCache.ok &&
    checks.stripeWebhook.ok &&
    checks.paypalWebhook.ok &&
    checks.lightningWebhook.ok;

  const status = allOk
    ? "READY"
    : criticalOk
      ? "DEGRADED"
      : "DOWN";

  const payload = {
    ready: criticalOk,
    launchReady: allOk,
    status,
    uptimeMs: Date.now() - SERVER_START_MS,
    checkedAt: new Date().toISOString(),
    checks,
    summary: {
      criticalOk,
      paymentRailsOk,
      edgeCacheOk: checks.edgeCache.ok,
      webhookRails: {
        stripe: checks.stripeWebhook.ok,
        paypal: checks.paypalWebhook.ok,
        lightning: checks.lightningWebhook.ok,
      },
    },
  };

  // Unified 200 OK for Vercel / UptimeRobot — readiness lives in JSON body.
  return Response.json(payload, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "x-launch-status": status,
      "x-launch-ready": criticalOk ? "1" : "0",
    },
  });
}
