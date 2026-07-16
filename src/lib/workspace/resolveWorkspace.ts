import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";

export function generateWorkspaceApiKey(): string {
  return `ws_${randomBytes(24).toString("hex")}`;
}

/** Resolve workspace from x-workspace-key / x-workspace-id / body.workspaceId. */
export async function resolveWorkspaceId(
  request: Request,
  bodyWorkspaceId?: string | null
): Promise<string | null> {
  const prisma = getPrisma();

  const apiKey =
    request.headers.get("x-workspace-key")?.trim() ||
    request.headers.get("x-workspace-api-key")?.trim();
  if (apiKey) {
    const ws = await prisma.workspace.findUnique({
      where: { apiKey },
      select: { id: true },
    });
    return ws?.id ?? null;
  }

  const headerId = request.headers.get("x-workspace-id")?.trim();
  const id = bodyWorkspaceId?.trim() || headerId;
  if (!id) return null;

  const ws = await prisma.workspace.findUnique({
    where: { id },
    select: { id: true },
  });
  return ws?.id ?? null;
}
