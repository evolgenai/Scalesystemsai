import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FunnelBody = {
  event?: string;
  path?: string;
  plan?: string;
  provider?: string;
  ts?: string;
  metadata?: Record<string, unknown>;
};

const globalFunnel = globalThis as unknown as {
  __scaleFunnelEvents?: FunnelBody[];
};

function store(): FunnelBody[] {
  if (!globalFunnel.__scaleFunnelEvents) {
    globalFunnel.__scaleFunnelEvents = [];
  }
  return globalFunnel.__scaleFunnelEvents;
}

/**
 * Lightweight analytics sink for UX funnel drop-offs.
 * Keeps an in-memory ring buffer (serverless-safe for short windows)
 * and mirrors important events to stdout for ops visibility.
 */
export async function POST(request: Request) {
  let body: FunnelBody = {};
  try {
    body = (await request.json()) as FunnelBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.event || typeof body.event !== "string") {
    return NextResponse.json({ ok: false, error: "Missing event" }, { status: 400 });
  }

  const entry: FunnelBody = {
    event: body.event.slice(0, 80),
    path: body.path?.slice(0, 200),
    plan: body.plan?.slice(0, 40),
    provider: body.provider?.slice(0, 40),
    ts: body.ts ?? new Date().toISOString(),
    metadata: body.metadata,
  };

  const buffer = store();
  buffer.push(entry);
  if (buffer.length > 500) buffer.shift();

  console.info("[funnel]", JSON.stringify(entry));

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    count: store().length,
    recent: store().slice(-25),
  });
}
