import { NextRequest, NextResponse } from "next/server";

// ─── Types ───────────────────────────────────────────────────────────────────

type StreamEventStatus = "running" | "completed" | "error";

type AgentStreamEvent = {
  step: number;
  message: string;
  status: StreamEventStatus;
  timestamp: string;
  runId: string;
  node?: string;
  durationMs?: number;
};

type ErrorResponse = {
  success: false;
  error: string;
  code: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SIMULATED_EXECUTION_STEPS = [
  {
    node: "SHOPIFY_CONNECTOR",
    message: "Initializing Shopify Workspace Connection",
    durationMs: 420,
  },
  {
    node: "LEDGER_AUDITOR",
    message: "Auditing multi-rail ledger processing records",
    durationMs: 1180,
  },
  {
    node: "RECONCILIATION_ENGINE",
    message: "Reconciling cross-platform settlement batches",
    durationMs: 860,
  },
  {
    node: "PIPELINE_GUARD",
    message: "Execution pipeline finalized safely",
    durationMs: 310,
  },
] as const;

const STEP_INTERVAL_MS = 750;

function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 10);
  return `ss-stream-${timestamp}-${entropy}`;
}

function formatSsePayload(payload: AgentStreamEvent): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function jsonError(
  error: string,
  code: string,
  status: number
): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

function methodNotAllowed(): NextResponse<ErrorResponse> {
  return jsonError(
    "Method not allowed. This endpoint only accepts GET requests.",
    "METHOD_NOT_ALLOWED",
    405
  );
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  const runId = generateRunId();
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stepIndex = 0;

      const closeStream = () => {
        if (closed) {
          return;
        }
        closed = true;

        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }

        try {
          controller.close();
        } catch {
          // Stream may already be closed if the client disconnected.
        }
      };

      const pushEvent = (event: AgentStreamEvent) => {
        if (closed || request.signal.aborted) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(formatSsePayload(event)));
        } catch {
          closeStream();
        }
      };

      const onAbort = () => {
        closeStream();
      };

      request.signal.addEventListener("abort", onAbort, { once: true });

      pushEvent({
        step: 0,
        message: "Agent stream connected — beginning simulated execution loop",
        status: "running",
        timestamp: new Date().toISOString(),
        runId,
        node: "STREAM_GATEWAY",
      });

      intervalId = setInterval(() => {
        if (closed || request.signal.aborted) {
          closeStream();
          return;
        }

        const currentStep = SIMULATED_EXECUTION_STEPS[stepIndex];
        if (!currentStep) {
          closeStream();
          return;
        }

        stepIndex += 1;

        const isFinalStep = stepIndex === SIMULATED_EXECUTION_STEPS.length;

        pushEvent({
          step: stepIndex,
          message: currentStep.message,
          status: isFinalStep ? "completed" : "running",
          timestamp: new Date().toISOString(),
          runId,
          node: currentStep.node,
          durationMs: currentStep.durationMs,
        });

        if (isFinalStep) {
          closeStream();
        }
      }, STEP_INTERVAL_MS);
    },
    cancel() {
      closed = true;

      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}

export async function PUT(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}

export async function PATCH(): Promise<NextResponse<ErrorResponse>> {
  return methodNotAllowed();
}
