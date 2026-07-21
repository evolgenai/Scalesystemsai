/**
 * POST /api/cli/deploy — push blueprint JSON from a local CLI repo into the workspace DB.
 * Auth: CLI ApiKey (Authorization: Bearer ss_cli_… or x-cli-key).
 * Tenant isolation: blueprint always written to the key's workspaceId.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCliApiKeyGate } from "@/lib/auth/cliApiKey";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { apiError } from "@/lib/http/apiResponse";
import { withPrisma } from "@/lib/prisma";
import {
  CreateWorkflowSchema,
  parseGraphJson,
} from "@/lib/swarm/workflowRunner";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DeployBlueprintSchema = CreateWorkflowSchema.extend({
  /** When set, upsert into an existing tenant-bound blueprint. */
  id: z.string().trim().min(1).max(128).optional(),
  /** Optional local repo path metadata (not persisted as a column). */
  sourcePath: z.string().trim().max(1024).optional(),
});

export async function POST(request: Request) {
  const auth = await resolveCliApiKeyGate(request);
  if (!auth.ok) {
    return apiError(auth.message, auth.code, auth.status);
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(request);
  } catch {
    return apiError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = DeployBlueprintSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ?? "Invalid blueprint payload.",
      "INVALID_BODY",
      400
    );
  }

  const body = parsed.data;

  try {
    // Validate graph shape before any write.
    parseGraphJson(body.nodes, body.edges);

    const blueprint = await withPrisma(async (db) => {
      if (body.id) {
        const existing = await db.workflowBlueprint.findFirst({
          where: {
            id: body.id,
            workspaceId: auth.workspaceId,
          },
          select: { id: true },
        });

        if (!existing) {
          return null;
        }

        return db.workflowBlueprint.update({
          where: { id: existing.id },
          data: {
            title: body.title,
            description: body.description ?? null,
            nodes: body.nodes as unknown as Prisma.InputJsonValue,
            edges: body.edges as unknown as Prisma.InputJsonValue,
            status: body.status,
          },
        });
      }

      return db.workflowBlueprint.create({
        data: {
          workspaceId: auth.workspaceId,
          title: body.title,
          description: body.description ?? null,
          nodes: body.nodes as unknown as Prisma.InputJsonValue,
          edges: body.edges as unknown as Prisma.InputJsonValue,
          status: body.status,
        },
      });
    }, "cli.deploy.blueprint");

    if (!blueprint) {
      return apiError(
        "Blueprint not found in this workspace.",
        "BLUEPRINT_NOT_FOUND",
        404
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: blueprint.id,
          workspaceId: blueprint.workspaceId,
          title: blueprint.title,
          status: blueprint.status,
          nodeCount: Array.isArray(blueprint.nodes)
            ? blueprint.nodes.length
            : 0,
          edgeCount: Array.isArray(blueprint.edges)
            ? blueprint.edges.length
            : 0,
          updatedAt: blueprint.updatedAt,
          createdAt: blueprint.createdAt,
          sourcePath: body.sourcePath ?? null,
          deployedByKey: auth.keyName,
        },
      },
      {
        status: body.id ? 200 : 201,
        headers: {
          "cache-control": "no-store",
          "x-workspace-id": auth.workspaceId,
          "x-workflow-id": blueprint.id,
          "x-cli-key-id": auth.apiKeyId,
        },
      }
    );
  } catch (err) {
    console.error("[api/cli/deploy] POST failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to deploy blueprint.",
      "CLI_DEPLOY_FAILED",
      503
    );
  }
}
