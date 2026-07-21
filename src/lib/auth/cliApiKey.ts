/**
 * CLI API key authentication — hash lookup against ApiKey, workspace-scoped.
 * Never logs or returns raw key material after mint.
 */

import { randomBytes } from "node:crypto";
import { hashCliApiKey } from "@/lib/billing/gasMeter";
import { withPrisma } from "@/lib/prisma";

export type CliAuthOk = {
  ok: true;
  workspaceId: string;
  apiKeyId: string;
  keyName: string;
};

export type CliAuthDenied = {
  ok: false;
  code: "CLI_KEY_REQUIRED" | "CLI_KEY_INVALID";
  message: string;
  status: 401;
};

export type CliAuthResult = CliAuthOk | CliAuthDenied;

export function generateCliApiKey(): string {
  const entropy = randomBytes(32).toString("hex");
  return `ss_cli_${entropy.slice(0, 8)}_${entropy.slice(8, 24)}_${entropy.slice(24)}`;
}

export function extractCliApiKey(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.trim() ?? "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }
  const header =
    request.headers.get("x-cli-key")?.trim() ||
    request.headers.get("x-api-key")?.trim() ||
    "";
  return header || null;
}

/**
 * Authenticate a CLI request via hashed ApiKey. Updates lastUsedAt on success.
 */
export async function resolveCliApiKeyGate(
  request: Request
): Promise<CliAuthResult> {
  const raw = extractCliApiKey(request);
  if (!raw) {
    return {
      ok: false,
      code: "CLI_KEY_REQUIRED",
      message: "CLI API key required (Authorization: Bearer or x-cli-key).",
      status: 401,
    };
  }

  const keyHash = hashCliApiKey(raw);
  const row = await withPrisma(
    (db) =>
      db.apiKey.findUnique({
        where: { keyHash },
        select: {
          id: true,
          name: true,
          workspaceId: true,
        },
      }),
    "cli.apiKey.lookup"
  );

  if (!row) {
    return {
      ok: false,
      code: "CLI_KEY_INVALID",
      message: "CLI API key is invalid.",
      status: 401,
    };
  }

  await withPrisma(
    (db) =>
      db.apiKey.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      }),
    "cli.apiKey.touch"
  );

  return {
    ok: true,
    workspaceId: row.workspaceId,
    apiKeyId: row.id,
    keyName: row.name,
  };
}
