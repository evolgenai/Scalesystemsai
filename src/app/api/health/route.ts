/**
 * GET /api/health — public production health gateway.
 * Probes: PostgreSQL, Vercel Blob readiness, Discord webhook dispatch readiness.
 */

import { head, BlobNotFoundError } from "@vercel/blob";
import { withPrisma } from "@/lib/prisma";
import { assertPublicHttpUrl } from "@/lib/security/ssrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVER_START_MS = Date.now();

type ServiceFlags = {
  db: boolean;
  blob: boolean;
  discord: boolean;
};

async function probeDatabase(): Promise<boolean> {
  try {
    await withPrisma(async (db) => {
      await db.$queryRaw`SELECT 1`;
    }, "health.db");
    return true;
  } catch {
    return false;
  }
}

async function probeBlob(): Promise<boolean> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return false;

  try {
    await head("health/probe", { token });
    return true;
  } catch (err) {
    // Object missing but token/auth path works → service ready.
    if (err instanceof BlobNotFoundError) return true;
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("not found") || message.includes("404")) return true;
    return false;
  }
}

function resolveDiscordWebhook(): string | null {
  const url =
    process.env.DISCORD_SRE_WEBHOOK_URL?.trim() ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL?.trim() ||
    "";
  return url || null;
}

async function probeDiscord(): Promise<boolean> {
  const webhook = resolveDiscordWebhook();
  if (!webhook) {
    // Local/dev without webhook is not production-ready for dispatch.
    return process.env.NODE_ENV !== "production";
  }

  try {
    const parsed = assertPublicHttpUrl(webhook, {
      allowLoopback: process.env.NODE_ENV !== "production",
    });
    if (!parsed.hostname.includes("discord")) return false;

    // Readiness only — GET webhook metadata (does not post a message).
    const res = await fetch(parsed.toString(), {
      method: "GET",
      headers: { "user-agent": "ScaleSystems-Health/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    // Discord returns 200 with webhook JSON when the URL is valid.
    return res.ok || res.status === 401 || res.status === 403;
  } catch {
    return false;
  }
}

export async function GET() {
  const [db, blob, discord] = await Promise.all([
    probeDatabase(),
    probeBlob(),
    probeDiscord(),
  ]);

  const services: ServiceFlags = { db, blob, discord };
  const allHealthy = db && blob && discord;
  const status = allHealthy ? "HEALTHY" : "DEGRADED";
  const uptimeMs = Date.now() - SERVER_START_MS;

  return Response.json(
    {
      status,
      uptimeMs,
      services,
    },
    {
      status: allHealthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}
