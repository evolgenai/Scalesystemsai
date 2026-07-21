/**
 * POST /api/admin/chaos/stress — concurrency burst + pool exhaustion drills.
 * GET  /api/admin/chaos/stress — live poolMonitor snapshot.
 *
 * UI companion to /api/admin/chaos/simulate (Super-Admin harness).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestUser } from "@/lib/auth/requestUser";
import {
  runPoolExhaustionSimulation,
  runSwarmBurst,
} from "@/lib/chaos/swarmHarness";
import {
  getPoolMonitor,
  getPoolMonitorSnapshot,
  type ErrorCodeKey,
} from "@/lib/db/poolMonitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BurstSchema = z.object({
  action: z.literal("webhook_burst"),
  concurrency: z.union([z.literal(10), z.literal(100), z.literal(1000)]),
});

const ExhaustSchema = z.object({
  action: z.literal("pool_exhaust"),
});

const BodySchema = z.discriminatedUnion("action", [BurstSchema, ExhaustSchema]);

async function requireChaosOperator(request: Request) {
  const profile = await resolveRequestUser(request);
  if (
    profile.isSuperAdmin ||
    profile.isDeveloperAccount ||
    profile.role === "SUPER_ADMIN" ||
    profile.accountKind === "DEVELOPER_ACCOUNT" ||
    process.env.NODE_ENV !== "production"
  ) {
    return null;
  }
  return NextResponse.json(
    {
      success: false,
      error: "Forbidden. Superadmin or Developer session required.",
      code: "CHAOS_OPERATOR_REQUIRED",
    },
    { status: 403 }
  );
}

export async function GET(request: Request) {
  const denied = await requireChaosOperator(request);
  if (denied) return denied;

  getPoolMonitor().tickIdle();
  return NextResponse.json({
    success: true,
    data: getPoolMonitorSnapshot(),
  });
}

export async function POST(request: Request) {
  const denied = await requireChaosOperator(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid chaos payload.",
        code: "INVALID_CHAOS",
      },
      { status: 400 }
    );
  }

  const monitor = getPoolMonitor();

  if (parsed.data.action === "pool_exhaust") {
    const result = await runPoolExhaustionSimulation(8);
    const snap = monitor.snapshot();
    return NextResponse.json({
      success: true,
      data: {
        action: "pool_exhaust",
        message:
          "Pool exhaustion drill armed — circuit tripped, auto-heal scheduled.",
        pool: snap,
        harness: result,
      },
    });
  }

  const { concurrency } = parsed.data;
  const started = Date.now();
  const swarm = await runSwarmBurst(request, concurrency);

  const errors: Record<ErrorCodeKey, number> = {
    "429": swarm.ratio429,
    "500": 0,
    "503": swarm.other > 0 ? (swarm.other / Math.max(1, concurrency)) * 100 : 0,
  };
  const pool = monitor.recordBurst(concurrency, errors);

  return NextResponse.json({
    success: true,
    data: {
      action: "webhook_burst",
      concurrency,
      durationMs: Date.now() - started,
      sampleSize: concurrency,
      tallies: {
        ok: swarm.ok200,
        "429": swarm.rateLimited429,
        "500": 0,
        "503": swarm.other,
      },
      pool,
      harness: swarm,
    },
  });
}
