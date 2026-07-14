import { NextResponse } from "next/server";
import {
  formatOrchestratorSseLine,
  getRecentOrchestratorNarratives,
  subscribeOrchestratorNarratives,
  type EngineTelemetryStatus,
} from "@/lib/agents/orchestratorEvents";
import {
  abortActiveOrchestratorRun,
  launchOrchestratorCycle,
} from "@/lib/agents/orchestrator";
import {
  isQuotaBypassed,
  resolveRequestUser,
} from "@/lib/auth/requestUser";
import { evaluateStreamAccess } from "@/lib/auth/subscriptionGating";
import { resolveBillingProfileForRequest } from "@/lib/org/orgScope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QUOTA_EXCEEDED_BODY = {
  error: "Quota Exceeded",
  message:
    "Your active tier rate limits have been surpassed. Upgrade your billing profile.",
};

const PAYMENT_REQUIRED_BODY = {
  error: "Payment Required",
  code: "PAYMENT_REQUIRED",
  message:
    "Free plan stream quota exceeded. Upgrade to STARTER or PREMIUM to continue.",
  upgrade: {
    stripe: "/api/checkout/stripe",
    bvnk: "/api/checkout/bvnk",
  },
};

function isQuotaGateActive(request: Request): boolean {
  const { searchParams } = new URL(request.url);
  return (
    searchParams.get("quotaExceeded") === "1" ||
    searchParams.get("simulateQuotaExceeded") === "1"
  );
}

async function shouldEnforceQuotaGate(request: Request): Promise<boolean> {
  if (!isQuotaGateActive(request)) return false;
  const profile = await resolveRequestUser(request);
  return !isQuotaBypassed(profile);
}

/**
 * Enforce FREE-tier credits against personal pool, or org OWNER pool when
 * `x-org-id` is present. Invalid org context → 403 (no personal fallback).
 */
async function enforceSubscriptionGate(
  request: Request
): Promise<NextResponse | null> {
  const profile = await resolveRequestUser(request);
  const billingResolution = await resolveBillingProfileForRequest(
    request,
    profile
  );

  if (!billingResolution.ok) {
    return NextResponse.json(
      {
        error: "Forbidden",
        code: billingResolution.code,
        message: billingResolution.message,
        orgId: billingResolution.orgId,
      },
      { status: 403 }
    );
  }

  const gate = evaluateStreamAccess(billingResolution.billing, {
    consume: true,
    forceExceeded: isQuotaGateActive(request),
  });
  if (gate.allowed) return null;

  return NextResponse.json(
    {
      ...PAYMENT_REQUIRED_BODY,
      plan: gate.plan,
      used: gate.used,
      limit: gate.limit,
      orgId: billingResolution.orgId,
      billingMode: billingResolution.billingMode,
      message:
        billingResolution.billingMode === "org_owner"
          ? `${gate.message} (team credit pool — organization owner plan).`
          : gate.message,
    },
    { status: 402 }
  );
}

function formatSseChunk(payload: {
  message: string;
  agent?: string;
  narrative?: string;
  engineStatus?: EngineTelemetryStatus;
}): string {
  const stamp = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const agent = payload.agent ? `[${payload.agent}] ` : "";
  return payload.narrative ?? `${stamp} ${agent}${payload.message}`;
}

function pushSseEvent(
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController,
  payload: {
    message: string;
    agent?: string;
    narrative?: string;
    engineStatus?: EngineTelemetryStatus;
  }
): void {
  const chunk = `data: ${JSON.stringify({
    message: payload.message,
    agent: payload.agent,
    narrative: formatSseChunk(payload),
    engineStatus: payload.engineStatus,
    timestamp: new Date().toISOString(),
  })}\n\n`;
  controller.enqueue(encoder.encode(chunk));
}

export async function POST(request: Request) {
  const subscriptionBlock = await enforceSubscriptionGate(request);
  if (subscriptionBlock) return subscriptionBlock;

  if (await shouldEnforceQuotaGate(request)) {
    return NextResponse.json(QUOTA_EXCEEDED_BODY, { status: 429 });
  }

  let objective =
    "Synchronize enterprise CRM vectors and dispatch quota-aware autonomous agent tasks";

  try {
    const body = (await request.json()) as { objective?: string };
    if (body.objective?.trim()) {
      objective = body.objective.trim();
    }
  } catch {
    // Use default objective when body is empty or invalid.
  }

  const result = await launchOrchestratorCycle(objective);

  if (!result.started) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    agentId: result.agentId,
    engineStatus: "PLANNING" satisfies EngineTelemetryStatus,
  });
}

export async function GET(request: Request) {
  const subscriptionBlock = await enforceSubscriptionGate(request);
  if (subscriptionBlock) return subscriptionBlock;

  if (await shouldEnforceQuotaGate(request)) {
    return NextResponse.json(QUOTA_EXCEEDED_BODY, { status: 429 });
  }

  const profile = await resolveRequestUser(request);

  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const push = (payload: {
        message: string;
        agent?: string;
        narrative?: string;
        engineStatus?: EngineTelemetryStatus;
      }) => {
        if (closed) return;
        pushSseEvent(encoder, controller, payload);
      };

      getRecentOrchestratorNarratives().forEach((event) => {
        push({
          message: event.message,
          agent: event.agent,
          narrative: formatOrchestratorSseLine(event),
          engineStatus: event.engineStatus,
        });
      });

      unsubscribe = subscribeOrchestratorNarratives((event) => {
        push({
          message: event.message,
          agent: event.agent,
          narrative: formatOrchestratorSseLine(event),
          engineStatus: event.engineStatus,
        });
      });

      push({
        message: profile.isSuperAdmin
          ? "SSE telemetry bus connected — SUPER_ADMIN quota bypass active. Unlimited stream execution enabled."
          : "SSE telemetry bus connected — awaiting orchestrator narratives.",
        agent: "SYSTEM_NODE",
        engineStatus: "IDLE",
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        unsubscribe = null;
        abortActiveOrchestratorRun();
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
      abortActiveOrchestratorRun();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
