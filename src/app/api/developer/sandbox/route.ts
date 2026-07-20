import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  developerGateJson,
  resolveDeveloperGate,
  assertWorkspaceAuthLevel,
} from "@/lib/auth/developerGate";
import { getPrisma } from "@/lib/prisma";
import { resolveWorkspaceGate } from "@/lib/auth/workspaceGate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SandboxMetricPostSchema = z.object({
  runtimeId: z.string().min(1).max(128),
  workspaceId: z.string().uuid().optional().nullable(),
  language: z
    .enum(["javascript", "python", "container", "other"])
    .optional()
    .nullable(),
  cpuMs: z.number().int().min(0).max(3_600_000).default(0),
  memoryMbPeak: z.number().int().min(0).max(65_536).default(0),
  diskMb: z.number().int().min(0).max(1_048_576).default(0),
  exitCode: z.number().int().min(-128).max(255).optional().nullable(),
  status: z
    .enum(["active", "completed", "failed", "killed"])
    .default("completed"),
  startedAt: z.string().datetime().optional().nullable(),
  endedAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/developer/sandbox
 * Aggregate sandbox resource usage for the authenticated DeveloperAccount.
 */
export async function GET(request: Request) {
  const gate = await resolveDeveloperGate(request, "sandbox");
  if (!gate.ok) {
    return NextResponse.json(developerGateJson(gate), { status: 403 });
  }

  const url = new URL(request.url);
  const runtimeId = url.searchParams.get("runtimeId")?.trim() || undefined;
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 200)
    : 50;

  if (gate.developerAccountId.startsWith("superadmin:")) {
    return NextResponse.json({
      success: true,
      developerAccountId: gate.developerAccountId,
      totals: {
        runs: 0,
        cpuMs: 0,
        memoryMbPeakMax: 0,
        diskMb: 0,
      },
      metrics: [],
      note: "SUPER_ADMIN bypass — no DeveloperAccount row bound.",
    });
  }

  const prisma = getPrisma();
  const where = {
    developerAccountId: gate.developerAccountId,
    ...(runtimeId ? { runtimeId } : {}),
  };

  const [metrics, aggregate] = await Promise.all([
    prisma.sandboxRuntimeMetric.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        runtimeId: true,
        workspaceId: true,
        language: true,
        cpuMs: true,
        memoryMbPeak: true,
        diskMb: true,
        exitCode: true,
        status: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
      },
    }),
    prisma.sandboxRuntimeMetric.aggregate({
      where: { developerAccountId: gate.developerAccountId },
      _count: { _all: true },
      _sum: { cpuMs: true, diskMb: true },
      _max: { memoryMbPeak: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    developerAccountId: gate.developerAccountId,
    accountKind: gate.accountKind,
    totals: {
      runs: aggregate._count._all,
      cpuMs: aggregate._sum.cpuMs ?? 0,
      memoryMbPeakMax: aggregate._max.memoryMbPeak ?? 0,
      diskMb: aggregate._sum.diskMb ?? 0,
    },
    metrics,
  });
}

/**
 * POST /api/developer/sandbox
 * Record sandbox / virtual runtime resource telemetry for a developer id.
 */
export async function POST(request: Request) {
  const gate = await resolveDeveloperGate(request, "script_compilation");
  if (!gate.ok) {
    return NextResponse.json(developerGateJson(gate), { status: 403 });
  }

  if (gate.developerAccountId.startsWith("superadmin:")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "SUPER_ADMIN must bind a DeveloperAccount before recording sandbox metrics.",
        code: "DEVELOPER_ACCOUNT_REQUIRED",
      },
      { status: 400 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = SandboxMetricPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid sandbox metric payload.",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const body = parsed.data;
  let workspaceId: string | null = body.workspaceId ?? null;

  if (workspaceId) {
    const wsGate = await resolveWorkspaceGate(request, workspaceId, {
      requireWorkspace: true,
    });
    if (!wsGate.ok) {
      return NextResponse.json(
        {
          success: false,
          error: wsGate.message,
          code: wsGate.code,
        },
        { status: wsGate.status }
      );
    }

    const workspace = await getPrisma().workspace.findUnique({
      where: { id: wsGate.workspaceId },
      select: { id: true, requiredAuthLevel: true },
    });

    if (!workspace) {
      return NextResponse.json(
        {
          success: false,
          error: "Workspace not found.",
          code: "WORKSPACE_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    const levelGate = assertWorkspaceAuthLevel(
      gate,
      workspace.requiredAuthLevel,
      workspace.requiredAuthLevel === "CONTAINER_ORCHESTRATION"
        ? "container_orchestration"
        : "script_compilation"
    );
    if (!levelGate.ok) {
      return NextResponse.json(developerGateJson(levelGate), { status: 403 });
    }

    workspaceId = workspace.id;
  }

  const metric = await getPrisma().sandboxRuntimeMetric.create({
    data: {
      developerAccountId: gate.developerAccountId,
      workspaceId,
      runtimeId: body.runtimeId,
      language: body.language ?? null,
      cpuMs: body.cpuMs,
      memoryMbPeak: body.memoryMbPeak,
      diskMb: body.diskMb,
      exitCode: body.exitCode ?? null,
      status: body.status,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
      metadataJson: (body.metadata ?? {}) as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      developerAccountId: true,
      workspaceId: true,
      runtimeId: true,
      language: true,
      cpuMs: true,
      memoryMbPeak: true,
      diskMb: true,
      exitCode: true,
      status: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      success: true,
      metric,
    },
    { status: 201 }
  );
}
