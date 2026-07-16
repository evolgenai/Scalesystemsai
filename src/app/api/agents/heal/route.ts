import { NextResponse } from "next/server";
import type { AppErrorLog } from "@prisma/client";
import { z } from "zod";
import { proposeHealPatch } from "@/lib/agents/healAgent";
import {
  extractAgentToken,
  verifyAgentEdgeToken,
} from "@/lib/security/edgeToken";
import { getPrisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace/resolveWorkspace";
import { dispatchHealNotifications } from "@/lib/telemetry/healNotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorBody = { success: false; error: string; code: string };

type HealHealthy = {
  success: true;
  healthy: true;
  message: string;
};

type HealRemediated = {
  success: true;
  healthy: false;
  error: AppErrorLog;
  proposal: {
    targetFile: string;
    patch: string;
    explanation: string;
    filesWritten?: string[];
  };
  toolCalls: string[];
  phases: Array<"supervisor" | "writer" | "validator">;
  validatorApproved: boolean;
  mcpHostsConnected: number;
  toolsAvailable: string[];
  workspaceId: string | null;
  workspaceName: string | null;
  estateToolsEnabled: boolean;
  notifications: string[];
};

const OptionalBodySchema = z
  .object({
    workspaceId: z.string().uuid().optional().nullable(),
    errorId: z.string().uuid().optional(),
  })
  .partial();

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ success: false, error, code } satisfies ErrorBody, {
    status,
  });
}

async function requireHealAuth(request: Request): Promise<NextResponse | null> {
  const gate = request.headers.get("x-agent-auth")?.trim();
  if (gate === "verified") return null;

  const token = extractAgentToken(request);
  if (token) {
    const verdict = await verifyAgentEdgeToken(token);
    if (verdict.ok) return null;
    return jsonError(verdict.reason, "AGENT_TOKEN_INVALID", 401);
  }

  return jsonError(
    "Unauthorized. /api/agents/heal requires a verified agent token.",
    "HEAL_UNAUTHORIZED",
    401
  );
}

/**
 * POST /api/agents/heal — multi-agent supervisor → writer → validator.
 * Optional workspace scope via x-workspace-key / x-workspace-id / body.workspaceId.
 */
export async function POST(
  request: Request
): Promise<NextResponse<HealHealthy | HealRemediated | ErrorBody>> {
  const denied = await requireHealAuth(request);
  if (denied) return denied;

  let bodyWorkspaceId: string | null | undefined;
  let errorId: string | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const raw = JSON.parse(text) as unknown;
      const parsed = OptionalBodySchema.safeParse(raw);
      if (parsed.success) {
        bodyWorkspaceId = parsed.data.workspaceId;
        errorId = parsed.data.errorId;
      }
    }
  } catch {
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const prisma = getPrisma();

  try {
    const workspaceId = await resolveWorkspaceId(request, bodyWorkspaceId);

    const latest = errorId
      ? await prisma.appErrorLog.findFirst({
          where: {
            id: errorId,
            resolved: false,
            ...(workspaceId ? { workspaceId } : {}),
          },
        })
      : await prisma.appErrorLog.findFirst({
          where: {
            resolved: false,
            ...(workspaceId ? { workspaceId } : {}),
          },
          orderBy: { createdAt: "desc" },
        });

    if (!latest) {
      return NextResponse.json({
        success: true,
        healthy: true,
        message: workspaceId
          ? "Workspace healthy — no unresolved AppErrorLog entries."
          : "System healthy — no unresolved AppErrorLog entries.",
      });
    }

    const proposal = await proposeHealPatch({
      route: latest.route,
      errorMessage: latest.errorMessage,
      stackTrace: latest.stackTrace,
      workspaceId: latest.workspaceId ?? workspaceId,
    });

    const updated = await prisma.appErrorLog.updateMany({
      where: { id: latest.id, resolved: false },
      data: {
        resolved: proposal.validatorApproved,
        patchApplied: proposal.patch,
        explanation: [
          `phases: ${proposal.phases.join(" → ")}`,
          `validatorApproved: ${proposal.validatorApproved}`,
          `targetFile: ${proposal.targetFile}`,
          `toolCalls: ${JSON.stringify(proposal.toolCalls)}`,
          proposal.explanation,
        ].join("\n\n"),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({
        success: true,
        healthy: true,
        message: "Error was already remediated by another healer loop.",
      });
    }

    const row = await prisma.appErrorLog.findUniqueOrThrow({
      where: { id: latest.id },
    });

    let notifications: string[] = [];
    if (proposal.validatorApproved) {
      try {
        const notify = await dispatchHealNotifications({
          route: latest.route,
          errorMessage: latest.errorMessage,
          patch: proposal.patch,
          validatorStatus: "APPROVED",
          targetFile: proposal.targetFile,
          workspaceName: proposal.workspaceName,
        });
        notifications = notify.logs;
      } catch (err) {
        console.error("[agents/heal] notify failed:", err);
        notifications = ["whatsapp: failed", "telegram: failed", "webhook: failed"];
      }
    }

    return NextResponse.json({
      success: true,
      healthy: false,
      error: row,
      proposal: {
        targetFile: proposal.targetFile,
        patch: proposal.patch,
        explanation: proposal.explanation,
        filesWritten: proposal.filesWritten,
      },
      toolCalls: proposal.toolCalls,
      phases: proposal.phases,
      validatorApproved: proposal.validatorApproved,
      mcpHostsConnected: proposal.mcpHostsConnected,
      toolsAvailable: proposal.toolsAvailable,
      workspaceId: latest.workspaceId ?? workspaceId,
      workspaceName: proposal.workspaceName,
      estateToolsEnabled: proposal.estateToolsEnabled,
      notifications,
    });
  } catch (err) {
    console.error("[agents/heal] failed:", err);
    return jsonError(
      err instanceof Error ? err.message : "Heal pipeline failed.",
      "HEAL_PIPELINE_FAILED",
      503
    );
  }
}
